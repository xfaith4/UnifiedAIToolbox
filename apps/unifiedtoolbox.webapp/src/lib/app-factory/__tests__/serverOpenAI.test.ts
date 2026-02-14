import { describe, expect, it, vi, afterEach } from 'vitest'
import { callOpenAIChat, OpenAIChatError } from '../../services/serverOpenAI'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('callOpenAIChat', () => {
  it('throws OpenAIChatError with redacted token-like content', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: 'bad key sk-abcdefghijklmnopqrstuvwxyz and Authorization: Bearer sk-12345678901234567890',
          },
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    )

    const thrown = await callOpenAIChat([{ role: 'user', content: 'hello' }], 'sk-test').catch((error) => error)

    expect(thrown).toBeInstanceOf(OpenAIChatError)
    expect(thrown).toMatchObject({ name: 'OpenAIChatError', status: 401 })
    expect(thrown.message).toContain('[REDACTED]')
    expect(thrown.message).not.toContain('sk-abcdefghijklmnopqrstuvwxyz')
    expect(thrown.message).not.toContain('Bearer sk-12345678901234567890')
  })

  it('captures retry-after header when available', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('rate limited', {
        status: 429,
        headers: { 'retry-after': '7' },
      }),
    )

    const thrown = await callOpenAIChat([{ role: 'user', content: 'hello' }], 'sk-test').catch((error) => error)

    expect(thrown).toBeInstanceOf(OpenAIChatError)
    expect((thrown as OpenAIChatError).retryAfterSeconds).toBe(7)
  })
})
