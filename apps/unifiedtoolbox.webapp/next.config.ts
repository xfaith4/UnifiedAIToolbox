import type { NextConfig } from "next";

// Get API base from environment, fallback to localhost for development
const apiBase = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_PROMPT_API_BASE || 'http://localhost:8000';

// turbopack.root is slightly ahead of the type definitions; cast to allow the config.
const nextConfig = {
  reactCompiler: true,
  turbopack: {
    // Pin the workspace root to this app to silence cross-repo lockfile warnings.
    root: __dirname,
  },
} satisfies NextConfig & { turbopack?: { root?: string } };

export default nextConfig;
