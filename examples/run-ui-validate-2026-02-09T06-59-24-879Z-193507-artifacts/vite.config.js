vite.config.js
const { defineConfig } = require('vite');

module.exports = defineConfig({
  // Keep root at repository/project root where index.html lives
  root: '.',

  // Use relative base so the app can be opened from subpaths or file hosting
  base: './',

  server: {
    port: 5173,
    strictPort: true,
    open: true
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});