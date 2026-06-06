// HTTP-only Hono app construction. Importing this module is safe under
// Node (Vitest CI) — no Bun globals are referenced. The Bun-specific
// WebSocket route is mounted in index.ts via `attachWebSocketRoute`,
// so it never enters the Node test path.

import { Hono } from 'hono';

import { httpLogger } from './logger';
import { caddyAsk, getPreview, proxyToSandbox, slugForHost } from './preview';
import { healthRoute } from './routes/health';
import { mcpRoute } from './routes/mcp';
import { projectsRoute } from './routes/projects';
import { sessionsRoute } from './routes/sessions';
import { VERSION } from './version';

export const app = new Hono();

app.use('*', httpLogger);

// Preview routing (STORY-13): Caddy proxies all `*.preview.<domain>` here. When
// the Host is a preview host, reverse-proxy to the mapped sandbox (or 404 if the
// slug isn't live). All other Hosts (api.*, the on_demand ask) fall through.
app.use('*', async (c, next) => {
  // Caddy preserves the original Host header on reverse_proxy; fall back to the
  // URL host (covers tests that drive app.fetch directly).
  const host = c.req.header('host') ?? new URL(c.req.url).host;
  const slug = slugForHost(host);
  if (slug === null) return next();
  const target = getPreview(slug);
  if (!target) return c.text('no such preview', 404);
  return proxyToSandbox(c.req.raw, target);
});

// Caddy on_demand_tls ask — issue a cert only for a live preview subdomain.
app.get('/caddy/ask', (c) => (caddyAsk(c.req.query('domain')) ? c.text('ok') : c.text('no', 404)));

app.get('/', (c) => c.text(`praxis-orchestrator ${VERSION}`));
app.route('/health', healthRoute);
app.route('/sessions', sessionsRoute);
app.route('/projects', projectsRoute);
app.route('/internal/mcp', mcpRoute);
