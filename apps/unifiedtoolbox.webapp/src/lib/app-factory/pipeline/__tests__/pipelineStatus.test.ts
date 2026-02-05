import { describe, expect, it } from 'vitest'

import { buildEnginePipelinePayload } from '../pipelineStatus'

describe('buildEnginePipelinePayload', () => {
  it('marks skipped stages when hardening disabled', () => {
    const payload = buildEnginePipelinePayload({
      hardeningEnabled: false,
      repoDir: null,
      runId: null,
      maxRepairCycles: 3,
      agentsStatus: 'passed',
    })

    const normalize = payload.stages.find((s) => s.id === 'normalize')
    const contract = payload.stages.find((s) => s.id === 'contract')
    const gates = payload.stages.find((s) => s.id === 'gates')
    expect(normalize?.status).toBe('skipped')
    expect(contract?.status).toBe('skipped')
    expect(gates?.status).toBe('skipped')
  })
})

