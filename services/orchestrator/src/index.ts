// Praxis orchestrator entrypoint. Bun-only runtime.
//
// Layout: a single Hono app exported as default + a Bun.serve port pulled
// from the PORT env var. TASK-016 mounts /health and /ws on this app;
// TASK-015 just stands up the empty server.

import { Hono } from 'hono';

import { VERSION } from './version';

const app = new Hono();

// Roadmap text said :4000 but the autodev-mcp dashboard owns :4000
// on this VPS. See ADR-0004 port-allocation note.
const PORT = Number(process.env.PORT ?? 4001);

app.get('/', (c) => c.text(`praxis-orchestrator ${VERSION}`));

export default {
  fetch: app.fetch,
  port: PORT,
};

if (import.meta.main) {
  console.log(`orchestrator listening on :${PORT}`);
}
