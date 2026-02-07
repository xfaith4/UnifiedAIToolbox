import { describe, expect, it, vi } from 'vitest'

describe('featureFlags', () => {
  it('defaults HARDENING_PIPELINE to true', async () => {
    vi.resetModules()
    delete process.env.HARDENING_PIPELINE
    const mod = await import('../flags')
    expect(mod.featureFlags.hardeningPipeline()).toBe(true)
  })

  it('parses HARDENING_PIPELINE values', async () => {
    vi.resetModules()
    process.env.HARDENING_PIPELINE = 'false'
    const mod = await import('../flags')
    expect(mod.featureFlags.hardeningPipeline()).toBe(false)
  })
})
