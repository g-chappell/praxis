// Praxis orchestrator entrypoint. Bun-only runtime.
//
// Loads the HTTP app + mounts the WebSocket route (which requires Bun
// globals). For in-process testing under Node, import { app } from
// './app' instead — keeps tests Node-compatible.

import type { ServerWebSocket } from 'bun';

import { app } from './app';
import { logger } from './logger';
import { startIdleSweep } from './sandbox-sweep';
import { isPreviewSocket, previewWebsocket, tryPreviewUpgrade } from './routes/preview-ws';
import { websocket, wsRoute } from './routes/ws';
import { VERSION } from './version';

app.route('/ws', wsRoute);

// Roadmap text said :4000 but the autodev-mcp dashboard owns :4000
// on this VPS. See ADR-0004 port-allocation note.
const PORT = Number(process.env.PORT ?? 4001);

// The Hono session-socket handler, viewed structurally so we can dispatch the one
// Bun `websocket` handler across two data shapes (Hono's + the preview tunnel's).
const sessionWs = websocket as unknown as {
  open?: (ws: ServerWebSocket<unknown>) => void;
  message?: (ws: ServerWebSocket<unknown>, msg: string | Uint8Array) => void;
  close?: (ws: ServerWebSocket<unknown>, code: number, reason: string) => void;
  drain?: (ws: ServerWebSocket<unknown>) => void;
};

// One Bun `websocket` handler serves every socket; dispatch preview HMR tunnels
// (STORY-30) to their relay and everything else to the Hono session socket.
const combinedWebsocket = {
  open(ws: ServerWebSocket<unknown>) {
    isPreviewSocket(ws) ? previewWebsocket.open(ws) : sessionWs.open?.(ws);
  },
  message(ws: ServerWebSocket<unknown>, msg: string | Uint8Array) {
    isPreviewSocket(ws) ? previewWebsocket.message(ws, msg) : sessionWs.message?.(ws, msg);
  },
  close(ws: ServerWebSocket<unknown>, code: number, reason: string) {
    isPreviewSocket(ws) ? previewWebsocket.close(ws) : sessionWs.close?.(ws, code, reason);
  },
  drain(ws: ServerWebSocket<unknown>) {
    if (!isPreviewSocket(ws)) sessionWs.drain?.(ws);
  },
};

export default {
  fetch(
    req: Request,
    server: {
      upgrade(req: Request, options: { data: unknown; headers?: Record<string, string> }): boolean;
    },
  ) {
    // Tunnel Vite HMR WebSocket upgrades on a preview host to the sandbox dev
    // server (STORY-30). Non-preview / non-upgrade requests fall through to the
    // Hono app (HTTP previews, the /ws session socket, the API).
    const upgrade = tryPreviewUpgrade(req, server);
    if (upgrade === 'upgraded') return undefined;
    if (upgrade === 'failed') {
      return new Response('preview starting…', {
        status: 502,
        headers: { 'content-type': 'text/plain', 'retry-after': '2' },
      });
    }
    return app.fetch(req, server);
  },
  port: PORT,
  websocket: combinedWebsocket,
};

if (import.meta.main) {
  logger.info({ port: PORT, version: VERSION }, 'orchestrator.boot');
  startIdleSweep();
}
