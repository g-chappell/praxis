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
          conns.set(ws.raw, { id, sessionId: claim.sessionId, messageCount: 0 });
          room.sockets.add(ws.raw);
        }
        ensureWatcher(claim.sessionId);
        logger.info({ wsConnId: id, sessionId: claim.sessionId }, 'ws.open');
        send(ws, { type: 'ready', sessionId: claim.sessionId });
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
          await runPrompt(ws, state, (msg as { text?: unknown }).text);
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

        send(ws, { type: 'error', reason: 'unknown_type' });
      },

      onClose: (_evt, ws) => {
        const raw = ws.raw;
        const state = raw ? conns.get(raw) : undefined;
        if (!state || !raw) return;
        const room = getRoom(state.sessionId);
        if (room) {
          room.sockets.delete(raw);
          if (room.sockets.size === 0) endSession(state.sessionId);
        }
        logger.info({ wsConnId: state.id, sessionId: state.sessionId }, 'ws.close');
      },
    };
  }),
);

async function runPrompt(
  ws: { send: (data: string) => void },
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

  try {
    for await (const event of getAcpHost().spawnAndPrompt(
      getSandbox(),
      room.handle,
      room.apiKey,
      text,
      { onPermission: async () => 'allow' },
    )) {
      send(ws, { type: 'agent_event', event });
    }
  } catch (err) {
    logger.error(
      { sessionId: state.sessionId, err: err instanceof Error ? err.message : String(err) },
      'ws.prompt_failed',
    );
    send(ws, { type: 'error', reason: 'agent_error' });
  }
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
