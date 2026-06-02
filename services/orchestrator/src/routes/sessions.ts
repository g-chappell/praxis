// POST /sessions — start an agent session for a project (STORY-09).
//
// Server-to-server only: the web app (which has already authenticated the user
// and verified project ownership) calls this with the shared internal secret.
// We create the session row, start the sandbox (restoring its snapshot if the
// volume is empty), open a room, and mint a one-time WS ticket the browser uses
// to connect. The browser never reaches this endpoint directly.

import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { projects, sessions } from '@praxis/db';
import { db } from '@praxis/db/client';

import { logger } from '../logger';
import { createRoom, getSandbox, mintTicket } from '../runtime';

export const sessionsRoute = new Hono();

sessionsRoute.post('/', async (c) => {
  const secret = process.env.ORCHESTRATOR_INTERNAL_SECRET;
  if (!secret || c.req.header('x-internal-secret') !== secret) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const body = (await c.req.json().catch(() => null)) as {
    projectId?: unknown;
    userId?: unknown;
  } | null;
  const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
  const userId = typeof body?.userId === 'string' ? body.userId : '';
  if (!projectId || !userId) {
    return c.json({ error: 'bad_request' }, 400);
  }

  const [project] = await db
    .select({ templateId: projects.templateId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) {
    return c.json({ error: 'project_not_found' }, 404);
  }

  // start() restores from MinIO if the volume is empty (ADR-0008).
  const handle = await getSandbox().start(projectId, project.templateId);
  const [session] = await db
    .insert(sessions)
    .values({ projectId, containerId: handle.containerId })
    .returning({ id: sessions.id });
  const sessionId = session!.id;

  createRoom(sessionId, projectId, handle);
  const ticket = mintTicket(sessionId, userId);
  logger.info({ sessionId, projectId }, 'session.created');

  return c.json({ sessionId, ticket });
});
