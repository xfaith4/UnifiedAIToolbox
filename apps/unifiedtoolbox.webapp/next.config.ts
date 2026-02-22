import type { NextConfig } from 'next'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = path.dirname(fileURLToPath(import.meta.url))
const EXAMPLE_PROJECT_KEY = 'sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'

const isPlaceholderValue = (value: string | undefined): boolean => {
  if (!value) return false
  const trimmed = value.trim()
  if (!trimmed) return false

  return (
    /^\$\(\$(?:env:)?[A-Za-z_][A-Za-z0-9_]*\)$/i.test(trimmed) ||
    /^\$\{(?:env:)?[A-Za-z_][A-Za-z0-9_]*\}$/i.test(trimmed) ||
    /^\$(?:env:)?[A-Za-z_][A-Za-z0-9_]*$/i.test(trimmed)
  )
}

const isUsableApiKey = (value: string | undefined): value is string => {
  if (!value) return false
  const trimmed = value.trim()
  if (!trimmed) return false
  if (trimmed === EXAMPLE_PROJECT_KEY) return false
  if (/^sk-proj-your.*here$/i.test(trimmed)) return false
  if (isPlaceholderValue(trimmed)) return false
  return true
}

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

// Keep a single source of truth in repo-root .env:
// if only OPENAI_API_KEY is set there, expose browser aliases for client pages.
if (!isUsableApiKey(process.env.NEXT_PUBLIC_API_KEY) && isUsableApiKey(process.env.OPENAI_API_KEY)) {
  process.env.NEXT_PUBLIC_API_KEY = process.env.OPENAI_API_KEY
}
if (!isUsableApiKey(process.env.NEXT_PUBLIC_OPENAI_API_KEY) && isUsableApiKey(process.env.NEXT_PUBLIC_API_KEY)) {
  process.env.NEXT_PUBLIC_OPENAI_API_KEY = process.env.NEXT_PUBLIC_API_KEY
}

const nextConfig = {
  reactCompiler: false,
  turbopack: {
    root: path.resolve(appRoot, '..', '..'),
  },
} satisfies NextConfig & { turbopack?: { root?: string } }

export default nextConfig
