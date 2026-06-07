// GET/PATCH /api/admin/users/[id] (STORY-45). GET returns one user's detail
// (profile, projects, recent sessions + audited activity). PATCH changes their
// role with two guards — an admin can't demote themselves, and the last remaining
// admin can't be demoted — and audits every change. Admin-only throughout.

import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { isUserAdmin } from '@/lib/admin';
import { adminGetUser, adminSetUserRole, countAdmins, getUserRole } from '@/lib/admin-users';
import { clientIp, recordAudit } from '@/lib/audit';
import { getAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!(await isUserAdmin(session.user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const user = await adminGetUser(params.id);
  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ user });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const hdrs = await headers();
  const session = await getAuth().api.getSession({ headers: hdrs });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!(await isUserAdmin(session.user.id))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { role?: unknown } | null;
  const role = body?.role;
  if (role !== 'user' && role !== 'admin') {
    return NextResponse.json({ error: 'invalid_role' }, { status: 400 });
  }

  const current = await getUserRole(params.id);
  if (!current) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (current === role) return NextResponse.json({ id: params.id, role }); // no-op

  // Guard 1: an admin can't strip their own admin role (locking themselves out).
  if (params.id === session.user.id && current === 'admin' && role === 'user') {
    return NextResponse.json({ error: 'self_demote' }, { status: 400 });
  }
  // Guard 2: never demote the last remaining admin.
  if (current === 'admin' && role === 'user' && (await countAdmins()) <= 1) {
    return NextResponse.json({ error: 'last_admin' }, { status: 400 });
  }

  const ok = await adminSetUserRole(params.id, role);
  if (!ok) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  await recordAudit(session.user.id, 'user.role_changed', {
    targetType: 'user',
    targetId: params.id,
    metadata: { from: current, to: role },
    ip: clientIp(hdrs),
  });
  return NextResponse.json({ id: params.id, role });
}
