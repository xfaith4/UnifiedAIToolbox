import os from 'node:os'
import path from 'node:path'

const DEFAULT_TELEMETRY_SUBDIR = path.join('uaitoolbox', 'telemetry')

export function getUxTelemetryOutputDir(): string {
  const override = process.env.UAITOOLBOX_TELEMETRY_DIR?.trim()
  if (override) {
    return path.resolve(override)
  }

  // Keep dev-only UX event writes outside the repo tree so Turbopack/Next
  // does not trigger rebuild loops from local telemetry appends.
  return path.join(os.tmpdir(), DEFAULT_TELEMETRY_SUBDIR)
}

export function getUxTelemetryOutputFile(): string {
  return path.join(getUxTelemetryOutputDir(), 'web-ux-events.jsonl')
}
