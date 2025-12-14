export type DiffLine = {
  index: number
  canonical: string
  rendered: string
  status: 'equal' | 'changed'
}

export function computeDiff(canonical: string, rendered: string): DiffLine[] {
  const canonicalLines = canonical.split('\n')
  const renderedLines = rendered.split('\n')
  const max = Math.max(canonicalLines.length, renderedLines.length)
  const diff: DiffLine[] = []
  for (let i = 0; i < max; i++) {
    const canonicalLine = canonicalLines[i] ?? ''
    const renderedLine = renderedLines[i] ?? ''
    diff.push({
      index: i + 1,
      canonical: canonicalLine,
      rendered: renderedLine,
      status: canonicalLine === renderedLine ? 'equal' : 'changed',
    })
  }
  return diff
}

export async function computeHash(text: string): Promise<string> {
  if (!text) return ''
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    return ''
  }
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(digest))
  return hashArray.map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
