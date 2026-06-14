/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, Vite serves the SPA with HMR and proxies the WebSocket + REST to the
// gateway (default :7632). In prod the gateway serves the built SPA directly.
const GATEWAY = process.env.POB_GATEWAY || 'http://localhost:7632';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/ws': { target: GATEWAY.replace('http', 'ws'), ws: true },
      '/api': { target: GATEWAY },
      '/healthz': { target: GATEWAY },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
