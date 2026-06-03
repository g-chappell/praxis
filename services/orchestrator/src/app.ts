// HTTP-only Hono app construction. Importing this module is safe under
// Node (Vitest CI) — no Bun globals are referenced. The Bun-specific
// WebSocket route is mounted in index.ts via `attachWebSocketRoute`,
// so it never enters the Node test path.

import { Hono } from 'hono';

import { httpLogger } from './logger';
import { healthRoute } from './routes/health';
import { projectsRoute } from './routes/projects';
import { sessionsRoute } from './routes/sessions';
import { VERSION } from './version';

export const app = new Hono();

app.use('*', httpLogger);

app.get('/', (c) => c.text(`praxis-orchestrator ${VERSION}`));
app.route('/health', healthRoute);
app.route('/sessions', sessionsRoute);
app.route('/projects', projectsRoute);
