// Unit tests for GET /api/admin/users/[id] (STORY-45): role-gating + 200/404.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const isUserAdmin = vi.fn();
const adminGetUser = vi.fn();

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock('@/lib/admin', () => ({ isUserAdmin: (...a: unknown[]) => isUserAdmin(...a) }));
vi.mock('@/lib/admin-users', () => ({ adminGetUser: (...a: unknown[]) => adminGetUser(...a) }));

import { GET } from './route';

const params = { params: { id: 'u1' } };
const callGet = () =>
  GET(new Request('http://localhost/api/admin/users/u1') as never, params as never);

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'admin-1' } });
  isUserAdmin.mockResolvedValue(true);
  adminGetUser.mockResolvedValue({ id: 'u1', email: 'a@b.c' });
});

describe('GET /api/admin/users/[id]', () => {
  it('403 for a non-admin', async () => {
    isUserAdmin.mockResolvedValue(false);
    expect((await callGet()).status).toBe(403);
    expect(adminGetUser).not.toHaveBeenCalled();
  });

  it('200 returns the user detail', async () => {
    const res = await callGet();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: { id: 'u1', email: 'a@b.c' } });
  });

  it('404 when the user does not exist', async () => {
    adminGetUser.mockResolvedValue(null);
    expect((await callGet()).status).toBe(404);
  });
});
