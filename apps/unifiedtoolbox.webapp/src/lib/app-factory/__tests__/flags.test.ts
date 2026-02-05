import { describe, expect, it, vi } from 'vitest'

describe('featureFlags', () => {
  it('defaults HARDENING_PIPELINE to false', async () => {
    vi.resetModules()
    delete process.env.HARDENING_PIPELINE
    const mod = await import('../flags')
    expect(mod.featureFlags.hardeningPipeline()).toBe(false)
  })

  it('parses HARDENING_PIPELINE truthy values', async () => {
    vi.resetModules()
    process.env.HARDENING_PIPELINE = 'true'
    const mod = await import('../flags')
    expect(mod.featureFlags.hardeningPipeline()).toBe(true)
  })
})

