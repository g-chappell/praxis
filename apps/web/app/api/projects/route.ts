// /api/projects — list (GET) and create (POST) the signed-in user's projects.

import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { projects, teamMemberships } from '@praxis/db';
import { db } from '@praxis/db/client';

import { eq } from 'drizzle-orm';

import { getAuth } from '@/lib/auth';
import { listUserProjects, parseProjectSort, parseProjectStatus } from '@/lib/projects';
import { DEFAULT_TEMPLATE_ID, isTemplateId } from '@/lib/templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const status = parseProjectStatus(req.nextUrl.searchParams.get('status'));
  const sort = parseProjectSort(req.nextUrl.searchParams.get('sort'));
  return NextResponse.json({ projects: await listUserProjects(session.user.id, { status, sort }) });
}

export async function POST(req: NextRequest) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    name?: unknown;
    templateId?: unknown;
  } | null;
  const name =
    typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : 'Untitled project';
  const templateId = isTemplateId(body?.templateId) ? body.templateId : DEFAULT_TEMPLATE_ID;
  // Reject an explicit-but-unknown templateId rather than silently defaulting.
  if (body?.templateId !== undefined && !isTemplateId(body.templateId)) {
    return NextResponse.json({ error: 'unknown_template' }, { status: 400 });
  }

  // Teams are explicit now (STORY-54): no auto-create. A teamless user must
  // create or join a team first — refuse and create nothing.
  const [membership] = await db
    .select({ teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .where(eq(teamMemberships.userId, session.user.id))
    .limit(1);
  if (!membership) {
    return NextResponse.json({ error: 'needs_team' }, { status: 409 });
  }

  const [project] = await db
    .insert(projects)
    .values({ teamId: membership.teamId, name, templateId, createdBy: session.user.id })
    .returning({ id: projects.id });

  return NextResponse.json({ id: project!.id });
}
