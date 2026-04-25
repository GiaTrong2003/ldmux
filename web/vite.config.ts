import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// FE dev server on 5173, proxies /api to Express backend on 3700.
// Build writes straight into ../be/src/gui/public so Express static-serves it.
// Assumes the BE repo is checked out as a sibling folder (ldmux/be, ldmux/web).
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3700',
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../be/src/gui/public'),
    emptyOutDir: true,
    assetsDir: 'assets',
  },
});
