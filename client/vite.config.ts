import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "async_hooks": resolve(__dirname, "src/async-hooks-polyfill.ts"),
      "node:async_hooks": resolve(__dirname, "src/async-hooks-polyfill.ts"),
    },
  },
  clearScreen: false,
  server: {
    port: process.env.VITE_PORT ? parseInt(process.env.VITE_PORT) : 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
}));
