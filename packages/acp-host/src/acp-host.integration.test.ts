import { randomBytes } from 'node:crypto';

import { DockerSandbox } from '@praxis/sandbox';
import type { SandboxHandle } from '@praxis/sandbox';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ClaudeAcpHost } from './acp-host.js';
import type { AcpEvent } from './events.js';

// End-to-end prompt round-trip against a REAL DockerSandbox running the
// claude-agent-acp adapter on a real Anthropic API key (ADR-0009). Two gates:
//   RUN_DOCKER_TESTS=1   — a Docker daemon is available (as in @praxis/sandbox)
//   ANTHROPIC_API_KEY    — a live key; the consent flow can't run in CI, and a
//                          subscription token must never be used here
// CI runs neither by default — determinism comes from the recorded-agent unit
// tests in acp-host.test.ts; this is the live signal, run locally / nightly.
// Requires the base image to ship `claude-agent-acp` (operator follow-up).
const API_KEY = process.env.ANTHROPIC_API_KEY;
const RUN = process.env.RUN_DOCKER_TESTS === '1' && !!API_KEY;

if (process.env.RUN_DOCKER_TESTS === '1' && !API_KEY) {
  console.warn('[acp-host] skipping live ACP round-trip: ANTHROPIC_API_KEY is not set');
}

const describeLive = RUN ? describe : describe.skip;
const TURN_TIMEOUT = 30_000;

describeLive('ClaudeAcpHost round-trip (real sandbox + agent)', () => {
  const sandbox = new DockerSandbox();
  const host = new ClaudeAcpHost();
  const projectId = `acp-test-${randomBytes(6).toString('hex')}`;
  let handle: SandboxHandle;

  beforeAll(async () => {
    handle = await sandbox.start(projectId, 'react-threejs-scene');
  }, TURN_TIMEOUT);

  afterAll(async () => {
    try {
      await sandbox.stop(handle);
    } catch {
      /* ignore */
    }
  }, TURN_TIMEOUT);

  it(
    'streams a text response and completes the turn',
    async () => {
      const events: AcpEvent[] = [];
      for await (const event of host.spawnAndPrompt(
        sandbox,
        handle,
        API_KEY!,
        'Reply with exactly the word: pong',
        { onPermission: async () => 'allow' },
      )) {
        events.push(event);
      }

      const errors = events.filter((e) => e.type === 'error');
      expect(errors, JSON.stringify(errors)).toHaveLength(0);
      expect(events.some((e) => e.type === 'text-chunk' && e.text.length > 0)).toBe(true);
      expect(events.at(-1)?.type).toBe('turn-complete');
    },
    TURN_TIMEOUT,
  );
});
