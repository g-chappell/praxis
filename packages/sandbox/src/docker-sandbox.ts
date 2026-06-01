// DockerSandbox — the POC `Sandbox` implementation (ADR-0007), backed by a
// per-project Docker container created from `praxis-sandbox-base`. Nothing
// outside this file imports dockerode; consumers use the `Sandbox` interface.

import { randomBytes } from 'node:crypto';
import * as posix from 'node:path/posix';
import { PassThrough, Readable, type Duplex } from 'node:stream';

import Docker from 'dockerode';
import * as tar from 'tar-stream';

import type {
  ExecOptions,
  ExecResult,
  FileEvent,
  FileEventType,
  ProcessHandle,
  Sandbox,
  SandboxHandle,
  SpawnOptions,
  Unsubscribe,
} from './index.js';
import type { ObjectStore } from './object-store.js';

const WORKDIR = '/workspace';
const MEMORY_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB (§6)
const NANO_CPUS = 1_000_000_000; // 1 CPU (§6)

export interface DockerSandboxConfig {
  /** Base image. Defaults to praxis-sandbox-base:latest. */
  image?: string;
  /** Docker network to attach containers to (e.g. praxis-net). */
  network?: string;
  /** Per-container disk cap, e.g. "5G". Only honored when the storage driver
   *  supports StorageOpt (xfs+pquota) — silently unenforced on overlayfs. */
  diskLimit?: string;
  /** Durable snapshot store. When set, stop() snapshots /workspace and start()
   *  restores it into a fresh volume. Omit to disable persistence. */
  store?: ObjectStore;
  /** Override the dockerode instance (tests/alt sockets). */
  docker?: Docker;
}

function id(): string {
  return randomBytes(8).toString('hex');
}

function shSingleQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function envToArray(env?: Record<string, string>): string[] | undefined {
  return env ? Object.entries(env).map(([k, v]) => `${k}=${v}`) : undefined;
}

function inWorkspace(p: string): string {
  return p.startsWith('/') ? p : posix.join(WORKDIR, p);
}

async function* toStringIterable(stream: PassThrough): AsyncIterable<string> {
  for await (const chunk of stream) {
    yield typeof chunk === 'string' ? chunk : (chunk as Buffer).toString('utf8');
  }
}

export class DockerSandbox implements Sandbox {
  private readonly docker: Docker;
  private readonly image: string;
  private readonly network?: string;
  private readonly diskLimit?: string;
  private readonly store?: ObjectStore;
  /** Last exec/spawn activity per projectId, for idle detection. */
  private readonly activity = new Map<string, number>();

  constructor(config: DockerSandboxConfig = {}) {
    this.docker = config.docker ?? new Docker();
    this.image = config.image ?? 'praxis-sandbox-base:latest';
    this.network = config.network;
    this.diskLimit = config.diskLimit;
    this.store = config.store;
  }

  private container(handle: SandboxHandle): Docker.Container {
    return this.docker.getContainer(handle.containerId);
  }

  private touch(projectId: string): void {
    this.activity.set(projectId, Date.now());
  }

  private async findByName(name: string): Promise<Docker.Container | null> {
    const list = await this.docker.listContainers({
      all: true,
      filters: { name: [name] },
    });
    const match = list.find((c) => c.Names.some((n) => n === `/${name}`));
    return match ? this.docker.getContainer(match.Id) : null;
  }

  /** Run a command, discard output, resolve with its exit code. */
  private async execSimple(container: Docker.Container, cmd: string[]): Promise<number> {
    const exec = await container.exec({ Cmd: cmd, AttachStdout: true, AttachStderr: true });
    const stream = await exec.start({ hijack: true, stdin: false });
    const sink = new PassThrough();
    this.docker.modem.demuxStream(stream, sink, sink);
    await new Promise<void>((resolve) => stream.on('end', resolve));
    const info = await exec.inspect();
    return info.ExitCode ?? 0;
  }

  async start(projectId: string, templateId: string): Promise<SandboxHandle> {
    const name = `praxis-sandbox-${projectId}`;
    const volume = `praxis-project-${projectId}`;

    this.touch(projectId);

    const existing = await this.findByName(name);
    if (existing) {
      const info = await existing.inspect();
      if (!info.State.Running) await existing.start();
      return { projectId, containerId: info.Id };
    }

    const container = await this.docker.createContainer({
      name,
      Image: this.image,
      Cmd: ['sleep', 'infinity'],
      WorkingDir: WORKDIR,
      Labels: { 'praxis.projectId': projectId, 'praxis.templateId': templateId },
      HostConfig: {
        Memory: MEMORY_BYTES,
        NanoCpus: NANO_CPUS,
        Binds: [`${volume}:${WORKDIR}`],
        ...(this.network ? { NetworkMode: this.network } : {}),
        ...(this.diskLimit ? { StorageOpt: { size: this.diskLimit } } : {}),
      },
    });
    await container.start();
    const handle: SandboxHandle = { projectId, containerId: (await container.inspect()).Id };

    // Restore from the durable snapshot when the volume is fresh (first run, or
    // the local volume was reclaimed). A populated volume is left untouched.
    if (this.store && (await this.isWorkspaceEmpty(container))) {
      await this.restore(handle, container);
    }
    // Initialise git in the project dir if still fresh after any restore.
    await this.execSimple(container, [
      'bash',
      '-lc',
      'cd /workspace && [ -d .git ] || git init -q',
    ]);
    return handle;
  }

  private async isWorkspaceEmpty(container: Docker.Container): Promise<boolean> {
    const exec = await container.exec({
      Cmd: ['bash', '-lc', '[ -z "$(ls -A /workspace 2>/dev/null)" ] && echo empty || echo no'],
      AttachStdout: true,
      AttachStderr: false,
    });
    const stream = await exec.start({ hijack: true, stdin: false });
    const out = new PassThrough();
    const chunks: Buffer[] = [];
    this.docker.modem.demuxStream(stream, out, new PassThrough());
    out.on('data', (d: Buffer) => chunks.push(d));
    await new Promise<void>((resolve) => stream.on('end', resolve));
    return Buffer.concat(chunks).toString('utf8').trim() === 'empty';
  }

  async exec(handle: SandboxHandle, cmd: string, opts: ExecOptions = {}): Promise<ExecResult> {
    this.touch(handle.projectId);
    const container = this.container(handle);
    const base = ['bash', '-lc', cmd];
    const wrapped =
      opts.timeoutMs && opts.timeoutMs > 0
        ? ['timeout', `${Math.ceil(opts.timeoutMs / 1000)}s`, ...base]
        : base;
    const exec = await container.exec({
      Cmd: wrapped,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: opts.cwd ?? WORKDIR,
      Env: envToArray(opts.env),
    });
    const stream = await exec.start({ hijack: true, stdin: false });
    const out = new PassThrough();
    const err = new PassThrough();
    this.docker.modem.demuxStream(stream, out, err);
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    out.on('data', (d: Buffer) => stdoutChunks.push(d));
    err.on('data', (d: Buffer) => stderrChunks.push(d));
    await new Promise<void>((resolve) => stream.on('end', resolve));
    const info = await exec.inspect();
    return {
      exitCode: info.ExitCode ?? 0,
      stdout: Buffer.concat(stdoutChunks).toString('utf8'),
      stderr: Buffer.concat(stderrChunks).toString('utf8'),
    };
  }

  async spawn(handle: SandboxHandle, cmd: string, opts: SpawnOptions = {}): Promise<ProcessHandle> {
    this.touch(handle.projectId);
    const container = this.container(handle);
    const token = id();
    const pidFile = `/tmp/praxis-${token}.pid`;
    // Record the in-container PID, then exec the command in its place so the
    // PID stays valid for kill().
    const wrapped = `echo $$ > ${pidFile}; exec bash -lc ${shSingleQuote(cmd)}`;
    const exec = await container.exec({
      Cmd: ['bash', '-lc', wrapped],
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: opts.cwd ?? WORKDIR,
      Env: envToArray(opts.env),
    });
    const stream = (await exec.start({ hijack: true, stdin: true })) as Duplex;
    const out = new PassThrough();
    const err = new PassThrough();
    this.docker.modem.demuxStream(stream, out, err);
    stream.on('end', () => {
      out.end();
      err.end();
    });

    const pid = await this.readPid(container, pidFile);

    return {
      pid,
      stdout: toStringIterable(out),
      stderr: toStringIterable(err),
      write: async (data: string) => {
        stream.write(data);
      },
      kill: async (signal: NodeJS.Signals = 'SIGTERM') => {
        await this.execSimple(container, ['kill', `-${signal}`, String(pid)]);
      },
      wait: async () => {
        for (;;) {
          const info = await exec.inspect();
          if (!info.Running) return info.ExitCode ?? 0;
          await new Promise((r) => setTimeout(r, 150));
        }
      },
    };
  }

  private async readPid(container: Docker.Container, pidFile: string): Promise<number> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const exec = await container.exec({
        Cmd: ['cat', pidFile],
        AttachStdout: true,
        AttachStderr: false,
      });
      const stream = await exec.start({ hijack: true, stdin: false });
      const out = new PassThrough();
      const chunks: Buffer[] = [];
      this.docker.modem.demuxStream(stream, out, new PassThrough());
      out.on('data', (d: Buffer) => chunks.push(d));
      await new Promise<void>((resolve) => stream.on('end', resolve));
      const text = Buffer.concat(chunks).toString('utf8').trim();
      const n = Number.parseInt(text, 10);
      if (Number.isFinite(n) && n > 0) return n;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('failed to read spawned process pid');
  }

  async writeFile(handle: SandboxHandle, path: string, content: string): Promise<void> {
    const container = this.container(handle);
    const abs = inWorkspace(path);
    const dir = posix.dirname(abs);
    const base = posix.basename(abs);
    await this.execSimple(container, ['mkdir', '-p', dir]);
    const pack = tar.pack();
    pack.entry({ name: base }, content);
    pack.finalize();
    await container.putArchive(pack as unknown as NodeJS.ReadableStream, { path: dir });
  }

  async readFile(handle: SandboxHandle, path: string): Promise<string> {
    const container = this.container(handle);
    const abs = inWorkspace(path);
    const stream = await container.getArchive({ path: abs });
    return await new Promise<string>((resolve, reject) => {
      const extract = tar.extract();
      const chunks: Buffer[] = [];
      let found = false;
      extract.on('entry', (_header, entryStream, next) => {
        found = true;
        entryStream.on('data', (d: Buffer) => chunks.push(d));
        entryStream.on('end', next);
        entryStream.resume();
      });
      extract.on('finish', () =>
        found
          ? resolve(Buffer.concat(chunks).toString('utf8'))
          : reject(new Error('file not found')),
      );
      extract.on('error', reject);
      (stream as NodeJS.ReadableStream).pipe(extract);
    });
  }

  watchFiles(handle: SandboxHandle, cb: (event: FileEvent) => void): Unsubscribe {
    const container = this.container(handle);
    const token = id();
    const pidFile = `/tmp/praxis-${token}.pid`;
    let stream: Duplex | null = null;
    let pid: number | undefined;
    let stopped = false;

    void (async () => {
      const wrapped =
        `echo $$ > ${pidFile}; ` +
        `exec inotifywait -m -r -q -e create,modify,delete,move --format '%e|%w%f' ${WORKDIR}`;
      const exec = await container.exec({
        Cmd: ['bash', '-lc', wrapped],
        AttachStdout: true,
        AttachStderr: true,
      });
      stream = (await exec.start({ hijack: true, stdin: false })) as Duplex;
      if (stopped) {
        stream.destroy();
        return;
      }
      const out = new PassThrough();
      this.docker.modem.demuxStream(stream, out, new PassThrough());
      let buf = '';
      out.on('data', (d: Buffer) => {
        buf += d.toString('utf8');
        let nl: number;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          const ev = parseInotifyLine(line);
          if (ev && !stopped) cb(ev);
        }
      });
      pid = await this.readPid(container, pidFile).catch(() => undefined);
    })();

    return () => {
      stopped = true;
      if (stream) stream.destroy();
      if (pid) void this.execSimple(container, ['kill', String(pid)]).catch(() => {});
    };
  }

  async exposePort(handle: SandboxHandle, port: number): Promise<string> {
    const info = await this.container(handle).inspect();
    const networks = info.NetworkSettings?.Networks ?? {};
    let ip = info.NetworkSettings?.IPAddress || '';
    for (const net of Object.values(networks)) {
      if (net?.IPAddress) {
        ip = net.IPAddress;
        break;
      }
    }
    if (!ip) throw new Error('sandbox container has no network IP');
    return `http://${ip}:${port}`;
  }

  async stop(handle: SandboxHandle): Promise<void> {
    const container = this.container(handle);
    // Snapshot the project to durable storage before tearing the container down.
    if (this.store) {
      try {
        await this.snapshot(handle, container);
      } catch {
        // Best-effort; the named volume still holds state for a local restart.
      }
    }
    try {
      await container.stop({ t: 5 });
    } catch {
      // already stopped or gone — fall through to remove
    }
    // Remove the container but keep the named project volume for restart.
    await container.remove({ force: true, v: false });
    this.activity.delete(handle.projectId);
  }

  /** Tar /workspace out of the container and PUT it to the object store. */
  private async snapshot(handle: SandboxHandle, container: Docker.Container): Promise<void> {
    if (!this.store) return;
    const archive = (await container.getArchive({ path: WORKDIR })) as NodeJS.ReadableStream;
    await this.store.putSnapshot(handle.projectId, Readable.from(archive));
  }

  /** Restore a project's snapshot tarball into the container's /workspace. */
  private async restore(handle: SandboxHandle, container: Docker.Container): Promise<boolean> {
    if (!this.store) return false;
    const snap = await this.store.getSnapshot(handle.projectId);
    if (!snap) return false;
    // getArchive(/workspace) tars entries as `workspace/…`; extract at `/`.
    await container.putArchive(snap as unknown as NodeJS.ReadableStream, { path: '/' });
    return true;
  }

  /**
   * Running sandboxes whose last exec/spawn activity is older than `idleMs`.
   * Sandboxes started by a previous process (no in-memory activity) fall back
   * to their container start time, so they age out rather than persist forever.
   */
  async listIdle(idleMs: number, now: number = Date.now()): Promise<SandboxHandle[]> {
    const list = await this.docker.listContainers({
      filters: { label: ['praxis.projectId'], status: ['running'] },
    });
    const idle: SandboxHandle[] = [];
    for (const c of list) {
      const projectId = c.Labels['praxis.projectId'];
      if (!projectId) continue;
      const last = this.activity.get(projectId) ?? c.Created * 1000;
      if (now - last > idleMs) idle.push({ projectId, containerId: c.Id });
    }
    return idle;
  }
}

function parseInotifyLine(line: string): FileEvent | null {
  const sep = line.indexOf('|');
  if (sep < 0) return null;
  const events = line.slice(0, sep).split(',');
  const fullPath = line.slice(sep + 1);
  const path = fullPath.replace(new RegExp(`^${WORKDIR}/?`), '');
  let type: FileEventType | null = null;
  if (events.includes('DELETE') || events.includes('MOVED_FROM')) type = 'delete';
  else if (events.includes('CREATE') || events.includes('MOVED_TO')) type = 'create';
  else if (events.includes('MODIFY')) type = 'modify';
  if (!type || !path) return null;
  return { type, path };
}

export { parseInotifyLine };
