import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In a Praxis sandbox the preview is served at https://<slug>.preview.<domain>
// (Caddy terminates TLS on 443 → orchestrator → this dev server). For Vite's HMR
// client to live-reload through that chain (STORY-30) it must connect back over
// wss on 443, not to the dev server's own :5173. `allowedHosts: true` accepts the
// dynamic per-project preview host — the dev server is only reachable via the
// authenticated proxy on the internal praxis-net, never published publicly.
// Set PRAXIS_LOCAL=1 to run this template standalone with default localhost HMR.
const local = process.env.PRAXIS_LOCAL === '1';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    ...(local ? {} : { allowedHosts: true, hmr: { clientPort: 443, protocol: 'wss' } }),
  },
});
