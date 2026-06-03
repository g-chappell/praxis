import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Bind 0.0.0.0 so the sandbox's exposed port is reachable; HMR over the
// preview URL works behind the platform's proxy.
export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5173, strictPort: true },
});
