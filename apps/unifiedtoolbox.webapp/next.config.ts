import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

const loadEnvFromRepoRoot = () => {
  const envPath = path.resolve(__dirname, "..", "..", ".env");
  if (!fs.existsSync(envPath)) return;

  const contents = fs.readFileSync(envPath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim();
    if (!key) continue;
    if (process.env[key] !== undefined) continue;

    let value = line.slice(equalsIndex + 1).trim();
    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (isQuoted) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "").trimEnd();
    }

    process.env[key] = value;
  }
};

// This repo keeps a shared `.env` at the workspace root, while `next dev` runs
// from `apps/unifiedtoolbox.webapp`. Load the root env file so client-exposed
// vars (e.g. NEXT_PUBLIC_*) are available in the webapp without duplication.
loadEnvFromRepoRoot();

// turbopack.root is slightly ahead of the type definitions; cast to allow the config.
const nextConfig = {
  reactCompiler: true,
  turbopack: {
    // Pin the workspace root to this app to silence cross-repo lockfile warnings.
    root: __dirname,
  },
} satisfies NextConfig & { turbopack?: { root?: string } };

export default nextConfig;
