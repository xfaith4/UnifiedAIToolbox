const EXAMPLE_PROJECT_KEY = 'sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'

const PLACEHOLDER_PATTERNS = [
  /^\$\(\$(?:env:)?[A-Za-z_][A-Za-z0-9_]*\)$/i, // PowerShell: $($VAR), $($env:VAR)
  /^\$\{(?:env:)?[A-Za-z_][A-Za-z0-9_]*\}$/i, // Shell/PS: ${VAR}, ${env:VAR}
  /^\$(?:env:)?[A-Za-z_][A-Za-z0-9_]*$/i, // Shell/PS: $VAR, $env:VAR
]

const stripWrappingQuotes = (value: string): string => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

export const normalizeBrowserApiKey = (rawValue: string | undefined | null): string => {
  if (!rawValue) return ''
  const value = stripWrappingQuotes(String(rawValue).trim())
  if (!value) return ''

  if (value === EXAMPLE_PROJECT_KEY) return ''
  if (value.includes('$(') || value.includes('${')) return ''
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value))) return ''
  if (/^sk-proj-your.*here$/i.test(value)) return ''

  return value
}

export const getBrowserApiKeyFromEnv = (): string =>
  normalizeBrowserApiKey(process.env.NEXT_PUBLIC_API_KEY) ||
  normalizeBrowserApiKey(process.env.NEXT_PUBLIC_OPENAI_API_KEY) ||
  ''
