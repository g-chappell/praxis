import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';
import type { Agent, RequestPermissionOutcome } from '@agentclientprotocol/sdk';
import type { ProcessHandle, Sandbox, SandboxHandle } from '@praxis/sandbox';
import { describe, expect, it, vi } from 'vitest';

import { ClaudeAcpHost } from './acp-host.js';
import type { AcpEvent, PermissionRequest } from './events.js';

const HANDLE: SandboxHandle = { projectId: 'p1', containerId: 'c1' };
const SESSION = 'session-1';

// Wire the host and a real ACP agent (AgentSideConnection) together over two
// in-memory byte pipes, fronted by a fake Sandbox/ProcessHandle. This exercises
// the real ACP protocol on both sides — only the agent's logic is a fixture, so
// we never mock ACP itself (AGENTS.md testing patterns).
function harness(toAgent: (conn: AgentSideConnection) => Agent): {
  sandbox: Sandbox;
  spawn: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
} {
  const hostToAgent = new TransformStream<Uint8Array, Uint8Array>();
  const agentToHost = new TransformStream<Uint8Array, Uint8Array>();
  const hostWriter = hostToAgent.writable.getWriter();
  const encoder = new TextEncoder();

  const kill = vi.fn(async () => {
    await hostWriter.close().catch(() => {});
  });
  const proc: ProcessHandle = {
    pid: 4242,
    stdout: readStrings(agentToHost.readable),
    stderr: (async function* () {})(),
    write: async (data: string) => {
      await hostWriter.write(encoder.encode(data));
    },
    kill,
    wait: async () => 0,
  };

  // The agent side speaks ACP over the opposite ends of the two pipes.
  new AgentSideConnection(toAgent, ndJsonStream(agentToHost.writable, hostToAgent.readable));

  const spawn = vi.fn(async () => proc);
  const sandbox = { spawn } as unknown as Sandbox;
  return { sandbox, spawn, kill };
}

// Build an Agent fixture with `prompt` (and optionally other handlers); the
// boilerplate ACP methods get inert defaults so each test states only what it
// exercises.
function makeAgent(
  promptFor: (conn: AgentSideConnection) => Agent['prompt'],
): (conn: AgentSideConnection) => Agent {
  return (conn) => ({
    async initialize() {
      return { protocolVersion: PROTOCOL_VERSION };
    },
    async newSession() {
      return { sessionId: SESSION };
    },
    async authenticate() {
      return {};
    },
    async cancel() {},
    prompt: promptFor(conn),
  });
}

async function* readStrings(readable: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = readable.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) yield decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

async function collect(events: AsyncIterable<AcpEvent>): Promise<AcpEvent[]> {
  const out: AcpEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

const allow = async (): Promise<'allow'> => 'allow';

describe('ClaudeAcpHost.spawnAndPrompt', () => {
  it('streams text chunks and completes the turn (happy path)', async () => {
    const { sandbox, spawn } = harness(
      makeAgent((conn) => async ({ sessionId }) => {
        await conn.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'hello ' },
          },
        });
        await conn.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: 'world' },
          },
        });
        return {
          stopReason: 'end_turn',
          usage: { inputTokens: 12, outputTokens: 5, totalTokens: 17 },
        };
      }),
    );

    const host = new ClaudeAcpHost();
    const events = await collect(
      host.spawnAndPrompt(sandbox, HANDLE, 'sk-ant-test', 'hi', { onPermission: allow }),
    );

    expect(events).toEqual([
      { type: 'text-chunk', text: 'hello ' },
      { type: 'text-chunk', text: 'world' },
      {
        type: 'turn-complete',
        stopReason: 'end_turn',
        usage: { inputTokens: 12, outputTokens: 5 },
      },
    ]);

    // Authenticates with the platform API key and nothing else (ADR-0009).
    const [, command, opts] = spawn.mock.calls[0]!;
    expect(command).toBe('claude-agent-acp');
    expect(opts?.env).toEqual({ ANTHROPIC_API_KEY: 'sk-ant-test' });
  });

  it('surfaces a tool-permission request and proceeds when allowed', async () => {
    let outcome: RequestPermissionOutcome | undefined;
    const { sandbox } = harness(
      makeAgent((conn) => async ({ sessionId }) => {
        const response = await conn.requestPermission({
          sessionId,
          options: [
            { optionId: 'a', name: 'Allow', kind: 'allow_once' },
            { optionId: 'd', name: 'Deny', kind: 'reject_once' },
          ],
          toolCall: { toolCallId: 'tool-1', title: 'Write file', rawInput: { path: 'a.txt' } },
        });
        outcome = response.outcome;
        if (response.outcome.outcome === 'selected' && response.outcome.optionId === 'a') {
          await conn.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: 'tool_call',
              toolCallId: 'tool-1',
              title: 'Write file',
              rawInput: { path: 'a.txt' },
            },
          });
          await conn.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: 'tool_call_update',
              toolCallId: 'tool-1',
              status: 'completed',
              rawOutput: { ok: true },
            },
          });
        }
        return { stopReason: 'end_turn' };
      }),
    );

    const seen: PermissionRequest[] = [];
    const host = new ClaudeAcpHost();
    const events = await collect(
      host.spawnAndPrompt(sandbox, HANDLE, 'sk-ant-test', 'write a.txt', {
        onPermission: async (request) => {
          seen.push(request);
          return 'allow';
        },
      }),
    );

    expect(seen).toEqual([{ toolCallId: 'tool-1', title: 'Write file', input: { path: 'a.txt' } }]);
    expect(outcome).toEqual({ outcome: 'selected', optionId: 'a' });
    expect(events).toEqual([
      { type: 'tool-call', toolCallId: 'tool-1', title: 'Write file', input: { path: 'a.txt' } },
      { type: 'tool-result', toolCallId: 'tool-1', isError: false, output: { ok: true } },
      { type: 'turn-complete', stopReason: 'end_turn', usage: null },
    ]);
  });

  it('rejects the tool and completes cleanly when denied', async () => {
    let outcome: RequestPermissionOutcome | undefined;
    const { sandbox } = harness(
      makeAgent((conn) => async ({ sessionId }) => {
        const response = await conn.requestPermission({
          sessionId,
          options: [
            { optionId: 'a', name: 'Allow', kind: 'allow_once' },
            { optionId: 'd', name: 'Deny', kind: 'reject_once' },
          ],
          toolCall: { toolCallId: 'tool-1', title: 'Delete repo', rawInput: { path: '/' } },
        });
        outcome = response.outcome;
        return { stopReason: 'end_turn' };
      }),
    );

    const host = new ClaudeAcpHost();
    const events = await collect(
      host.spawnAndPrompt(sandbox, HANDLE, 'sk-ant-test', 'delete everything', {
        onPermission: async () => 'deny',
      }),
    );

    expect(outcome).toEqual({ outcome: 'selected', optionId: 'd' });
    expect(events.some((e) => e.type === 'tool-result')).toBe(false);
    expect(events).toContainEqual({ type: 'turn-complete', stopReason: 'end_turn', usage: null });
  });

  it('shuts the agent process down after the turn drains', async () => {
    const { sandbox, kill } = harness(makeAgent(() => async () => ({ stopReason: 'end_turn' })));

    const host = new ClaudeAcpHost();
    await collect(
      host.spawnAndPrompt(sandbox, HANDLE, 'sk-ant-test', 'noop', { onPermission: allow }),
    );

    expect(kill).toHaveBeenCalledOnce();
  });
});
