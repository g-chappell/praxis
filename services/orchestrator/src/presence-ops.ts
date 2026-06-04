// Presence + cursor logic over the session socket (STORY-11/TASK-033). Kept
// separate from routes/ws.ts so it's unit-testable under Node/Vitest (ws.ts
// imports hono/bun, which only loads under Bun). These are pure functions over a
// SessionRoom: they mutate the in-memory roster and return the frames ws.ts then
// fans out to the room. File locks (TASK-034) extend this module.

import type { SessionRoom } from './runtime';

export interface PresenceFrame {
  type: 'presence';
  members: {
    connId: string;
    userId: string;
    userName: string;
    userImage: string | null;
    filePath: string | null;
  }[];
}

export interface CursorFrame {
  type: 'cursor';
  connId: string;
  userId: string;
  userName: string;
  filePath: string;
  line: number;
  column: number;
}

/** The room's full presence roster, ready to broadcast. One entry per live
 *  connection (the same user in two tabs is two members). */
export function presenceFrame(room: SessionRoom): PresenceFrame {
  return {
    type: 'presence',
    members: [...room.members.values()].map((m) => ({
      connId: m.connId,
      userId: m.userId,
      userName: m.userName,
      userImage: m.userImage,
      filePath: m.filePath ?? null,
    })),
  };
}

/** Record which file a member is viewing (drives the roster + cursor scoping).
 *  A non-string path clears it (member is on no file). No-op if the member is
 *  gone. */
export function setMemberFile(room: SessionRoom, connId: string, pathRaw: unknown): void {
  const member = room.members.get(connId);
  if (!member) return;
  member.filePath = typeof pathRaw === 'string' ? pathRaw : undefined;
}

/** Build the relay frame for a cursor message, stamped with the sender's
 *  identity. Returns null if the member is gone or the payload is malformed
 *  (so ws.ts simply drops it). */
export function cursorFrame(room: SessionRoom, connId: string, msg: unknown): CursorFrame | null {
  const member = room.members.get(connId);
  if (!member) return null;
  const m = msg as { filePath?: unknown; line?: unknown; column?: unknown };
  if (
    typeof m.filePath !== 'string' ||
    typeof m.line !== 'number' ||
    typeof m.column !== 'number'
  ) {
    return null;
  }
  return {
    type: 'cursor',
    connId: member.connId,
    userId: member.userId,
    userName: member.userName,
    filePath: m.filePath,
    line: m.line,
    column: m.column,
  };
}
