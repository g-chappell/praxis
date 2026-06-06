// Project sandbox lifecycle, server-to-server only (shared internal secret):
//   DELETE /projects/:projectId           — destroy a project's sandbox (STORY-28)
//   POST   /projects/:projectId/duplicate  — clone a project's sandbox (STORY-42)
//
// The web app authenticates the user + verifies ownership, mutates the DB rows,
// and calls these to do the Docker-side work it must not touch directly.

import { Hono } from 'hono';

import { logger } from '../logger';
import { getSandbox, purgeProjectRooms } from '../runtime';

export const projectsRoute = new Hono();

function hasSecret(secretHeader: string | undefined): boolean {
  const secret = process.env.ORCHESTRATOR_INTERNAL_SECRET;
  return Boolean(secret) && secretHeader === secret;
}

projectsRoute.delete('/:projectId', async (c) => {
  if (!hasSecret(c.req.header('x-internal-secret'))) {
    return c.json({ error: 'forbidden' }, 403);
  }
  const projectId = c.req.param('projectId');
  if (!projectId) return c.json({ error: 'bad_request' }, 400);

  try {
    purgeProjectRooms(projectId);
    await getSandbox().destroy(projectId);
    logger.info({ projectId }, 'project.sandbox_destroyed');
    return c.json({ ok: true });
  } catch (err) {
    logger.error(
      { projectId, err: err instanceof Error ? err.message : String(err) },
      'project.destroy_failed',
    );
    return c.json({ error: 'destroy_failed' }, 502);
  }
});

// Clone the source project's sandbox volume into a new project's volume. When
// the source has no volume (never started), seed the template into the new
// project instead, leaving it stopped — so the duplicate is never empty.
projectsRoute.post('/:projectId/duplicate', async (c) => {
  if (!hasSecret(c.req.header('x-internal-secret'))) {
    return c.json({ error: 'forbidden' }, 403);
  }
  const sourceProjectId = c.req.param('projectId');
  const body = (await c.req.json().catch(() => null)) as {
    newProjectId?: string;
    templateId?: string;
  } | null;
  const newProjectId = body?.newProjectId;
  const templateId = body?.templateId;
  if (!sourceProjectId || !newProjectId || !templateId) {
    return c.json({ error: 'bad_request' }, 400);
  }

  try {
    const cloned = await getSandbox().clone(sourceProjectId, newProjectId);
    if (!cloned) {
      // No source volume — seed the template, then leave the new project stopped
      // (its container is created only on first open).
      const handle = await getSandbox().start(newProjectId, templateId);
      await getSandbox().stop(handle);
    }
    logger.info({ sourceProjectId, newProjectId, cloned }, 'project.duplicated');
    return c.json({ ok: true, cloned });
  } catch (err) {
    logger.error(
      { sourceProjectId, newProjectId, err: err instanceof Error ? err.message : String(err) },
      'project.duplicate_failed',
    );
    return c.json({ error: 'duplicate_failed' }, 502);
  }
});
