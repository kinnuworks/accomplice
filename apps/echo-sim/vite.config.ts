import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = process.env.ACCOMPLICE_SERVER ?? 'http://localhost:8787';

export default defineConfig({
  base: '/echo/',
  plugins: [react()],
  server: {
    port: 5175,
    strictPort: true,
    proxy: {
      '/mcp': { target, changeOrigin: false },
      '/audio': { target, changeOrigin: false },
      '/api': { target, changeOrigin: false },
      '/assets': { target, changeOrigin: false },
      // suspect portraits, served by the game server from the TV app
      '/tv': { target, changeOrigin: false },
    },
  },
  preview: { port: 5175 },
});
