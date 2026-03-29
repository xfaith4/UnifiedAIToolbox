import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { getUxTelemetryOutputDir, getUxTelemetryOutputFile } from '../telemetryStorage'

describe('telemetryStorage', () => {
  const originalDir = process.env.UAITOOLBOX_TELEMETRY_DIR

  afterEach(() => {
    if (originalDir === undefined) {
      delete process.env.UAITOOLBOX_TELEMETRY_DIR
    } else {
      process.env.UAITOOLBOX_TELEMETRY_DIR = originalDir
    }
  })

  it('defaults to the OS temp directory instead of the repo tree', () => {
    delete process.env.UAITOOLBOX_TELEMETRY_DIR

    expect(getUxTelemetryOutputDir()).toBe(path.join(os.tmpdir(), 'uaitoolbox', 'telemetry'))
    expect(getUxTelemetryOutputFile()).toBe(path.join(os.tmpdir(), 'uaitoolbox', 'telemetry', 'web-ux-events.jsonl'))
  })

  it('resolves the override directory when configured', () => {
    process.env.UAITOOLBOX_TELEMETRY_DIR = './custom-telemetry'

    expect(getUxTelemetryOutputDir()).toBe(path.resolve('./custom-telemetry'))
    expect(getUxTelemetryOutputFile()).toBe(path.join(path.resolve('./custom-telemetry'), 'web-ux-events.jsonl'))
  })
})
