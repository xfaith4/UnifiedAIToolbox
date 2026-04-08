import type { RequirementsRequestBlocker } from '@/lib/types/orchestrator'

export interface ExtractedAnswer {
  blockerId: string
  question: string
  answer: string
  confidence: 'high' | 'medium' | 'low'
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
}

function tokenOverlap(a: string, b: string): number {
  const tokensA = new Set(tokenize(a))
  const tokensB = tokenize(b)
  if (tokensA.size === 0 || tokensB.length === 0) return 0
  let matches = 0
  for (const token of tokensB) {
    if (tokensA.has(token)) matches += 1
  }
  return matches / Math.max(tokensA.size, tokensB.length)
}

/**
 * Split user text into numbered responses.
 * Matches patterns like "1. answer", "1) answer", "1: answer", "Q1: answer"
 */
function splitNumberedResponses(text: string): Map<number, string> {
  const results = new Map<number, string>()
  const pattern = /(?:^|\n)\s*(?:Q?\s*)?(\d+)[.):\s]\s*(.+?)(?=\n\s*(?:Q?\s*)?\d+[.):\s]|\n*$)/gis
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const num = parseInt(match[1], 10)
    const answer = match[2].trim()
    if (num > 0 && answer) {
      results.set(num, answer)
    }
  }
  return results
}

/**
 * Split text into paragraphs (double newline or single newline with content).
 */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/**
 * Check if the user text contains a verbatim default option match.
 */
function findDefaultMatch(text: string, defaults: string[]): string | null {
  const lower = text.toLowerCase()
  for (const d of defaults) {
    if (lower.includes(d.toLowerCase())) return d
  }
  return null
}

/**
 * Extract answers from a user's free-text chat reply, mapping them to blocker questions.
 *
 * Strategy (in priority order):
 * 1. Numbered responses — "1. answer" maps to blocker at that index
 * 2. Verbatim default match — user text contains one of blocker.defaults
 * 3. Keyword overlap — find the paragraph most similar to each blocker's question
 * 4. Fallback — if only one blocker, the entire text is the answer
 */
export function extractBlockerAnswers(
  userText: string,
  blockers: RequirementsRequestBlocker[],
): ExtractedAnswer[] {
  if (!blockers.length) return []
  const text = userText.trim()
  if (!text) return blockers.map((b) => ({ blockerId: b.id, question: b.question, answer: '', confidence: 'low' }))

  const results: ExtractedAnswer[] = []
  const numbered = splitNumberedResponses(text)
  const paragraphs = splitParagraphs(text)

  for (let i = 0; i < blockers.length; i++) {
    const blocker = blockers[i]

    // Strategy 1: numbered response
    const numberedAnswer = numbered.get(i + 1)
    if (numberedAnswer) {
      results.push({ blockerId: blocker.id, question: blocker.question, answer: numberedAnswer, confidence: 'high' })
      continue
    }

    // Strategy 2: verbatim default match
    if (blocker.defaults && blocker.defaults.length > 0) {
      const defaultMatch = findDefaultMatch(text, blocker.defaults)
      if (defaultMatch) {
        results.push({ blockerId: blocker.id, question: blocker.question, answer: defaultMatch, confidence: 'high' })
        continue
      }
    }

    // Strategy 3: keyword overlap with paragraphs
    let bestParagraph = ''
    let bestScore = 0
    for (const paragraph of paragraphs) {
      const score = tokenOverlap(blocker.question, paragraph)
      if (score > bestScore) {
        bestScore = score
        bestParagraph = paragraph
      }
    }
    if (bestScore > 0.15 && bestParagraph) {
      results.push({ blockerId: blocker.id, question: blocker.question, answer: bestParagraph, confidence: 'medium' })
      continue
    }

    // Strategy 4: single-blocker fallback
    if (blockers.length === 1) {
      results.push({ blockerId: blocker.id, question: blocker.question, answer: text, confidence: 'medium' })
      continue
    }

    // No match found
    results.push({ blockerId: blocker.id, question: blocker.question, answer: '', confidence: 'low' })
  }

  return results
}
