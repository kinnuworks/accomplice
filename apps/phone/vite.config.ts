import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const target = process.env.ACCOMPLICE_SERVER ?? 'http://localhost:8787';

export default defineConfig({
  base: '/p/',
  plugins: [react()],
  server: {
    port: 5174,
    host: true,
    proxy: {
      '/ws': { target, ws: true },
      '/stt': { target, ws: true },
      '/api': target,
      '/audio': target,
      '/assets': target,
    },
  },
  preview: { port: 5174, host: true },
  build: { target: 'es2020', cssCodeSplit: false, sourcemap: false },
});
