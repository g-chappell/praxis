// Shared session runtime for the orchestrator (STORY-09): the single
// DockerSandbox + AcpHost the whole process uses, plus the in-memory session
// rooms and the one-time WS tickets that authenticate browser connections.
//
// Single-instance POC: rooms + tickets live in memory. A multi-instance
// orchestrator would move these to Redis/Postgres (future).

import { ClaudeAcpHost } from '@praxis/acp-host';
import {
  DockerSandbox,
  MinioObjectStore,
  type SandboxHandle,
  type Unsubscribe,
} from '@praxis/sandbox';
import type { ServerWebSocket } from 'bun';

let _sandbox: DockerSandbox | undefined;

/** The process-wide DockerSandbox. Built with MinIO persistence when MINIO_* is
 *  configured (else volume-only, ADR-0008). Shared by sessions + the idle sweep. */
export function getSandbox(): DockerSandbox {
  if (!_sandbox) {
    const store = MinioObjectStore.fromEnv() ?? undefined;
    _sandbox = new DockerSandbox({
      store,
      network: process.env.PRAXIS_NETWORK,
      // Templates ship in the orchestrator image at /app/templates (Dockerfile
      // COPY templates/). Dev sets PRAXIS_TEMPLATES_DIR to the repo templates/.
      templatesDir: process.env.PRAXIS_TEMPLATES_DIR ?? '/app/templates',
    });
  }
  return _sandbox;
}

let _host: ClaudeAcpHost | undefined;

/** The process-wide ACP host (drives the in-sandbox claude-agent-acp adapter). */
export function getAcpHost(): ClaudeAcpHost {
  if (!_host) _host = new ClaudeAcpHost();
  return _host;
}

// ─── session rooms ────────────────────────────────────────────────────
/** A user connected to a room (STORY-11). One per live socket; the same user in
 *  two tabs is two members. `filePath` is the file they currently have open (for
 *  presence "viewing" + cursor scoping), undefined until they open one. */
export interface RoomMember {
  connId: string;
  userId: string;
  userName: string;
  userImage: string | null;
  filePath?: string;
}

export interface SessionRoom {
  sessionId: string;
  projectId: string;
  handle: SandboxHandle;
  // The decrypted platform API key for this session's agent. The web app (Node)
  // decrypts it via @praxis/keys and hands it over the internal POST /sessions
  // call — the orchestrator (Bun) deliberately does NOT load libsodium, which
  // doesn't run under Bun. Held in memory only; never logged.
  apiKey: string;
  sockets: Set<ServerWebSocket<unknown>>;
  // Live presence: connId → member identity (STORY-11/TASK-033). Mutated on WS
  // open/close; broadcast to the room as `presence`.
  members: Map<string, RoomMember>;
  // Soft file locks (STORY-11/TASK-034): project-relative path → owning userId.
  // First writer wins; released when the owner switches file or disconnects.
  locks: Map<string, string>;
  // Stops the per-room sandbox file watcher (started lazily when the first
  // socket joins, STORY-10/TASK-031). Called on teardown so inotifywait in the
  // container is killed. Undefined until the watcher starts.
  unwatchFiles?: Unsubscribe;
}

const rooms = new Map<string, SessionRoom>();

export function createRoom(
  sessionId: string,
  projectId: string,
  handle: SandboxHandle,
  apiKey: string,
): void {
  rooms.set(sessionId, {
    sessionId,
    projectId,
    handle,
    apiKey,
    sockets: new Set(),
    members: new Map(),
    locks: new Map(),
  });
}

export function getRoom(sessionId: string): SessionRoom | undefined {
  return rooms.get(sessionId);
}

export function deleteRoom(sessionId: string): void {
  rooms.delete(sessionId);
}

/** Tear down any in-memory rooms for a project (used when it's deleted): stop
 *  each room's file watcher and drop it. The sandbox itself is destroyed
 *  separately by the caller. */
export function purgeProjectRooms(projectId: string): void {
  for (const [sessionId, room] of rooms) {
    if (room.projectId !== projectId) continue;
    room.unwatchFiles?.();
    rooms.delete(sessionId);
  }
}

// ─── one-time WS tickets ──────────────────────────────────────────────
/** The user identity carried by a ticket and stamped onto a room member. Sourced
 *  server-side from the authenticated session (web /api/sessions) — the browser
 *  never asserts its own name/image, so presence can't be spoofed. */
export interface TicketClaim {
  sessionId: string;
  userId: string;
  userName: string;
  userImage: string | null;
}

interface Ticket extends TicketClaim {
  expiresAt: number;
}

const tickets = new Map<string, Ticket>();
const TICKET_TTL_MS = 60_000;

/** Mint a single-use, short-TTL ticket bound to a session + user. The web app
 *  (already authenticated) obtains this and the browser presents it at WS
 *  upgrade — the browser never sends a session cookie cross-subdomain. */
export function mintTicket(claim: TicketClaim): string {
  const ticket = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '');
  tickets.set(ticket, { ...claim, expiresAt: Date.now() + TICKET_TTL_MS });
  return ticket;
}

/** Validate + consume a ticket (single use). Returns the claim or null. */
export function consumeTicket(ticket: string): TicketClaim | null {
  const found = tickets.get(ticket);
  if (!found) return null;
  tickets.delete(ticket);
  if (Date.now() > found.expiresAt) return null;
  return {
    sessionId: found.sessionId,
    userId: found.userId,
    userName: found.userName,
    userImage: found.userImage,
  };
}
