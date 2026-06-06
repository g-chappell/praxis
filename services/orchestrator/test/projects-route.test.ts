// Unit tests for DELETE /projects/:id (TASK-075). Node-compatible: the sandbox
// + room registry are mocked, so this verifies the endpoint's auth gate and
// destroy/purge orchestration without Docker. The real container/volume removal
// is covered by the Docker-gated DockerSandbox.destroy test.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { destroy, purge, clone, start, stop } = vi.hoisted(() => ({
  destroy: vi.fn(async () => {}),
  purge: vi.fn(),
  clone: vi.fn(async () => true),
  start: vi.fn(async () => ({ projectId: 'new', containerId: 'c' })),
  stop: vi.fn(async () => {}),
}));

vi.mock('../src/runtime', () => ({
  getSandbox: () => ({ destroy, clone, start, stop }),
  purgeProjectRooms: purge,
}));

import { projectsRoute } from '../src/routes/projects';

const SECRET = 'test-secret';

beforeEach(() => {
  process.env.ORCHESTRATOR_INTERNAL_SECRET = SECRET;
  destroy.mockReset().mockResolvedValue(undefined);
  purge.mockReset();
  clone.mockReset().mockResolvedValue(true);
  start.mockReset().mockResolvedValue({ projectId: 'new', containerId: 'c' });
  stop.mockReset().mockResolvedValue(undefined);
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

describe('POST /projects/:projectId/duplicate', () => {
  function dup(body: unknown, withSecret = true) {
    return projectsRoute.request('/src/duplicate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(withSecret ? { 'x-internal-secret': SECRET } : {}),
      },
      body: JSON.stringify(body),
    });
  }

  it('rejects without the internal secret', async () => {
    const res = await dup({ newProjectId: 'new', templateId: 'blank' }, false);
    expect(res.status).toBe(403);
    expect(clone).not.toHaveBeenCalled();
  });

  it('400s when newProjectId or templateId is missing', async () => {
    expect((await dup({ newProjectId: 'new' })).status).toBe(400);
    expect((await dup({ templateId: 'blank' })).status).toBe(400);
  });

  it('clones source → new and does not seed when a volume was copied', async () => {
    clone.mockResolvedValueOnce(true);
    const res = await dup({ newProjectId: 'new', templateId: 'blank' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, cloned: true });
    expect(clone).toHaveBeenCalledWith('src', 'new');
    expect(start).not.toHaveBeenCalled();
  });

  it('seeds the template (start→stop) when the source has no volume', async () => {
    clone.mockResolvedValueOnce(false);
    const res = await dup({ newProjectId: 'new', templateId: 'blank' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, cloned: false });
    expect(start).toHaveBeenCalledWith('new', 'blank');
    expect(stop).toHaveBeenCalled();
  });

  it('returns 502 when clone throws', async () => {
    clone.mockRejectedValueOnce(new Error('boom'));
    const res = await dup({ newProjectId: 'new', templateId: 'blank' });
    expect(res.status).toBe(502);
  });
});
