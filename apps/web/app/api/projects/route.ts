// /api/projects — list (GET) and create (POST) the signed-in user's projects.

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { projects } from '@praxis/db';
import { db } from '@praxis/db/client';

import { getAuth } from '@/lib/auth';
import { ensurePersonalTeam, listUserProjects } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TEMPLATE_ID = 'react-threejs-scene';

export async function GET() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ projects: await listUserProjects(session.user.id) });
}

export async function POST() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const teamId = await ensurePersonalTeam(session.user.id);
  const [project] = await db
    .insert(projects)
    .values({
      teamId,
      name: 'Untitled project',
      templateId: TEMPLATE_ID,
      createdBy: session.user.id,
    })
    .returning({ id: projects.id });

  return NextResponse.json({ id: project!.id });
}
