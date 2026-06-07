// GET /api/admin/users/[id] — one user's detail: profile, projects, recent
// sessions, recent audited activity (STORY-45). Admin-only. (PATCH role
// management lands in TASK-130.)

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { isUserAdmin } from '@/lib/admin';
import { adminGetUser } from '@/lib/admin-users';
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
