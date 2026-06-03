// Unit tests for DELETE /projects/:id (TASK-075). Node-compatible: the sandbox
// + room registry are mocked, so this verifies the endpoint's auth gate and
// destroy/purge orchestration without Docker. The real container/volume removal
// is covered by the Docker-gated DockerSandbox.destroy test.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { destroy, purge } = vi.hoisted(() => ({
  destroy: vi.fn(async () => {}),
  purge: vi.fn(),
}));

vi.mock('../src/runtime', () => ({
  getSandbox: () => ({ destroy }),
  purgeProjectRooms: purge,
}));

import { projectsRoute } from '../src/routes/projects';

const SECRET = 'test-secret';

beforeEach(() => {
  process.env.ORCHESTRATOR_INTERNAL_SECRET = SECRET;
  destroy.mockReset().mockResolvedValue(undefined);
  purge.mockReset();
});
afterEach(() => {
  delete process.env.ORCHESTRATOR_INTERNAL_SECRET;
});

describe('DELETE /projects/:projectId', () => {
  it('rejects a request without the internal secret', async () => {
    const res = await projectsRoute.request('/p1', { method: 'DELETE' });
    expect(res.status).toBe(403);
    expect(destroy).not.toHaveBeenCalled();
  });

  it('purges rooms and destroys the sandbox with the secret', async () => {
    const res = await projectsRoute.request('/p1', {
      method: 'DELETE',
      headers: { 'x-internal-secret': SECRET },
    });
    expect(res.status).toBe(200);
    expect(purge).toHaveBeenCalledWith('p1');
    expect(destroy).toHaveBeenCalledWith('p1');
  });

  it('returns 502 when destroy throws', async () => {
    destroy.mockRejectedValueOnce(new Error('boom'));
    const res = await projectsRoute.request('/p1', {
      method: 'DELETE',
      headers: { 'x-internal-secret': SECRET },
    });
    expect(res.status).toBe(502);
  });
});
