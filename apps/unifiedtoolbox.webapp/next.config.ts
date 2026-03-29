import type { NextConfig } from 'next'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.dirname(fileURLToPath(import.meta.url))

const resolvePlaceholder = (value: string): string => {
  // Matches $($VAR), $($env:VAR), ${VAR}, ${env:VAR}, $VAR, $env:VAR.
  const match =
    value.match(/^\$\(\$(?:env:)?([A-Za-z_][A-Za-z0-9_]*)\)$/i) ||
    value.match(/^\$\{(?:env:)?([A-Za-z_][A-Za-z0-9_]*)\}$/i) ||
    value.match(/^\$(?:env:)?([A-Za-z_][A-Za-z0-9_]*)$/i)
  if (!match) return value
  return process.env[match[1]] ?? value
}

const loadEnvFromRepoRoot = () => {
  const envPath = path.resolve(appRoot, '..', '..', '.env')
  if (!fs.existsSync(envPath)) return

  const contents = fs.readFileSync(envPath, 'utf8')
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const equalsIndex = line.indexOf('=')
    if (equalsIndex === -1) continue

    const key = line.slice(0, equalsIndex).trim()
    if (!key || process.env[key] !== undefined) continue

    let value = line.slice(equalsIndex + 1).trim()
    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))

    if (isQuoted) {
      value = value.slice(1, -1)
    } else {
      value = value.replace(/\s+#.*$/, '').trimEnd()
    }

    process.env[key] = resolvePlaceholder(value)
  }
}

loadEnvFromRepoRoot()

const nextConfig = {
  reactCompiler: false,
  turbopack: {
    root: path.resolve(appRoot, '..', '..'),
  },
} satisfies NextConfig & { turbopack?: { root?: string } }

export default nextConfig
