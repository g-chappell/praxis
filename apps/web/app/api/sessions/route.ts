// POST /api/sessions — start an agent session for a project (STORY-09).
// Authenticated + ownership-checked, then calls the orchestrator server-to-server
// (shared internal secret) to create the session + mint a one-time WS ticket.
// Returns { sessionId, ticket }; the browser opens the WS itself using
// NEXT_PUBLIC_ORCHESTRATOR_WS_URL + the ticket.

import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { getAuth } from '@/lib/auth';
import { userOwnsProject } from '@/lib/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as { projectId?: unknown } | null;
  const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
  if (!projectId) {
    return NextResponse.json({ error: 'missing_project' }, { status: 400 });
  }
  if (!(await userOwnsProject(session.user.id, projectId))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const orchestratorUrl = process.env.ORCHESTRATOR_INTERNAL_URL;
  const internalSecret = process.env.ORCHESTRATOR_INTERNAL_SECRET;
  if (!orchestratorUrl || !internalSecret) {
    return NextResponse.json({ error: 'orchestrator_not_configured' }, { status: 500 });
  }

  const res = await fetch(`${orchestratorUrl}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-internal-secret': internalSecret },
    body: JSON.stringify({ projectId, userId: session.user.id }),
  }).catch(() => null);

  if (!res || !res.ok) {
    return NextResponse.json({ error: 'session_start_failed' }, { status: 502 });
  }
  const { sessionId, ticket } = (await res.json()) as { sessionId: string; ticket: string };
  return NextResponse.json({ sessionId, ticket });
}
