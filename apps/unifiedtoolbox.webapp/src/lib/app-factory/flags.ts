function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null) return defaultValue
  const v = value.trim().toLowerCase()
  if (!v) return defaultValue
  if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false
  return defaultValue
}

function parseIntPositive(value: string | undefined, defaultValue: number): number {
  if (value == null) return defaultValue
  const v = value.trim()
  if (!v) return defaultValue
  const parsed = Number.parseInt(v, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue
}

export const featureFlags = {
  hardeningPipeline: () => parseBool(process.env.HARDENING_PIPELINE, true),
  parallelTeams: () => parseBool(process.env.PARALLEL_TEAMS, false),
  maxParallelTeams: () => parseIntPositive(process.env.MAX_PARALLEL_TEAMS, 4),
  requirementWizard: () => parseBool(process.env.REQUIREMENT_WIZARD, false),
}
