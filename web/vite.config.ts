import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const companion = `http://127.0.0.1:${process.env.IRTC_PORT ?? 47823}`;

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Relative asset paths: the same build works served by the Companion (/) and on
  // GitHub Pages (/Isaac-Chronicle/).
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@irtc/protocol': fileURLToPath(new URL('../protocol/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api': companion,
      '/gfx': companion,
      '/ws': { target: companion.replace('http', 'ws'), ws: true },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    chunkSizeWarningLimit: 600,
  },
});
