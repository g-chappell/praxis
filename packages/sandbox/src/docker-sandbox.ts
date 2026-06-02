// DockerSandbox — the POC `Sandbox` implementation (ADR-0007), backed by a
// per-project Docker container created from `praxis-sandbox-base`. Nothing
// outside this file imports dockerode; consumers use the `Sandbox` interface.

import { type ChildProcessWithoutNullStreams, spawn as spawnProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as posix from 'node:path/posix';
import { PassThrough, Readable } from 'node:stream';

import Docker from 'dockerode';
import * as tar from 'tar-stream';

// dockerode handles the container/volume/archive lifecycle (plain HTTP). For
// exec'ing into containers we shell out to the `docker` CLI instead: dockerode's
// hijacked exec stream (HTTP 101 upgrade) doesn't work under Bun, whereas the CLI
// attaches stdio natively and runs identically under Bun (prod) and Node (tests).
const DOCKER_CLI = 'docker';

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

function inWorkspace(p: string): string {
  return p.startsWith('/') ? p : posix.join(WORKDIR, p);
}

async function* toStringIterable(stream: Readable): AsyncIterable<string> {
  for await (const chunk of stream) {
    yield typeof chunk === 'string' ? chunk : (chunk as Buffer).toString('utf8');
  }
}

/** Run `docker exec` as a child process. The CLI demultiplexes stdout/stderr and
 *  handles the stdio attach natively (unlike dockerode under Bun). */
function dockerExec(
  containerId: string,
  argv: string[],
  opts: { stdin?: boolean; cwd?: string; env?: Record<string, string> } = {},
): ChildProcessWithoutNullStreams {
  const args = ['exec'];
  if (opts.stdin) args.push('-i');
  args.push('-w', opts.cwd ?? WORKDIR);
  for (const [k, v] of Object.entries(opts.env ?? {})) args.push('-e', `${k}=${v}`);
  args.push(containerId, ...argv);
  return spawnProcess(DOCKER_CLI, args, { stdio: ['pipe', 'pipe', 'pipe'] });
}

/** Run a command via `docker exec` and collect stdout/stderr + exit code. */
function execCapture(
  containerId: string,
  argv: string[],
  opts: { cwd?: string; env?: Record<string, string> } = {},
): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const proc = dockerExec(containerId, argv, opts);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    proc.stdout.on('data', (d: Buffer) => out.push(d));
    proc.stderr.on('data', (d: Buffer) => err.push(d));
    proc.on('error', reject);
    proc.on('close', (code) =>
      resolve({
        exitCode: code ?? 0,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      }),
    );
  });
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
  private async execSimple(containerId: string, cmd: string[]): Promise<number> {
    const { exitCode } = await execCapture(containerId, cmd);
    return exitCode;
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
    if (this.store && (await this.isWorkspaceEmpty(handle.containerId))) {
      await this.restore(handle, container);
    }
    // Initialise git in the project dir if still fresh after any restore.
    await this.execSimple(handle.containerId, [
      'bash',
      '-lc',
      'cd /workspace && [ -d .git ] || git init -q',
    ]);
    return handle;
  }

  private async isWorkspaceEmpty(containerId: string): Promise<boolean> {
    const { stdout } = await execCapture(containerId, [
      'bash',
      '-lc',
      '[ -z "$(ls -A /workspace 2>/dev/null)" ] && echo empty || echo no',
    ]);
    return stdout.trim() === 'empty';
  }

  async exec(handle: SandboxHandle, cmd: string, opts: ExecOptions = {}): Promise<ExecResult> {
    this.touch(handle.projectId);
    const base = ['bash', '-lc', cmd];
    const argv =
      opts.timeoutMs && opts.timeoutMs > 0
        ? ['timeout', `${Math.ceil(opts.timeoutMs / 1000)}s`, ...base]
        : base;
    return execCapture(handle.containerId, argv, { cwd: opts.cwd, env: opts.env });
  }

  async spawn(handle: SandboxHandle, cmd: string, opts: SpawnOptions = {}): Promise<ProcessHandle> {
    this.touch(handle.projectId);
    const { containerId } = handle;
    const token = id();
    const pidFile = `/tmp/praxis-${token}.pid`;
    // Record the in-container PID, then exec the command in its place so the
    // PID stays valid for kill() (killing the local `docker exec` wouldn't stop
    // the in-container process).
    const wrapped = `echo $$ > ${pidFile}; exec bash -lc ${shSingleQuote(cmd)}`;
    const proc = dockerExec(containerId, ['bash', '-lc', wrapped], {
      stdin: true,
      cwd: opts.cwd,
      env: opts.env,
    });

    // Buffer stdout/stderr eagerly. We `await readPid` before returning, and the
    // caller attaches its consumer later still — without an immediate sink the
    // output emitted in that window would be lost.
    const out = new PassThrough();
    const err = new PassThrough();
    proc.stdout.pipe(out);
    proc.stderr.pipe(err);

    // Capture the exit code eagerly — `close` fires once, so a listener attached
    // lazily in wait() would miss it if the process already exited.
    // `docker exec` (foreground) exits with the in-container command's code.
    const exited = new Promise<number>((resolve) => {
      proc.on('close', (code) => resolve(code ?? 0));
    });

    const pid = await this.readPid(containerId, pidFile);

    return {
      pid,
      stdout: toStringIterable(out),
      stderr: toStringIterable(err),
      write: async (data: string) => {
        proc.stdin.write(data);
      },
      kill: async (signal: NodeJS.Signals = 'SIGTERM') => {
        await this.execSimple(containerId, ['kill', `-${signal}`, String(pid)]);
      },
      wait: () => exited,
    };
  }

  private async readPid(containerId: string, pidFile: string): Promise<number> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const { stdout } = await execCapture(containerId, ['cat', pidFile]);
      const n = Number.parseInt(stdout.trim(), 10);
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
    await this.execSimple(handle.containerId, ['mkdir', '-p', dir]);
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
    const { containerId } = handle;
    const token = id();
    const pidFile = `/tmp/praxis-${token}.pid`;
    let proc: ChildProcessWithoutNullStreams | null = null;
    let pid: number | undefined;
    let stopped = false;

    void (async () => {
      try {
        const wrapped =
          `echo $$ > ${pidFile}; ` +
          `exec inotifywait -m -r -q -e create,modify,delete,move --format '%e|%w%f' ${WORKDIR}`;
        proc = dockerExec(containerId, ['bash', '-lc', wrapped]);
        if (stopped) {
          proc.kill();
          return;
        }
        proc.stderr.resume();
        let buf = '';
        proc.stdout.on('data', (d: Buffer) => {
          buf += d.toString('utf8');
          let nl: number;
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            const ev = parseInotifyLine(line);
            if (ev && !stopped) cb(ev);
          }
        });
        pid = await this.readPid(containerId, pidFile).catch(() => undefined);
      } catch {
        // The container was torn down mid-setup, or the exec failed — there is
        // nothing to watch. Never surface as an unhandled rejection.
      }
    })();

    return () => {
      stopped = true;
      if (proc) proc.kill();
      if (pid) void this.execSimple(containerId, ['kill', String(pid)]).catch(() => {});
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
    // remove(force) stops a running container and removes it in one call.
    // Tolerate "already gone" (404) and "removal already in progress" (409),
    // which race when stop() and the daemon's own cleanup overlap.
    try {
      await container.remove({ force: true, v: false });
    } catch (err) {
      if (!isAlreadyGone(err)) throw err;
    }
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

/** True for dockerode errors meaning the container is already gone or being
 *  removed — safe to treat stop() as succeeded. */
function isAlreadyGone(err: unknown): boolean {
  const code = (err as { statusCode?: number } | null)?.statusCode;
  return code === 404 || code === 409;
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
