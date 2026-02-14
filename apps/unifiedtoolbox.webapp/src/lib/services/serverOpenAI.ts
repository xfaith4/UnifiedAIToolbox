const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

const TOKEN_REDACTION_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._-]+/gi,
  /sk-[A-Za-z0-9_-]{10,}/g,
]

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }
export type ChatUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

export interface OpenAIChatResult {
  content: string
  usage?: ChatUsage
}

export class OpenAIChatError extends Error {
  readonly status: number
  readonly retryAfterSeconds?: number

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message)
    this.name = 'OpenAIChatError'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

function redactTokenLikeValues(text: string): string {
  let redacted = text
  for (const pattern of TOKEN_REDACTION_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]')
  }
  return redacted
}

function normalizeOpenAIError(detail: string): string {
  const redacted = redactTokenLikeValues(detail)
  try {
    const parsed = JSON.parse(redacted) as { error?: { message?: string } }
    return parsed.error?.message?.trim() || redacted
  } catch {
    return redacted
  }
}

export async function callOpenAIChat(
  messages: ChatMessage[],
  apiKey: string,
  model = 'gpt-4o-mini',
  temperature = 0.2,
  maxTokens = 1200
): Promise<OpenAIChatResult> {
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    const safeDetail = normalizeOpenAIError(detail)
    const retryAfterValue = response.headers.get('retry-after')
    const retryAfterSeconds = retryAfterValue ? Number.parseInt(retryAfterValue, 10) : undefined
    const validRetryAfterSeconds = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined

    throw new OpenAIChatError(
      `OpenAI API error (${response.status}): ${safeDetail}`,
      response.status,
      validRetryAfterSeconds,
    )
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[]
    usage?: ChatUsage
  }

  const content = data.choices?.[0]?.message?.content ?? ''
  return {
    content,
    usage: data.usage,
  }
}
