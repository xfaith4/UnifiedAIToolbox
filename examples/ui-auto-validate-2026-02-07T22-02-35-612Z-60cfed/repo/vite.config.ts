// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// Renderer build config for an offline desktop app (served by PySide6 / QWebEngineView).
export default defineConfig(({ mode }) => ({
  plugins: [react()],

  // Critical for offline loading (e.g., file:// or Qt resource paths)
  base: "./",

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  server: {
    port: 5173,
    strictPort: true,
  },

  build: {
    // Place built renderer assets where the Python app can bundle/serve them.
    outDir: "app/static/renderer",
    emptyOutDir: true,

    // Keep it simple for embedding: single HTML entry, hashed assets.
    assetsDir: "assets",

    // Inline small assets to reduce file count and make packaging easier.
    assetsInlineLimit: 32 * 1024,

    sourcemap: mode !== "production",

    rollupOptions: {
      // Default entry is index.html; explicitly set if needed.
      input: "index.html",
      output: {
        // Keep default hashes to avoid stale caching issues.
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
}));