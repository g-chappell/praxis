// DELETE /projects/:projectId — permanently destroy a project's sandbox (STORY-28).
//
// Server-to-server only (shared internal secret): the web app authenticates the
// user + verifies ownership, deletes the DB rows, and calls this to remove the
// sandbox container + named volume + snapshot so no stale artifacts remain. Any
// active session room for the project is torn down first.

import { Hono } from 'hono';

import { logger } from '../logger';
import { getSandbox, purgeProjectRooms } from '../runtime';

export const projectsRoute = new Hono();

projectsRoute.delete('/:projectId', async (c) => {
  const secret = process.env.ORCHESTRATOR_INTERNAL_SECRET;
  if (!secret || c.req.header('x-internal-secret') !== secret) {
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
