export function resolveDisplayableTemplate(template) {
  const trimmed = template.trim()
  if (!trimmed) return template

  const withoutFence = stripJsonFence(trimmed)
  const parsed = safeParseJson(withoutFence)
  if (parsed && typeof parsed.refinedTemplate === 'string') {
    return parsed.refinedTemplate
  }

  const extracted = extractRefinedTemplateFromJsonish(withoutFence)
  if (extracted) {
    return extracted
  }

  return template
}

function stripJsonFence(value) {
  const match = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  return match ? match[1].trim() : value
}

function safeParseJson(text) {
  const candidates = extractJsonCandidates(text)
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (typeof parsed.refinedTemplate === 'string') {
        return parsed
      }
    } catch {
      // continue
    }
  }
  return null
}

function extractRefinedTemplateFromJsonish(text) {
  const candidates = extractJsonCandidates(text)
  const searchTargets = candidates.length ? candidates : [text]
  for (const candidate of searchTargets) {
    const value = readJsonStringValue(candidate, 'refinedTemplate')
    if (value) {
      return value
    }
  }
  return null
}

function readJsonStringValue(source, key) {
  const keyMatch = new RegExp(`"${key}"\\s*:\\s*"`, 'i').exec(source)
  if (!keyMatch) return null
  let index = (keyMatch.index ?? 0) + keyMatch[0].length
  let result = ''
  let escaped = false
  while (index < source.length) {
    const char = source[index]
    if (escaped) {
      const mapped =
        char === 'n'
          ? '\n'
          : char === 'r'
            ? '\r'
            : char === 't'
              ? '\t'
              : char
      result += mapped
      escaped = false
      index += 1
      continue
    }
    if (char === '\\') {
      escaped = true
      index += 1
      continue
    }
    if (char === '"') {
      return result
    }
    result += char
    index += 1
  }
  return result ? result : null
}

function extractJsonCandidates(text) {
  const candidates = []
  let index = 0
  while (index < text.length) {
    const start = text.indexOf('{', index)
    if (start === -1) break
    const candidate = extractBalancedJson(text, start)
    if (candidate) {
      candidates.push(candidate)
      index = start + candidate.length
      continue
    }
    index = start + 1
  }
  return candidates
}

function extractBalancedJson(text, startIndex) {
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = startIndex; i < text.length; i += 1) {
    const char = text[i]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return text.slice(startIndex, i + 1)
      }
    }
  }
  return null
}
