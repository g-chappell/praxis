// The AcpHost interface — one of the two load-bearing abstractions in Praxis
// (the other is Sandbox). Consumers depend ONLY on this interface, never on the
// ACP client library or the agent adapter directly, so the transport (the Zed
// Claude adapter today; a native-ACP agent later) is swappable without touching
// them. Changing this interface's shape requires an ADR — see ADR-0009.
//
// The implementation lands in TASK-025.

import type { Sandbox, SandboxHandle } from '@praxis/sandbox';
import type { AcpEvent, PermissionDecision, PermissionRequest } from './events.js';

export interface SpawnAndPromptOptions {
  /** Called when the agent requests permission to use a tool. Resolving with
   *  'deny' rejects the call and cancels the turn cleanly. */
  onPermission(request: PermissionRequest): Promise<PermissionDecision>;
  /** Abort the turn: shuts the agent down and ends the iterator. */
  signal?: AbortSignal;
}

/** Spawns the agent inside a sandbox, drives one prompt turn over ACP, and
 *  streams typed events. See ADR-0009 for the transport (Zed adapter on a
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
