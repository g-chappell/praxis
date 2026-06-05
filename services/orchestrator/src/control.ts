// Prompt-control modes (STORY-34): the per-room control state + transitions that
// arbitrate who drives the shared agent. Two modes — 'serialised' (prompts queue
// and run FIFO) and 'turn_based' (one holder at a time, manual handoff). Kept out
// of Bun-coupled ws.ts so the state machine is unit-testable in Node; ws.ts wires
// the WS messages to these helpers and broadcasts the resulting control_state.

import type { SessionRoom } from './runtime';

export type ControlMode = 'serialised' | 'turn_based';

/** A prompt waiting to run in serialised mode, attributed to its author. */
export interface QueuedPrompt {
  id: string;
  userId: string;
  author: { name: string; image: string | null };
  text: string;
}

/** Is this user the project owner — the only one who may change the mode (STORY-34)? */
export function isOwner(room: SessionRoom, userId: string): boolean {
  return room.ownerUserId !== null && room.ownerUserId === userId;
}

/** The control_state frame broadcast to the whole room on any control change, so
 *  every client renders the mode, the holder, pending requests, and the queue. */
export function controlStateFrame(room: SessionRoom): {
  type: 'control_state';
  mode: ControlMode;
  ownerUserId: string | null;
  controlHolder: string | null;
  requests: string[];
  queue: QueuedPrompt[];
} {
  return {
    type: 'control_state',
    mode: room.mode,
    ownerUserId: room.ownerUserId,
    controlHolder: room.controlHolder ?? null,
    requests: [...room.controlRequests],
    queue: room.queue.map((q) => ({ id: q.id, userId: q.userId, author: q.author, text: q.text })),
  };
}

export interface SetModeResult {
  /** false → rejected (not the owner, or an unknown mode). */
  ok: boolean;
  /** true → the mode actually changed; the caller persists it + broadcasts. */
  changed: boolean;
  /** true → switching to turn_based discarded a non-empty serialised queue. */
  queueCleared: boolean;
}

/** Owner-only mode switch (STORY-34). → turn_based clears the serialised queue and
 *  hands control to the owner; → serialised vacates control (the queue takes over).
 *  Mutates the room; returns what the caller should persist/broadcast/notify. */
export function setMode(room: SessionRoom, userId: string, mode: unknown): SetModeResult {
  if (!isOwner(room, userId)) return { ok: false, changed: false, queueCleared: false };
  if (mode !== 'serialised' && mode !== 'turn_based') {
    return { ok: false, changed: false, queueCleared: false };
  }
  if (room.mode === mode) return { ok: true, changed: false, queueCleared: false };

  room.mode = mode;
  room.controlRequests.clear();
  let queueCleared = false;
  if (mode === 'turn_based') {
    queueCleared = room.queue.length > 0;
    room.queue = [];
    room.controlHolder = room.ownerUserId ?? undefined;
  } else {
    // serialised: holder is irrelevant — prompts queue for everyone.
    room.controlHolder = undefined;
  }
  return { ok: true, changed: true, queueCleared };
}
