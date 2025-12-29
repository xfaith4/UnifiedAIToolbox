import type { NextConfig } from "next";

// turbopack.root is slightly ahead of the type definitions; cast to allow the config.
const nextConfig = {
  reactCompiler: true,
  turbopack: {
    // Pin the workspace root to this app to silence cross-repo lockfile warnings.
    root: __dirname,
  },
} satisfies NextConfig & { turbopack?: { root?: string } };

export default nextConfig;
