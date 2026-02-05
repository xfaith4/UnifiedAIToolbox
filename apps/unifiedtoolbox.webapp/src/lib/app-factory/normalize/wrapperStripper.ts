export type StripEdit = {
  kind:
    | 'frontmatter'
    | 'file-header'
    | 'code-fence'
    | 'begin-end-wrapper'
    | 'horizontal-rule-wrapper'
  detail: string
}

export type StripResult = {
  text: string
  edits: StripEdit[]
}

const FRONTMATTER_START_RE = /^(?:\uFEFF)?\s*---\s*$/

function stripFrontmatter(text: string): StripResult {
  const lines = text.split('\n')
  let firstNonEmpty = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.trim()) {
      firstNonEmpty = i
      break
    }
  }
  if (firstNonEmpty < 0) return { text, edits: [] }
  if (!FRONTMATTER_START_RE.test(lines[firstNonEmpty] ?? '')) return { text, edits: [] }

  for (let j = firstNonEmpty + 1; j < Math.min(lines.length, firstNonEmpty + 200); j++) {
    if (FRONTMATTER_START_RE.test(lines[j] ?? '')) {
      const stripped = [...lines.slice(0, firstNonEmpty), ...lines.slice(j + 1)].join('\n')
      return {
        text: stripped,
        edits: [{ kind: 'frontmatter', detail: `Removed YAML frontmatter lines ${firstNonEmpty + 1}-${j + 1}` }],
      }
    }
  }

  return { text, edits: [] }
}

function stripLeadingFileHeader(text: string): StripResult {
  const lines = text.split('\n')
  let idx = 0
  while (idx < lines.length && !lines[idx]?.trim()) idx++
  if (idx >= lines.length) return { text, edits: [] }

  const headerLine = lines[idx] ?? ''
  const isFileHeader =
    /^\s*#{1,6}\s*File\s*:/i.test(headerLine) ||
    /^\s*(?:##\s*)?File\s*:/i.test(headerLine) ||
    /^\s*#\s*File\s*:/i.test(headerLine)

  if (!isFileHeader) return { text, edits: [] }

  const stripped = [...lines.slice(0, idx), ...lines.slice(idx + 1)].join('\n')
  return { text: stripped, edits: [{ kind: 'file-header', detail: `Removed leading file header at line ${idx + 1}` }] }
}

function stripBeginEndWrapper(text: string): StripResult {
  const lines = text.split('\n')
  let firstNonEmpty = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.trim()) {
      firstNonEmpty = i
      break
    }
  }
  if (firstNonEmpty < 0) return { text, edits: [] }

  const beginLine = lines[firstNonEmpty] ?? ''
  const beginMatch = /^\s*#{3,}\s*BEGIN\b.*$/i.test(beginLine) || /^\s*###\s*BEGIN FILE\s*:/i.test(beginLine)
  if (!beginMatch) return { text, edits: [] }

  let lastNonEmpty = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]?.trim()) {
      lastNonEmpty = i
      break
    }
  }
  if (lastNonEmpty <= firstNonEmpty) return { text, edits: [] }

  const endLine = lines[lastNonEmpty] ?? ''
  const endMatch = /^\s*#{3,}\s*END\b.*$/i.test(endLine) || /^\s*###\s*END FILE\s*:/i.test(endLine)
  if (!endMatch) return { text, edits: [] }

  const stripped = [...lines.slice(0, firstNonEmpty), ...lines.slice(firstNonEmpty + 1, lastNonEmpty), ...lines.slice(lastNonEmpty + 1)].join(
    '\n'
  )

  return {
    text: stripped,
    edits: [
      { kind: 'begin-end-wrapper', detail: `Removed BEGIN wrapper at line ${firstNonEmpty + 1}` },
      { kind: 'begin-end-wrapper', detail: `Removed END wrapper at line ${lastNonEmpty + 1}` },
    ],
  }
}

function stripHorizontalRuleWrapper(text: string): StripResult {
  const lines = text.split('\n')
  let firstNonEmpty = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.trim()) {
      firstNonEmpty = i
      break
    }
  }
  if (firstNonEmpty < 0) return { text, edits: [] }

  const firstLine = lines[firstNonEmpty] ?? ''
  const maybeFilenameRule = /^\s*---+\s*[^-].*---+\s*$/.test(firstLine)
  if (!maybeFilenameRule) return { text, edits: [] }

  const stripped = [...lines.slice(0, firstNonEmpty), ...lines.slice(firstNonEmpty + 1)].join('\n')
  return {
    text: stripped,
    edits: [{ kind: 'horizontal-rule-wrapper', detail: `Removed horizontal-rule file wrapper at line ${firstNonEmpty + 1}` }],
  }
}

function stripCodeFenceLines(text: string): StripResult {
  const lines = text.split('\n')
  const fenceRe = /^\s*```[a-zA-Z0-9_-]*\s*$/
  const kept: string[] = []
  let removed = 0
  for (const line of lines) {
    if (fenceRe.test(line)) {
      removed++
      continue
    }
    kept.push(line)
  }
  if (!removed) return { text, edits: [] }
  return {
    text: kept.join('\n'),
    edits: [{ kind: 'code-fence', detail: `Removed ${removed} markdown fence line(s)` }],
  }
}

export function stripCommonWrappers(text: string): StripResult {
  let current = text
  const edits: StripEdit[] = []

  const steps = [stripFrontmatter, stripLeadingFileHeader, stripHorizontalRuleWrapper, stripBeginEndWrapper, stripCodeFenceLines]

  for (const step of steps) {
    const res = step(current)
    if (res.edits.length) edits.push(...res.edits)
    current = res.text
  }

  return { text: current, edits }
}

