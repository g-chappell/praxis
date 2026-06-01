// The Sandbox abstraction — one of the two load-bearing interfaces in Praxis
// (the other is AcpHost). Consumers depend ONLY on this interface, never on
// Docker/dockerode directly, so the implementation (DockerSandbox today;
// E2BSandbox / FirecrackerSandbox later) is swappable without touching them.
// Changing this interface's shape requires an ADR — see ADR-0007.
//
// The `Sandbox` interface below is reproduced verbatim from project_plan.md §6.

/** Opaque handle to a running sandbox. Returned by start(), passed to every
 *  other method. Implementations may carry extra private fields. */
export interface SandboxHandle {
  /** The project this sandbox hosts. */
  readonly projectId: string;
  /** Implementation-specific id (e.g. the Docker container id). */
  readonly containerId: string;
}

export interface ExecOptions {
  /** Working directory inside the sandbox. Defaults to the project root. */
  cwd?: string;
  /** Extra environment variables for this command. */
  env?: Record<string, string>;
  /** Abort the command after this many milliseconds. */
  timeoutMs?: number;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
}

/** A long-running process inside the sandbox (a dev server, the agent, …).
 *  stdout/stderr stream as chunks; the process is driven via write/kill and
 *  awaited via wait(). */
export interface ProcessHandle {
  readonly pid: number;
  readonly stdout: AsyncIterable<string>;
  readonly stderr: AsyncIterable<string>;
  /** Write to the process's stdin. */
  write(data: string): Promise<void>;
  /** Send a signal (default SIGTERM). */
  kill(signal?: NodeJS.Signals): Promise<void>;
  /** Resolve with the exit code once the process terminates. */
  wait(): Promise<number>;
}

export type FileEventType = 'create' | 'modify' | 'delete';

export interface FileEvent {
  type: FileEventType;
  /** Path relative to the project root. */
  path: string;
}

/** Returned by watchFiles(); call to stop receiving events. */
export type Unsubscribe = () => void;

export interface Sandbox {
  start(projectId: string, templateId: string): Promise<SandboxHandle>;
  exec(handle: SandboxHandle, cmd: string, opts?: ExecOptions): Promise<ExecResult>;
  spawn(handle: SandboxHandle, cmd: string, opts?: SpawnOptions): Promise<ProcessHandle>;
  writeFile(handle: SandboxHandle, path: string, content: string): Promise<void>;
  readFile(handle: SandboxHandle, path: string): Promise<string>;
  watchFiles(handle: SandboxHandle, cb: (event: FileEvent) => void): Unsubscribe;
  exposePort(handle: SandboxHandle, port: number): Promise<string>;
  stop(handle: SandboxHandle): Promise<void>;
}
