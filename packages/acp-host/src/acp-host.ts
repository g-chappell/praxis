// The AcpHost interface + its Claude implementation — one of the two load-bearing
// abstractions in Praxis (the other is Sandbox). Consumers depend ONLY on the
// `AcpHost` interface, never on the ACP client library or the agent adapter
// directly, so the transport (the claude-agent-acp adapter today; a native-ACP
// agent later) is swappable without touching them. Changing this interface's
// shape requires an ADR — see ADR-0009.

import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import type {
  Client,
  PermissionOption,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionUpdate,
  Usage,
} from '@agentclientprotocol/sdk';
import type { ProcessHandle, Sandbox, SandboxHandle } from '@praxis/sandbox';
import type { AcpEvent, PermissionDecision, PermissionRequest, TokenUsage } from './events.js';

export interface SpawnAndPromptOptions {
  /** Called when the agent requests permission to use a tool. Resolving with
   *  'deny' rejects the call and cancels the turn cleanly. */
  onPermission(request: PermissionRequest): Promise<PermissionDecision>;
  /** Abort the turn: cancels the prompt and ends the iterator. */
  signal?: AbortSignal;
}

/** Spawns the agent inside a sandbox, drives one prompt turn over ACP, and
 *  streams typed events. See ADR-0009 for the transport (claude-agent-acp on a
 *  platform-owned Anthropic API key). */
export interface AcpHost {
  /**
   * Spawn the agent in `handle`, send `prompt`, and stream events until the
   * turn completes. `apiKey` is the Anthropic API key the agent authenticates
   * with — the project owner's billing identity (ADR-0009); a single key per
   * call is the owner-pays model.
   */
  spawnAndPrompt(
    sandbox: Sandbox,
    handle: SandboxHandle,
    apiKey: string,
    prompt: string,
    options: SpawnAndPromptOptions,
  ): AsyncIterable<AcpEvent>;
}

/** The ACP agent binary inside the sandbox (the `claude-agent-acp` adapter,
 *  baked into the base image per ADR-0009). It serves ACP over stdio and reads
 *  `ANTHROPIC_API_KEY` from its environment. */
export const ACP_AGENT_COMMAND = 'claude-agent-acp';

/** The sandbox working directory (base image WORKDIR). Must be absolute. */
const WORKSPACE_DIR = '/workspace';

/**
 * `AcpHost` backed by the `claude-agent-acp` adapter (ADR-0009). Talks ACP to
 * an agent process spawned inside the sandbox via the `Sandbox` interface.
 */
export class ClaudeAcpHost implements AcpHost {
  async *spawnAndPrompt(
    sandbox: Sandbox,
    handle: SandboxHandle,
    apiKey: string,
    prompt: string,
    options: SpawnAndPromptOptions,
  ): AsyncIterable<AcpEvent> {
    const proc = await sandbox.spawn(handle, ACP_AGENT_COMMAND, {
      cwd: WORKSPACE_DIR,
      // The agent authenticates with the platform API key. We deliberately pass
      // ONLY this key — no CLAUDE_CODE_OAUTH_TOKEN — so there is no ambiguous or
      // ToS-risky subscription fallback (ADR-0009).
      env: { ANTHROPIC_API_KEY: apiKey },
    });

    const queue = new EventQueue<AcpEvent>();
    let settled = false;
    const finish = (event?: AcpEvent): void => {
      if (settled) return;
      settled = true;
      if (event) queue.push(event);
      queue.close();
    };

    // `sessionId` is set before any agent→client request can fire
    // (requestPermission only arrives during prompt(), after newSession resolves).
    let sessionId: string | undefined;

    const client: Client = {
      async sessionUpdate({ update }) {
        for (const event of mapSessionUpdate(update)) queue.push(event);
      },
      async requestPermission(
        params: RequestPermissionRequest,
      ): Promise<RequestPermissionResponse> {
        const decision = await options.onPermission(toPermissionRequest(params));
        const optionId = pickOption(params.options, decision);
        if (optionId !== undefined) {
          return { outcome: { outcome: 'selected', optionId } };
        }
        // No matching option offered (rare). Cancel the turn cleanly rather than
        // leave the agent waiting.
        if (sessionId !== undefined) {
          await connection.cancel({ sessionId }).catch(() => {});
        }
        return { outcome: { outcome: 'cancelled' } };
      },
    };

    const stream = ndJsonStream(toWritable(proc), toReadable(proc.stdout));
    const connection = new ClientSideConnection(() => client, stream);

    if (options.signal) {
      const onAbort = (): void => {
        if (sessionId !== undefined) {
          connection.cancel({ sessionId }).catch(() => {});
        }
      };
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener('abort', onAbort, { once: true });
    }

    // If the agent process dies before the turn settles, surface it as an error.
    void connection.closed.then(() => {
      finish({ type: 'error', message: 'agent connection closed before the turn completed' });
    });

    void (async () => {
      try {
        await connection.initialize({
          protocolVersion: PROTOCOL_VERSION,
          // Minimal client: the agent runs in the sandbox with direct filesystem
          // access, so we advertise no client-side fs/terminal capabilities.
          clientCapabilities: {},
        });
        const session = await connection.newSession({ cwd: WORKSPACE_DIR, mcpServers: [] });
        sessionId = session.sessionId;
        const response = await connection.prompt({
          sessionId,
          prompt: [{ type: 'text', text: prompt }],
        });
        finish({
          type: 'turn-complete',
          stopReason: response.stopReason,
          usage: toTokenUsage(response.usage),
        });
      } catch (err) {
        finish({ type: 'error', message: errorMessage(err) });
      }
    })();

    try {
      yield* queue;
    } finally {
      await proc.kill().catch(() => {});
    }
  }
}

function mapSessionUpdate(update: SessionUpdate): AcpEvent[] {
  switch (update.sessionUpdate) {
    case 'agent_message_chunk': {
      if (update.content.type === 'text') {
        return [{ type: 'text-chunk', text: update.content.text }];
      }
      return [];
    }
    case 'tool_call':
      return [
        {
          type: 'tool-call',
          toolCallId: update.toolCallId,
          title: update.title,
          input: update.rawInput,
        },
      ];
    case 'tool_call_update': {
      const events: AcpEvent[] = [];
      for (const content of update.content ?? []) {
        if (content.type === 'diff') {
          events.push({
            type: 'file-change',
            change: content.oldText == null ? 'create' : 'modify',
            path: content.path,
          });
        }
      }
      if (update.status === 'completed' || update.status === 'failed') {
        events.push({
          type: 'tool-result',
          toolCallId: update.toolCallId,
          isError: update.status === 'failed',
          output: update.rawOutput,
        });
      }
      return events;
    }
    default:
      // Plans, thoughts, mode/usage updates, etc. are not surfaced for the POC.
      return [];
  }
}

function toPermissionRequest(params: RequestPermissionRequest): PermissionRequest {
  return {
    toolCallId: params.toolCall.toolCallId,
    title: params.toolCall.title ?? params.toolCall.toolCallId,
    input: params.toolCall.rawInput,
  };
}

/** Map an allow/deny decision onto one of the agent's offered permission
 *  options. Returns undefined when no option of the requested polarity exists. */
function pickOption(options: PermissionOption[], decision: PermissionDecision): string | undefined {
  const preferred =
    decision === 'allow'
      ? (['allow_once', 'allow_always'] as const)
      : (['reject_once', 'reject_always'] as const);
  for (const kind of preferred) {
    const match = options.find((option) => option.kind === kind);
    if (match) return match.optionId;
  }
  return undefined;
}

function toTokenUsage(usage: Usage | null | undefined): TokenUsage | null {
  if (!usage) return null;
  return { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Adapt the sandbox process's stdin (`write`) into the byte WritableStream the
 *  ACP ndJsonStream encodes into. */
function toWritable(proc: ProcessHandle): WritableStream<Uint8Array> {
  const decoder = new TextDecoder();
  return new WritableStream<Uint8Array>({
    async write(chunk) {
      await proc.write(decoder.decode(chunk, { stream: true }));
    },
  });
}

/** Adapt the sandbox process's stdout (`AsyncIterable<string>`) into the byte
 *  ReadableStream the ACP ndJsonStream decodes from. */
function toReadable(chunks: AsyncIterable<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/**
 * Minimal unbounded async queue that bridges the ACP client's push-based
 * callbacks (`sessionUpdate`) to the pull-based `AsyncIterable<AcpEvent>` the
 * caller consumes. Buffered events drain before `done` is reported.
 */
class EventQueue<T> implements AsyncIterable<T> {
  private readonly items: T[] = [];
  private readonly waiters: ((result: IteratorResult<T>) => void)[] = [];
  private closed = false;

  push(item: T): void {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value: item, done: false });
    else this.items.push(item);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    let waiter = this.waiters.shift();
    while (waiter) {
      waiter({ value: undefined, done: true });
      waiter = this.waiters.shift();
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        const item = this.items.shift();
        if (item !== undefined) return Promise.resolve({ value: item, done: false });
        if (this.closed) return Promise.resolve({ value: undefined, done: true });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
    };
  }
}
