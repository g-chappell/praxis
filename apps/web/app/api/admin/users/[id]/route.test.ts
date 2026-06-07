// Unit tests for GET /api/admin/users/[id] (STORY-45): role-gating + 200/404.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const isUserAdmin = vi.fn();
const adminGetUser = vi.fn();
const getUserRole = vi.fn();
const countAdmins = vi.fn();
const adminSetUserRole = vi.fn();
const recordAudit = vi.fn();

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession } }) }));
vi.mock('@/lib/admin', () => ({ isUserAdmin: (...a: unknown[]) => isUserAdmin(...a) }));
vi.mock('@/lib/admin-users', () => ({
  adminGetUser: (...a: unknown[]) => adminGetUser(...a),
  getUserRole: (...a: unknown[]) => getUserRole(...a),
  countAdmins: (...a: unknown[]) => countAdmins(...a),
  adminSetUserRole: (...a: unknown[]) => adminSetUserRole(...a),
}));
vi.mock('@/lib/audit', () => ({
  recordAudit: (...a: unknown[]) => recordAudit(...a),
  clientIp: () => null,
}));

import { GET, PATCH } from './route';

const params = { params: { id: 'u1' } };
const callGet = () =>
  GET(new Request('http://localhost/api/admin/users/u1') as never, params as never);
const callPatch = (body: unknown, id = 'u1') =>
  PATCH(
    new Request(`http://localhost/api/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as never,
    { params: { id } } as never,
  );

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: 'admin-1' } });
  isUserAdmin.mockResolvedValue(true);
  adminGetUser.mockResolvedValue({ id: 'u1', email: 'a@b.c' });
  getUserRole.mockResolvedValue('user');
  countAdmins.mockResolvedValue(2);
  adminSetUserRole.mockResolvedValue(true);
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

describe('PATCH /api/admin/users/[id] (role management)', () => {
  it('403 for a non-admin — never mutates', async () => {
    isUserAdmin.mockResolvedValue(false);
    expect((await callPatch({ role: 'admin' })).status).toBe(403);
    expect(adminSetUserRole).not.toHaveBeenCalled();
  });

  it('400 for an invalid role', async () => {
    expect((await callPatch({ role: 'superuser' })).status).toBe(400);
    expect(adminSetUserRole).not.toHaveBeenCalled();
  });

  it('promotes a user to admin and audits the change', async () => {
    getUserRole.mockResolvedValue('user');
    const res = await callPatch({ role: 'admin' }, 'u2');
    expect(res.status).toBe(200);
    expect(adminSetUserRole).toHaveBeenCalledWith('u2', 'admin');
    expect(recordAudit).toHaveBeenCalledWith(
      'admin-1',
      'user.role_changed',
      expect.objectContaining({
        targetType: 'user',
        targetId: 'u2',
        metadata: { from: 'user', to: 'admin' },
      }),
    );
  });

  it('blocks an admin from demoting themselves', async () => {
    getUserRole.mockResolvedValue('admin');
    const res = await callPatch({ role: 'user' }, 'admin-1'); // self
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'self_demote' });
    expect(adminSetUserRole).not.toHaveBeenCalled();
  });

  it('blocks demoting the last remaining admin', async () => {
    getUserRole.mockResolvedValue('admin');
    countAdmins.mockResolvedValue(1);
    const res = await callPatch({ role: 'user' }, 'u2');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'last_admin' });
    expect(adminSetUserRole).not.toHaveBeenCalled();
  });

  it('demotes a non-last admin', async () => {
    getUserRole.mockResolvedValue('admin');
    countAdmins.mockResolvedValue(3);
    const res = await callPatch({ role: 'user' }, 'u2');
    expect(res.status).toBe(200);
    expect(adminSetUserRole).toHaveBeenCalledWith('u2', 'user');
  });

  it('is a no-op (200, no audit) when the role is unchanged', async () => {
    getUserRole.mockResolvedValue('user');
    const res = await callPatch({ role: 'user' }, 'u2');
    expect(res.status).toBe(200);
    expect(adminSetUserRole).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
