// ### BEGIN FILE: MilestoneDashboard/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite configuration for both local + GitHub Pages
export default defineConfig({
  plugins: [react()],
  // Base path must match your repo name for GitHub Pages
  base: '/AI-Orchestration/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    copyPublicDir: true, // ensures /public/data gets copied to /dist/data
  },
  server: {
    port: 5050,
    open: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
  },
});
// ### END FILE
