// Unit tests for the session runtime's auth seam (tickets) and room registry.
// Node-compatible (no Bun/Docker) — runs in CI. The full WS→agent round-trip is
// verified by the live e2e (it needs Bun + Docker + a real key).

import { afterEach, describe, expect, it, vi } from 'vitest';

import { consumeTicket, createRoom, deleteRoom, getRoom, mintTicket } from '../src/runtime';

afterEach(() => {
  vi.useRealTimers();
});

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
});
