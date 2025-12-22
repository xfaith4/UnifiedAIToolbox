'use client'

export interface ChatCompletionResult {
  output: string
  tokens?: {
    prompt?: number
    completion?: number
    total?: number
  }
}

/**
 * Lightweight OpenAI chat helper. Uses a provided key or falls back to NEXT_PUBLIC_OPENAI_API_KEY.
 * Returns a friendly echo if no key is configured so the UI still functions in demo mode.
 */
export async function getChatCompletion(prompt: string, apiKey?: string): Promise<ChatCompletionResult> {
  const key = apiKey || process.env.NEXT_PUBLIC_OPENAI_API_KEY
  if (!key) {
    return {
      output: `No API key configured. Prompt preview:\n\n${prompt}`,
      tokens: { total: prompt.length },
    }
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`OpenAI request failed (${response.status}): ${detail}`)
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  }

  const content = data.choices?.[0]?.message?.content ?? ''
  return {
    output: content,
    tokens: {
      prompt: data.usage?.prompt_tokens,
      completion: data.usage?.completion_tokens,
      total: data.usage?.total_tokens,
    },
  }
}
