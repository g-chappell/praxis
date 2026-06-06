// /api/projects — list (GET) and create (POST) the signed-in user's projects.

import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { projects } from '@praxis/db';
import { db } from '@praxis/db/client';

import { getAuth } from '@/lib/auth';
import { ensurePersonalTeam, listUserProjects, parseProjectStatus } from '@/lib/projects';
import { DEFAULT_TEMPLATE_ID, isTemplateId } from '@/lib/templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const status = parseProjectStatus(req.nextUrl.searchParams.get('status'));
  return NextResponse.json({ projects: await listUserProjects(session.user.id, { status }) });
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

  const teamId = await ensurePersonalTeam(session.user.id);
  const [project] = await db
    .insert(projects)
    .values({ teamId, name, templateId, createdBy: session.user.id })
    .returning({ id: projects.id });

  return NextResponse.json({ id: project!.id });
}
