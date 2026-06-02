// POST /api/projects — create a project for the signed-in user (STORY-09).
// Ensures the user has a (personal) team, then inserts the project on the POC
// template. Returns { id } for the client to navigate to /projects/<id>.

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { projects } from '@praxis/db';
import { db } from '@praxis/db/client';

import { getAuth } from '@/lib/auth';
import { ensurePersonalTeam } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TEMPLATE_ID = 'react-threejs-scene';

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
