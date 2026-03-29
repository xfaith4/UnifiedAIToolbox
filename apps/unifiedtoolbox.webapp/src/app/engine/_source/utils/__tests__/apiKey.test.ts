import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { normalizeBrowserApiKey, getBrowserApiKeyFromEnv } from '../apiKey'

describe('normalizeBrowserApiKey', () => {
  it('returns a real key unchanged', () => {
    expect(normalizeBrowserApiKey('sk-proj-abc123')).toBe('sk-proj-abc123')
  })

  it('returns empty string for null/undefined/blank', () => {
    expect(normalizeBrowserApiKey(null)).toBe('')
    expect(normalizeBrowserApiKey(undefined)).toBe('')
    expect(normalizeBrowserApiKey('   ')).toBe('')
  })

  it('rejects the example placeholder key', () => {
    expect(normalizeBrowserApiKey('sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe('')
  })

  it('rejects PowerShell placeholder $($VAR)', () => {
    expect(normalizeBrowserApiKey('$($env:OPENAI_API_KEY)')).toBe('')
    expect(normalizeBrowserApiKey('$($NEXT_PUBLIC_API_KEY)')).toBe('')
  })

  it('rejects shell placeholder ${VAR}', () => {
    expect(normalizeBrowserApiKey('${OPENAI_API_KEY}')).toBe('')
    expect(normalizeBrowserApiKey('${env:OPENAI_API_KEY}')).toBe('')
  })

  it('rejects bare shell placeholder $VAR', () => {
    expect(normalizeBrowserApiKey('$OPENAI_API_KEY')).toBe('')
    expect(normalizeBrowserApiKey('$env:OPENAI_API_KEY')).toBe('')
  })

  it('rejects the docs example value', () => {
    expect(normalizeBrowserApiKey('sk-proj-your...api...key...here')).toBe('')
  })

  it('strips wrapping double quotes', () => {
    expect(normalizeBrowserApiKey('"sk-proj-abc123"')).toBe('sk-proj-abc123')
  })

  it('strips wrapping single quotes', () => {
    expect(normalizeBrowserApiKey("'sk-proj-abc123'")).toBe('sk-proj-abc123')
  })
})

describe('getBrowserApiKeyFromEnv', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_API_KEY
    delete process.env.NEXT_PUBLIC_OPENAI_API_KEY
  })

  afterEach(() => {
    Object.assign(process.env, originalEnv)
  })

  it('returns empty string when no key is set', () => {
    expect(getBrowserApiKeyFromEnv()).toBe('')
  })

  it('returns NEXT_PUBLIC_API_KEY when set to a real key', () => {
    process.env.NEXT_PUBLIC_API_KEY = 'sk-proj-primary'
    expect(getBrowserApiKeyFromEnv()).toBe('sk-proj-primary')
  })

  it('falls back to NEXT_PUBLIC_OPENAI_API_KEY when primary is absent', () => {
    process.env.NEXT_PUBLIC_OPENAI_API_KEY = 'sk-proj-fallback'
    expect(getBrowserApiKeyFromEnv()).toBe('sk-proj-fallback')
  })

  it('prefers NEXT_PUBLIC_API_KEY over NEXT_PUBLIC_OPENAI_API_KEY', () => {
    process.env.NEXT_PUBLIC_API_KEY = 'sk-proj-primary'
    process.env.NEXT_PUBLIC_OPENAI_API_KEY = 'sk-proj-fallback'
    expect(getBrowserApiKeyFromEnv()).toBe('sk-proj-primary')
  })

  it('falls back to NEXT_PUBLIC_OPENAI_API_KEY when primary is a placeholder', () => {
    process.env.NEXT_PUBLIC_API_KEY = '$($env:NEXT_PUBLIC_API_KEY)'
    process.env.NEXT_PUBLIC_OPENAI_API_KEY = 'sk-proj-fallback'
    expect(getBrowserApiKeyFromEnv()).toBe('sk-proj-fallback')
  })

  it('returns empty string when both keys are placeholders', () => {
    process.env.NEXT_PUBLIC_API_KEY = '$env:NEXT_PUBLIC_API_KEY'
    process.env.NEXT_PUBLIC_OPENAI_API_KEY = '${env:OPENAI_API_KEY}'
    expect(getBrowserApiKeyFromEnv()).toBe('')
  })

  it('does not fall back to OPENAI_API_KEY when public keys are absent', () => {
    process.env.OPENAI_API_KEY = 'sk-proj-server-secret'
    expect(getBrowserApiKeyFromEnv()).toBe('')
  })
})
