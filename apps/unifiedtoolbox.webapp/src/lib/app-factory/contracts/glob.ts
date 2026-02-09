export function globToRegExp(glob: string): RegExp {
  const normalized = glob.replace(/\\/g, '/')
  const parts: string[] = []
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]

    if (ch === '*') {
      const next = normalized[i + 1]
      const afterNext = normalized[i + 2]
      if (next === '*') {
        if (afterNext === '/') {
          parts.push('(?:.*/)?')
          i += 2
          continue
        }
        parts.push('.*')
        i += 1
        continue
      }
      parts.push('[^/]*')
      continue
    }

    if (ch === '?') {
      parts.push('[^/]')
      continue
    }

    if (/[.+^${}()|[\]\\]/.test(ch)) {
      parts.push(`\\${ch}`)
      continue
    }

    parts.push(ch)
  }

  return new RegExp(`^${parts.join('')}$`)
}
