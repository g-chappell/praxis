// Unit tests for the session runtime's auth seam (tickets) and room registry.
// Node-compatible (no Bun/Docker) — runs in CI. The full WS→agent round-trip is
// verified by the live e2e (it needs Bun + Docker + a real key).

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AcpHost, AgentSession } from '@praxis/acp-host';
import type { Sandbox } from '@praxis/sandbox';

import {
  acquireRoomTurn,
  cancelRoomTeardown,
  consumeTicket,
  createRoom,
  deleteRoom,
  getRoom,
  getRoomByProject,
  mintTicket,
  scheduleRoomTeardown,
} from '../src/runtime';

afterEach(() => {
  vi.useRealTimers();
});

function fakeSession(overrides: Partial<AgentSession> = {}): AgentSession {
  return {
    alive: true,
    busy: false,
    prompt: () => (async function* () {})(),
    cancel: () => {},
    close: vi.fn(async () => {}),
    ...overrides,
  } as AgentSession;
}

const SANDBOX = {} as Sandbox;

describe('tickets', () => {
  it('mint → consume once returns the claim; a second consume is null (single-use)', () => {
    const ticket = mintTicket({
      sessionId: 'sess-1',
      userId: 'user-1',
      userName: 'Ada',
      userImage: null,
    });
    expect(consumeTicket(ticket)).toEqual({
      sessionId: 'sess-1',
      userId: 'user-1',
      userName: 'Ada',
      userImage: null,
    });
    expect(consumeTicket(ticket)).toBeNull();
  });

  it('an unknown ticket is null', () => {
    expect(consumeTicket('does-not-exist')).toBeNull();
  });

  it('an expired ticket is null', () => {
    vi.useFakeTimers();
    const ticket = mintTicket({
      sessionId: 'sess-x',
      userId: 'user-x',
      userName: 'X',
      userImage: null,
    });
    vi.advanceTimersByTime(61_000); // TTL is 60s
    expect(consumeTicket(ticket)).toBeNull();
  });
});

describe('rooms', () => {
  it('create / get / delete', () => {
    const handle = { projectId: 'p1', containerId: 'c1' };
    createRoom('sess-2', 'p1', handle, 'sk-ant-test');

    const room = getRoom('sess-2');
    expect(room?.projectId).toBe('p1');
    expect(room?.handle).toEqual(handle);
    expect(room?.apiKey).toBe('sk-ant-test');
    expect(room?.sockets.size).toBe(0);

    deleteRoom('sess-2');
    expect(getRoom('sess-2')).toBeUndefined();
  });

  it('getRoomByProject finds the live room for a project, undefined after delete (STORY-32)', () => {
    const handle = { projectId: 'proj-rb', containerId: 'c1' };
    createRoom('sess-rb', 'proj-rb', handle, 'sk-ant-test', 'https://proj-rb.preview.test');

    const room = getRoomByProject('proj-rb');
    expect(room?.sessionId).toBe('sess-rb');
    expect(room?.previewUrl).toBe('https://proj-rb.preview.test');
    expect(getRoomByProject('no-such-project')).toBeUndefined();

    deleteRoom('sess-rb');
    expect(getRoomByProject('proj-rb')).toBeUndefined();
  });
});

describe('acquireRoomTurn (STORY-33)', () => {
  const handle = { projectId: 'p-turn', containerId: 'c1' };

  it('opens the agent on the first turn and stores it on the room', async () => {
    const session = fakeSession();
    const host = { openAgent: vi.fn(async () => session) } as unknown as AcpHost;
    createRoom('sess-turn-1', 'p-turn', handle, 'sk');
    const room = getRoom('sess-turn-1')!;
    try {
      const turn = await acquireRoomTurn(room, host, SANDBOX);
      expect(turn).toEqual({ status: 'ready', agent: session, restarted: false });
      expect(host.openAgent).toHaveBeenCalledOnce();
      expect(room.agent).toBe(session);
    } finally {
      deleteRoom('sess-turn-1');
    }
  });

  it('reports busy and does NOT open a second agent while a turn is in flight', async () => {
    const session = fakeSession({ busy: true });
    const host = { openAgent: vi.fn(async () => fakeSession()) } as unknown as AcpHost;
    createRoom('sess-turn-2', 'p-turn', handle, 'sk');
    const room = getRoom('sess-turn-2')!;
    room.agent = session; // a turn is already running
    try {
      const turn = await acquireRoomTurn(room, host, SANDBOX);
      expect(turn.status).toBe('busy');
      expect(host.openAgent).not.toHaveBeenCalled();
      expect(room.agent).toBe(session);
    } finally {
      deleteRoom('sess-turn-2');
    }
  });

  it('re-opens a dead agent and flags restarted', async () => {
    const fresh = fakeSession();
    const host = { openAgent: vi.fn(async () => fresh) } as unknown as AcpHost;
    createRoom('sess-turn-3', 'p-turn', handle, 'sk');
    const room = getRoom('sess-turn-3')!;
    room.agent = fakeSession({ alive: false }); // previous agent died
    try {
      const turn = await acquireRoomTurn(room, host, SANDBOX);
      expect(turn).toEqual({ status: 'ready', agent: fresh, restarted: true });
      expect(host.openAgent).toHaveBeenCalledOnce();
      expect(room.agent).toBe(fresh);
    } finally {
      deleteRoom('sess-turn-3');
    }
  });

  it('returns error when the agent fails to open', async () => {
    const host = {
      openAgent: vi.fn(async () => {
        throw new Error('spawn failed');
      }),
    } as unknown as AcpHost;
    createRoom('sess-turn-4', 'p-turn', handle, 'sk');
    const room = getRoom('sess-turn-4')!;
    try {
      const turn = await acquireRoomTurn(room, host, SANDBOX);
      expect(turn.status).toBe('error');
      expect(room.agent).toBeUndefined();
    } finally {
      deleteRoom('sess-turn-4');
    }
  });
});

describe('reconnect grace teardown (STORY-35)', () => {
  const handle = { projectId: 'p-grace', containerId: 'c1' };

  it('fires teardown after the grace window when the room stays empty', () => {
    vi.useFakeTimers();
    const room = createRoom('sess-g1', 'p-g1', handle, 'k');
    const onElapse = vi.fn();
    try {
      scheduleRoomTeardown(room, 90_000, onElapse);
      vi.advanceTimersByTime(89_000);
      expect(onElapse).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2_000);
      expect(onElapse).toHaveBeenCalledWith('sess-g1');
    } finally {
      deleteRoom('sess-g1');
    }
  });

  it('a reconnect cancelling within the window prevents teardown', () => {
    vi.useFakeTimers();
    const room = createRoom('sess-g2', 'p-g2', handle, 'k');
    const onElapse = vi.fn();
    try {
      scheduleRoomTeardown(room, 90_000, onElapse);
      vi.advanceTimersByTime(1_000);
      cancelRoomTeardown(room);
      vi.advanceTimersByTime(120_000);
      expect(onElapse).not.toHaveBeenCalled();
    } finally {
      deleteRoom('sess-g2');
    }
  });

  it('does not tear down if a socket is present when the timer fires', () => {
    vi.useFakeTimers();
    const room = createRoom('sess-g3', 'p-g3', handle, 'k');
    const onElapse = vi.fn();
    try {
      scheduleRoomTeardown(room, 90_000, onElapse);
      room.sockets.add({} as never); // a socket rejoined without cancelling
      vi.advanceTimersByTime(120_000);
      expect(onElapse).not.toHaveBeenCalled();
    } finally {
      deleteRoom('sess-g3');
    }
  });

  it('is a no-op while a teardown is already pending', () => {
    vi.useFakeTimers();
    const room = createRoom('sess-g4', 'p-g4', handle, 'k');
    const onElapse = vi.fn();
    try {
      scheduleRoomTeardown(room, 90_000, onElapse);
      scheduleRoomTeardown(room, 1_000, onElapse); // ignored — the first timer stands
      vi.advanceTimersByTime(2_000);
      expect(onElapse).not.toHaveBeenCalled(); // would have fired at 1s if the 2nd took effect
      vi.advanceTimersByTime(90_000);
      expect(onElapse).toHaveBeenCalledTimes(1);
    } finally {
      deleteRoom('sess-g4');
    }
  });
});
