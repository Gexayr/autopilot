import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:3010', '/media': 'https://autopilot.amsoft.am' } },
  build: { chunkSizeWarningLimit: 1500 },
});
