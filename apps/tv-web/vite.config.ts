import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = process.env.ACCOMPLICE_SERVER ?? 'http://localhost:8787';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/tv/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    proxy: {
      '/ws': { target, ws: true, changeOrigin: true },
      '/api': { target, changeOrigin: true },
      '/audio': { target, changeOrigin: true },
      '/mcp': { target, changeOrigin: true },
    },
  },
  preview: { port: 5173, strictPort: true },
  build: { target: 'es2020', cssCodeSplit: false, assetsInlineLimit: 2048 },
}));
