// GET /ws?ticket=… — the session WebSocket (STORY-09). Browsers authenticate
// with a one-time ticket minted by POST /sessions (the BA cookie isn't sent
// cross-subdomain to api.*). A valid ticket binds the connection to a session
// room; `{type:'prompt'}` drives the agent and streams `agent_event`s back.
// Ping/pong (STORY-05) is preserved.

import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { createBunWebSocket } from 'hono/bun';
import type { ServerWebSocket } from 'bun';

import { sessions } from '@praxis/db';
import { db } from '@praxis/db/client';
import type { FileEvent } from '@praxis/sandbox';

import { handleFileList, handleFileRead, handleFileSave } from '../file-ops';
import {
  acquireLock,
  cursorFrame,
  presenceFrame,
  releaseAbandonedLocks,
  setMemberFile,
} from '../presence-ops';
import { logger } from '../logger';
import { removePreview } from '../preview';
import {
  consumeTicket,
  deleteRoom,
  getAcpHost,
  getRoom,
  getSandbox,
  type SessionRoom,
} from '../runtime';

interface ConnectionState {
  id: string;
  sessionId: string;
  userId: string;
  userName: string;
  userImage: string | null;
  messageCount: number;
}

const conns = new WeakMap<ServerWebSocket<unknown>, ConnectionState>();

function send(ws: { send: (data: string) => void }, payload: unknown): void {
  ws.send(JSON.stringify(payload));
}

/** Fan a payload out to every socket currently in the room (file_changed). */
function broadcast(room: SessionRoom | undefined, payload: unknown): void {
  if (!room) return;
  for (const sock of room.sockets) send(sock, payload);
}

/** Fan out to every socket in the room except one (STORY-32) — used to echo a
 *  user's prompt to their peers without double-rendering it for the sender, who
 *  already shows it optimistically. */
function broadcastExcept(
  room: SessionRoom | undefined,
  except: ServerWebSocket<unknown>,
  payload: unknown,
): void {
  if (!room) return;
  for (const sock of room.sockets) if (sock !== except) send(sock, payload);
}

/** Broadcast the room's full presence roster (STORY-11). Sent on join/leave and
 *  whenever a member's open file changes, so every client has the live member
 *  list (avatar + name) and who's viewing what. */
function broadcastPresence(room: SessionRoom | undefined): void {
  if (!room) return;
  broadcast(room, presenceFrame(room));
}

/** Start the per-room sandbox file watcher once (on the first socket join), so
 *  inotify changes in /workspace broadcast to the room as file_changed. */
function ensureWatcher(sessionId: string): void {
  const room = getRoom(sessionId);
  if (!room || room.unwatchFiles) return;
  try {
    room.unwatchFiles = getSandbox().watchFiles(room.handle, (e: FileEvent) => {
      broadcast(getRoom(sessionId), { type: 'file_changed', change: e.type, path: e.path });
    });
  } catch (err) {
    logger.warn(
      { sessionId, err: err instanceof Error ? err.message : String(err) },
      'ws.watch_failed',
    );
  }
}

export const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket<unknown>>();

export const wsRoute = new Hono();

wsRoute.get(
  '/',
  upgradeWebSocket((c) => {
    // Consumed once per upgrade (single-use). null → reject in onOpen.
    const claim = consumeTicket(c.req.query('ticket') ?? '');

    return {
      onOpen: (_evt, ws) => {
        if (!claim) {
          send(ws, { type: 'error', reason: 'invalid_ticket' });
          ws.close(4401, 'invalid_ticket');
          return;
        }
        const room = getRoom(claim.sessionId);
        if (!room) {
          send(ws, { type: 'error', reason: 'no_session' });
          ws.close(4404, 'no_session');
          return;
        }
        const id = crypto.randomUUID();
        if (ws.raw) {
          conns.set(ws.raw, {
            id,
            sessionId: claim.sessionId,
            userId: claim.userId,
            userName: claim.userName,
            userImage: claim.userImage,
            messageCount: 0,
          });
          room.sockets.add(ws.raw);
          room.members.set(id, {
            connId: id,
            userId: claim.userId,
            userName: claim.userName,
            userImage: claim.userImage,
          });
        }
        ensureWatcher(claim.sessionId);
        logger.info({ wsConnId: id, sessionId: claim.sessionId }, 'ws.open');
        send(ws, { type: 'ready', sessionId: claim.sessionId, connId: id });
        broadcastPresence(room);
      },

      onMessage: async (evt, ws) => {
        const raw = ws.raw;
        const state = raw ? conns.get(raw) : undefined;
        if (!state) return; // never authenticated
        state.messageCount += 1;

        let msg: unknown;
        try {
          msg = JSON.parse(String(evt.data));
        } catch {
          send(ws, { type: 'error', reason: 'invalid_json' });
          return;
        }
        if (typeof msg !== 'object' || msg === null || !('type' in msg)) {
          send(ws, { type: 'error', reason: 'missing_type' });
          return;
        }

        const type = (msg as { type: unknown }).type;
        if (type === 'ping') {
          send(ws, { type: 'pong', ts: Date.now() });
          return;
        }
        if (type === 'prompt') {
          await runPrompt(ws, raw, state, (msg as { text?: unknown }).text);
          return;
        }
        if (type === 'file_list' || type === 'file_read' || type === 'file_save') {
          const room = getRoom(state.sessionId);
          if (!room) {
            send(ws, { type: 'error', reason: 'no_session' });
            return;
          }
          const reply = (payload: unknown) => send(ws, payload);
          const m = msg as { path?: unknown; content?: unknown };
          if (type === 'file_list') await handleFileList(reply, getSandbox(), room.handle);
          else if (type === 'file_read')
            await handleFileRead(reply, getSandbox(), room.handle, m.path);
          else await handleFileSave(reply, getSandbox(), room.handle, m.path, m.content);
          return;
        }
        if (type === 'file_open' || type === 'cursor') {
          handlePresence(ws, state, type, msg);
          return;
        }

        send(ws, { type: 'error', reason: 'unknown_type' });
      },

      onClose: (_evt, ws) => {
        const raw = ws.raw;
        const state = raw ? conns.get(raw) : undefined;
        if (!state || !raw) return;
        const room = getRoom(state.sessionId);
        if (room) {
          room.sockets.delete(raw);
          room.members.delete(state.id);
          // Free any file the leaving user held that no other tab still has open.
          releaseAbandonedLocks(room, state.userId);
          if (room.sockets.size === 0) endSession(state.sessionId);
          else broadcastPresence(room);
        }
        logger.info({ wsConnId: state.id, sessionId: state.sessionId }, 'ws.close');
      },
    };
  }),
);

async function runPrompt(
  ws: { send: (data: string) => void },
  senderRaw: ServerWebSocket<unknown> | undefined,
  state: ConnectionState,
  text: unknown,
): Promise<void> {
  const room = getRoom(state.sessionId);
  if (!room) {
    send(ws, { type: 'error', reason: 'no_session' });
    return;
  }
  if (typeof text !== 'string' || text.trim().length === 0) {
    send(ws, { type: 'error', reason: 'empty_prompt' });
    return;
  }

  // Shared chat (STORY-32): the prompting user + the agent's stream are part of
  // the room's conversation, so both cross to every peer. The prompt echoes to
  // peers only (the sender renders it optimistically); agent events fan out to
  // the whole room, each stamped with the prompting user so clients attribute it.
  const author = { name: state.userName, image: state.userImage };
  if (senderRaw) {
    broadcastExcept(room, senderRaw, { type: 'user_prompt', text, author });
  }

  try {
    for await (const event of getAcpHost().spawnAndPrompt(
      getSandbox(),
      room.handle,
      room.apiKey,
      text,
      { onPermission: async () => 'allow' },
    )) {
      broadcast(room, { type: 'agent_event', event, author });
    }
  } catch (err) {
    logger.error(
      { sessionId: state.sessionId, err: err instanceof Error ? err.message : String(err) },
      'ws.prompt_failed',
    );
    // Surface the failure in everyone's transcript (it's the shared turn) without
    // disabling any peer's input — an agent error is a message, not a dead session.
    broadcast(room, {
      type: 'agent_event',
      event: { type: 'error', message: 'Agent error' },
      author,
    });
  }
}

/** Presence/cursor messages (STORY-11/TASK-033). `file_open` records which file a
 *  member is viewing (drives the roster + cursor scoping); `cursor` relays a live
 *  caret position to the rest of the room, tagged with the sender's identity. */
function handlePresence(
  ws: { send: (data: string) => void },
  state: ConnectionState,
  type: 'file_open' | 'cursor',
  msg: unknown,
): void {
  const room = getRoom(state.sessionId);
  if (!room) {
    send(ws, { type: 'error', reason: 'no_session' });
    return;
  }

  if (type === 'file_open') {
    const path = (msg as { path?: unknown }).path;
    setMemberFile(room, state.id, path);
    // Drop any lock this user no longer has open, then take the new file (soft,
    // first-writer-wins). A failed acquire just means a peer holds it — the
    // client renders read-only off the lock state in the presence frame.
    releaseAbandonedLocks(room, state.userId);
    if (typeof path === 'string') acquireLock(room, state.userId, path);
    broadcastPresence(room);
    return;
  }

  // cursor — relay to peers, stamped with who sent it (null = malformed/gone).
  const frame = cursorFrame(room, state.id, msg);
  if (frame) broadcast(room, frame);
}

// Last client left the room → stop the sandbox (snapshots to MinIO, ADR-0008)
// and mark the session ended. Best-effort; the idle sweep is the backstop.
function endSession(sessionId: string): void {
  const room = getRoom(sessionId);
  if (!room) return;
  room.unwatchFiles?.();
  removePreview(room.projectId); // preview URL revoked → /caddy/ask + proxy 404
  deleteRoom(sessionId);
  void (async () => {
    try {
      await getSandbox().stop(room.handle);
      await db.update(sessions).set({ endedAt: new Date() }).where(eq(sessions.id, sessionId));
      logger.info({ sessionId }, 'session.ended');
    } catch (err) {
      logger.warn(
        { sessionId, err: err instanceof Error ? err.message : String(err) },
        'session.end_failed',
      );
    }
  })();
}
