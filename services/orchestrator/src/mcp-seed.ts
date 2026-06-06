// Seed the image-gen MCP server into a project's sandbox (STORY-15/TASK-044, per
// ADR-0018 Path A). The orchestrator writes Claude-Code discovery config into
// /workspace (no secrets — committable) so the adapter auto-connects the stdio
// server baked into sandbox-base, and delivers the OpenAI key + per-room usage
// token via an ephemeral cred file at an ABSOLUTE path OUTSIDE /workspace (so it
// is never git-committed nor MinIO-snapshotted, and never enters the sacred
// acp-host spawn env). Kept out of DockerSandbox: the Sandbox impl stays generic;
// this MCP-specific wiring uses only writeFile/readFile (Pick, so tests fake it).

import type { Sandbox, SandboxHandle } from '@praxis/sandbox';

import { logger } from './logger';

type SeedSandbox = Pick<Sandbox, 'readFile' | 'writeFile'>;

/** Absolute path (outside /workspace) of the ephemeral cred file the in-sandbox
 *  server reads on startup via PRAXIS_MCP_CONFIG. */
export const MCP_CRED_PATH = '/run/praxis-mcp/config.json';

const MCP_JSON_PATH = '.mcp.json';
const CLAUDE_SETTINGS_PATH = '.claude/settings.json';

/** Claude-Code project MCP config (no secrets). `command` resolves to the wrapper
 *  baked into sandbox-base; the server reads its secrets from PRAXIS_MCP_CONFIG. */
function mcpJson(): string {
  return `${JSON.stringify(
    {
      mcpServers: {
        'image-gen': {
          command: 'praxis-mcp-image-gen',
          args: [],
          env: {
            PRAXIS_MCP_CONFIG: MCP_CRED_PATH,
            PRAXIS_WORKSPACE_ROOT: '/workspace',
          },
        },
      },
    },
    null,
    2,
  )}\n`;
}

/** Read-merge /workspace/.claude/settings.json so `enableAllProjectMcpServers`
 *  is set without clobbering any other keys a template (or the agent) may add. */
async function settingsWithMcpEnabled(
  sandbox: SeedSandbox,
  handle: SandboxHandle,
): Promise<string> {
  let settings: Record<string, unknown> = {};
  try {
    const existing = await sandbox.readFile(handle, CLAUDE_SETTINGS_PATH);
    const parsed = JSON.parse(existing) as unknown;
    if (parsed && typeof parsed === 'object') settings = parsed as Record<string, unknown>;
  } catch {
    // No prior settings (or unreadable/malformed) → start fresh.
  }
  settings.enableAllProjectMcpServers = true;
  return `${JSON.stringify(settings, null, 2)}\n`;
}

/** Wire the image-gen server for this session. Writes nothing and returns false
 *  when no OpenAI key is configured (clean degrade: the agent simply gets no
 *  image-gen tool). Returns true once .mcp.json, settings, and the cred file are
 *  in place. The caller gates on the template declaring the server. */
export async function seedImageGenMcp(
  sandbox: SeedSandbox,
  handle: SandboxHandle,
  opts: { openaiKey?: string; usageToken: string; usageUrl: string },
): Promise<boolean> {
  if (!opts.openaiKey) return false;

  await sandbox.writeFile(
    handle,
    CLAUDE_SETTINGS_PATH,
    await settingsWithMcpEnabled(sandbox, handle),
  );
  await sandbox.writeFile(handle, MCP_JSON_PATH, mcpJson());
  await sandbox.writeFile(
    handle,
    MCP_CRED_PATH,
    `${JSON.stringify({
      openaiApiKey: opts.openaiKey,
      usageUrl: opts.usageUrl,
      usageToken: opts.usageToken,
    })}\n`,
  );

  logger.info({ projectId: handle.projectId }, 'mcp.image_gen_wired');
  return true;
}
