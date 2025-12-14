const SECRET_PATTERNS = ['API_KEY', 'PASSWORD', 'TOKEN', 'SECRET', 'PRIVATE_KEY', 'PASS']

export function containsSecretIndicators(value: string | undefined | null): boolean {
  if (!value) return false
  const normalized = value.toUpperCase()
  return SECRET_PATTERNS.some((pattern) => normalized.includes(pattern))
}

export function extractSummaryFromChange(change: string | string[]): string[] {
  if (!change) return []
  if (Array.isArray(change)) return change.map((item) => item.toString())
  return change
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}
