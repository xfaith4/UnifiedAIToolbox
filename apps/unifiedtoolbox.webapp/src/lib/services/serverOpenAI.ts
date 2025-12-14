const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'

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
    throw new Error(`OpenAI API error (${response.status}): ${detail}`)
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
