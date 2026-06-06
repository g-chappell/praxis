#!/usr/bin/env node
// image-gen MCP server (STORY-15/TASK-042). Exposes a `generate_image` tool over
// stdio that Claude Code (in the sandbox) calls to create textures from a prompt.
// Backed by the OpenAI Images API; the key comes from OPENAI_API_KEY in the env
// (never committed — see the .mcp.json ${OPENAI_API_KEY} expansion in TASK-044).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import OpenAI from 'openai';
import { z } from 'zod';

import { generateImage, type ImagesClient } from './generate.js';
import { checkUsageAllowed } from './usage.js';

const WORKSPACE_ROOT = process.env.PRAXIS_WORKSPACE_ROOT ?? '/workspace';
const TEXTURES_DIR = process.env.PRAXIS_TEXTURES_DIR ?? `${WORKSPACE_ROOT}/public/textures`;
const MODEL = process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-1';
// Usage-cap wiring (TASK-043): set by the orchestrator when it spawns the sandbox.
const USAGE_URL = process.env.PRAXIS_MCP_USAGE_URL;
const USAGE_TOKEN = process.env.PRAXIS_MCP_TOKEN;

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // stdout is the JSON-RPC channel — diagnostics go to stderr only.
    console.error('[mcp-image-gen] OPENAI_API_KEY is not set; refusing to start');
    process.exit(1);
  }
  const client = new OpenAI({ apiKey }) as unknown as ImagesClient;
  const server = new McpServer({ name: 'image-gen', version: '0.0.0' });

  server.registerTool(
    'generate_image',
    {
      title: 'Generate image',
      description:
        'Generate an image (e.g. a texture) from a text prompt and save it as a PNG in the project — by default under public/textures/. Returns the saved path so the scene can load it.',
      inputSchema: {
        prompt: z.string().describe('What to generate, e.g. "seamless mossy stone texture"'),
        width: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Requested width in px (default 1024)'),
        height: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Requested height in px (default 1024)'),
        save_path: z
          .string()
          .optional()
          .describe(
            'Save location relative to the project root; defaults to public/textures/<slug>.png',
          ),
      },
    },
    async ({ prompt, width, height, save_path }) => {
      try {
        const usage = await checkUsageAllowed({
          url: USAGE_URL,
          token: USAGE_TOKEN,
          tool: 'generate_image',
        });
        if (!usage.allowed) {
          return {
            content: [{ type: 'text', text: `Image generation refused: ${usage.reason}` }],
            isError: true,
          };
        }
        const path = await generateImage(
          { prompt, width, height, save_path },
          { client, texturesDir: TEXTURES_DIR, workspaceRoot: WORKSPACE_ROOT, model: MODEL },
        );
        return { content: [{ type: 'text', text: `Saved image to ${path}` }] };
      } catch (err) {
        return {
          content: [
            {
              type: 'text',
              text: `Image generation failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  console.error('[mcp-image-gen] fatal', err);
  process.exit(1);
});
