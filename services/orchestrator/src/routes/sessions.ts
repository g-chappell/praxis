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
import { previewUrlFor, registerPreview } from '../preview';
import { createRoom, getSandbox, mintTicket } from '../runtime';
import { readTemplateConfig } from '../templates';

export const sessionsRoute = new Hono();

sessionsRoute.post('/', async (c) => {
  const secret = process.env.ORCHESTRATOR_INTERNAL_SECRET;
  if (!secret || c.req.header('x-internal-secret') !== secret) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const body = (await c.req.json().catch(() => null)) as {
    projectId?: unknown;
    userId?: unknown;
    apiKey?: unknown;
  } | null;
  const projectId = typeof body?.projectId === 'string' ? body.projectId : '';
  const userId = typeof body?.userId === 'string' ? body.userId : '';
  // The web app decrypts the platform key (Node/libsodium) and passes it here —
  // the Bun orchestrator never loads libsodium. See runtime.ts SessionRoom.
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey : '';
  if (!projectId || !userId || !apiKey) {
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

  // Register the preview: map the project's slug → the sandbox's dev-server port
  // so Caddy's wildcard proxies <projectId>.preview.<domain> here (STORY-13). The
  // dev server itself is auto-started separately (PR2); the URL 502s until it's up.
  const { previewPort } = readTemplateConfig(project.templateId);
  let previewUrl: string | null = null;
  try {
    const addr = await getSandbox().exposePort(handle, previewPort); // http://<ip>:<port>
    registerPreview(projectId, { ip: new URL(addr).hostname, port: previewPort });
    previewUrl = previewUrlFor(projectId);
  } catch (err) {
    logger.warn(
      { projectId, err: err instanceof Error ? err.message : String(err) },
      'preview.register_failed',
    );
  }

  const [session] = await db
    .insert(sessions)
    .values({ projectId, containerId: handle.containerId, previewUrl })
    .returning({ id: sessions.id });
  const sessionId = session!.id;

  createRoom(sessionId, projectId, handle, apiKey);
  const ticket = mintTicket(sessionId, userId);
  logger.info({ sessionId, projectId }, 'session.created');

  return c.json({ sessionId, ticket, previewUrl });
});
