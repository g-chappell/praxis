// Praxis orchestrator entrypoint. Bun-only runtime.
//
// Loads the HTTP app + mounts the WebSocket route (which requires Bun
// globals). For in-process testing under Node, import { app } from
// './app' instead — keeps tests Node-compatible.

import { app } from './app';
import { logger } from './logger';
import { websocket, wsRoute } from './routes/ws';
import { VERSION } from './version';

app.route('/ws', wsRoute);

// Roadmap text said :4000 but the autodev-mcp dashboard owns :4000
// on this VPS. See ADR-0004 port-allocation note.
const PORT = Number(process.env.PORT ?? 4001);

export default {
  fetch: app.fetch,
  port: PORT,
  websocket,
};

if (import.meta.main) {
  logger.info({ port: PORT, version: VERSION }, 'orchestrator.boot');
}
