import { randomBytes } from 'node:crypto';

import Docker from 'dockerode';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DockerSandbox, parseInotifyLine } from './docker-sandbox.js';
import type { FileEvent, SandboxHandle } from './index.js';
import { InMemoryObjectStore } from './object-store.js';

// Pure, ungated — runs everywhere.
describe('parseInotifyLine', () => {
  it('maps inotify event classes to FileEvent types', () => {
    expect(parseInotifyLine('CREATE|/workspace/a.txt')).toEqual({ type: 'create', path: 'a.txt' });
    expect(parseInotifyLine('MODIFY|/workspace/src/b.ts')).toEqual({
      type: 'modify',
      path: 'src/b.ts',
    });
    expect(parseInotifyLine('DELETE|/workspace/c')).toEqual({ type: 'delete', path: 'c' });
    expect(parseInotifyLine('CREATE,ISDIR|/workspace/dir')).toEqual({
      type: 'create',
      path: 'dir',
    });
    expect(parseInotifyLine('garbage')).toBeNull();
  });
});

// Integration — real Docker daemon. Gated so CI without Docker passes.
const RUN = process.env.RUN_DOCKER_TESTS === '1';
const describeDocker = RUN ? describe : describe.skip;
const T = 60_000;

describeDocker('DockerSandbox (real Docker)', () => {
  const sandbox = new DockerSandbox();
  const docker = new Docker();
  const projectId = `test-${randomBytes(6).toString('hex')}`;
  let handle: SandboxHandle;

  beforeAll(async () => {
    handle = await sandbox.start(projectId, 'react-threejs-scene');
  }, T);

  afterAll(async () => {
    try {
      await sandbox.stop(handle);
    } catch {
      /* ignore */
    }
    try {
      await docker.getVolume(`praxis-project-${projectId}`).remove({ force: true });
    } catch {
      /* ignore */
    }
  }, T);

  it(
    'exec returns stdout and exit code',
    async () => {
      const r = await sandbox.exec(handle, 'echo hello-praxis');
      expect(r.exitCode).toBe(0);
      expect(r.stdout.trim()).toBe('hello-praxis');
    },
    T,
  );

  it(
    'exec surfaces non-zero exit codes',
    async () => {
      const r = await sandbox.exec(handle, 'exit 3');
      expect(r.exitCode).toBe(3);
    },
    T,
  );

  it(
    'writeFile then readFile round-trips',
    async () => {
      await sandbox.writeFile(handle, 'src/hello.txt', 'from-praxis\n');
      expect(await sandbox.readFile(handle, 'src/hello.txt')).toBe('from-praxis\n');
    },
    T,
  );

  it(
    'git was initialised in the project dir',
    async () => {
      const r = await sandbox.exec(handle, 'cd /workspace && git rev-parse --is-inside-work-tree');
      expect(r.stdout.trim()).toBe('true');
    },
    T,
  );

  it(
    'spawn streams stdout and reports exit code',
    async () => {
      const proc = await sandbox.spawn(handle, 'for i in 1 2 3; do echo line-$i; done');
      let out = '';
      for await (const chunk of proc.stdout) out += chunk;
      const code = await proc.wait();
      expect(code).toBe(0);
      expect(out).toContain('line-1');
      expect(out).toContain('line-3');
    },
    T,
  );

  it(
    'watchFiles emits an event when a file changes',
    async () => {
      const events: FileEvent[] = [];
      const unsub = sandbox.watchFiles(handle, (e) => events.push(e));
      // inotifywait needs a beat to attach.
      await new Promise((r) => setTimeout(r, 1500));
      await sandbox.writeFile(handle, 'watched.txt', 'hi');
      await new Promise((r) => setTimeout(r, 1500));
      unsub();
      expect(events.some((e) => e.path === 'watched.txt')).toBe(true);
    },
    T,
  );

  it(
    'exposePort returns a reachable URL',
    async () => {
      const server = await sandbox.spawn(
        handle,
        'python3 -m http.server 8080 --directory /workspace',
      );
      const url = await sandbox.exposePort(handle, 8080);
      expect(url).toMatch(/^http:\/\/\d+\.\d+\.\d+\.\d+:8080$/);
      let ok = false;
      for (let i = 0; i < 10 && !ok; i += 1) {
        try {
          const res = await fetch(url);
          ok = res.ok;
        } catch {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      await server.kill();
      expect(ok).toBe(true);
    },
    T,
  );

  it(
    'stop removes the container but the volume persists across restart',
    async () => {
      // Dedicated project so this destructive test never tears down the shared
      // container the other tests (and afterAll) rely on.
      const pid = `${projectId}-stop`;
      let h = await sandbox.start(pid, 'react-threejs-scene');
      await sandbox.writeFile(h, 'persist.txt', 'durable');
      await sandbox.stop(h);
      const list = await docker.listContainers({
        all: true,
        filters: { name: [`praxis-sandbox-${pid}`] },
      });
      expect(list.length).toBe(0);
      h = await sandbox.start(pid, 'react-threejs-scene');
      expect(await sandbox.readFile(h, 'persist.txt')).toBe('durable');
      await sandbox.stop(h);
      try {
        await docker.getVolume(`praxis-project-${pid}`).remove({ force: true });
      } catch {
        /* ignore */
      }
    },
    T,
  );

  it(
    'restores workspace state from the object store after the volume is removed',
    async () => {
      // The STORY-09 state-capture AC: a marker written in one session survives
      // a full volume loss via the snapshot in the object store (ADR-0008). Uses
      // an in-memory store so the path is exercised without a live MinIO.
      const store = new InMemoryObjectStore();
      const snapSandbox = new DockerSandbox({ store });
      const pid = `${projectId}-snap`;

      let h = await snapSandbox.start(pid, 'react-threejs-scene');
      await snapSandbox.writeFile(h, 'marker.txt', 'survives-rebuild');
      await snapSandbox.stop(h); // snapshots to the store, removes the container

      // Drop the volume so the next start has an empty workspace → must restore.
      await docker.getVolume(`praxis-project-${pid}`).remove({ force: true });

      h = await snapSandbox.start(pid, 'react-threejs-scene');
      expect(await snapSandbox.readFile(h, 'marker.txt')).toBe('survives-rebuild');

      await snapSandbox.stop(h);
      try {
        await docker.getVolume(`praxis-project-${pid}`).remove({ force: true });
      } catch {
        /* ignore */
      }
    },
    T,
  );
});
