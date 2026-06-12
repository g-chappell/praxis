// POST /api/teams — create a team owned by the signed-in user (STORY-54). One
// team per user this pass: a 409 (already_in_team) if they already belong to one.

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { getAuth } from '@/lib/auth';
import { createTeam } from '@/lib/teams';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { name?: unknown } | null;
  const result = await createTeam(session.user.id, body?.name);
  if ('error' in result) {
    const status = result.error === 'already_in_team' ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ team: result.team }, { status: 201 });
}
