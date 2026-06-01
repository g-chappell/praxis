// GET /ws — the WebSocket hub. STORY-05 just handles ping/pong;
// STORY-08+ extend the protocol with prompt / agent_event / presence /
// file_lock messages. Reserved discriminator: `type`.
//
// Auth is intentionally absent here — STORY-09 adds session-cookie
// gating at the upgrade. Don't carry sensitive state in messages until
// then.

import { Hono } from 'hono';
import { createBunWebSocket } from 'hono/bun';
import type { ServerWebSocket } from 'bun';

import { logger } from '../logger';

interface ConnectionState {
  id: string;
  messageCount: number;
}

const conns = new WeakMap<ServerWebSocket<unknown>, ConnectionState>();

export const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket<unknown>>();

export const wsRoute = new Hono();

wsRoute.get(
  '/',
  upgradeWebSocket(() => ({
    onOpen: (_evt, ws) => {
      const id = crypto.randomUUID();
      const raw = ws.raw;
      if (raw) conns.set(raw, { id, messageCount: 0 });
      logger.info({ wsConnId: id }, 'ws.open');
    },

    onMessage: (evt, ws) => {
      const raw = ws.raw;
      const state = raw ? conns.get(raw) : undefined;
      if (state) state.messageCount += 1;

      let msg: unknown;
      try {
        msg = JSON.parse(String(evt.data));
      } catch {
        logger.warn({ wsConnId: state?.id }, 'ws.invalid_json');
        ws.send(JSON.stringify({ type: 'error', reason: 'invalid_json' }));
        return;
      }

      if (typeof msg !== 'object' || msg === null || !('type' in msg)) {
        ws.send(JSON.stringify({ type: 'error', reason: 'missing_type' }));
        return;
      }

      const type = (msg as { type: unknown }).type;
      if (type === 'ping') {
        // Log only the first ping per connection — heartbeat traffic
        // would otherwise dominate the log stream.
        if (state && state.messageCount === 1) {
          logger.debug({ wsConnId: state.id }, 'ws.ping.first');
        }
        ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
        return;
      }

      logger.info({ wsConnId: state?.id, type }, 'ws.message');
      ws.send(JSON.stringify({ type: 'error', reason: 'unknown_type' }));
    },

    onClose: (_evt, ws) => {
      const raw = ws.raw;
      const state = raw ? conns.get(raw) : undefined;
      logger.info({ wsConnId: state?.id, messageCount: state?.messageCount }, 'ws.close');
    },
  })),
);
