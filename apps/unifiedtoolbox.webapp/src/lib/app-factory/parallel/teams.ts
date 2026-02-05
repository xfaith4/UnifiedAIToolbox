export type TeamId = 'contracts' | 'platform' | 'api' | 'ui' | 'data_ml' | 'unknown'

export type TeamInfo = {
  id: TeamId
  label: string
}

export const TEAM_INFOS: TeamInfo[] = [
  { id: 'contracts', label: 'Shared Contracts' },
  { id: 'platform', label: 'Platform' },
  { id: 'api', label: 'API' },
  { id: 'ui', label: 'UI' },
  { id: 'data_ml', label: 'Data/ML' },
  { id: 'unknown', label: 'Unknown' },
]

export const TEAM_PRIORITY: TeamId[] = ['contracts', 'platform', 'api', 'ui', 'data_ml', 'unknown']

export const LOCKED_CONTRACT_PATHS: { exact: string[]; prefixes: string[] } = {
  exact: ['STACK_LOCK.json', 'API_CONTRACT.json', 'API_CONTRACT.yaml', 'API_CONTRACT.yml', 'DB_SCHEMA.sql', 'REPO_CONTRACT_SPEC.json', 'CONTRACT_HASH.txt'],
  prefixes: ['types/shared/'],
}

function normRelPath(value: string): string {
  const raw = String(value || '').replace(/\\/g, '/').trim()
  const stripped = raw.replace(/^\.\/+/, '').replace(/^\/+/, '')
  const parts = stripped.split('/').filter((p) => p && p !== '.' && p !== '..')
  return parts.join('/')
}

export function isLockedContractPath(relPath: string): boolean {
  const rel = normRelPath(relPath)
  if (!rel) return false
  if (LOCKED_CONTRACT_PATHS.exact.includes(rel)) return true
  return LOCKED_CONTRACT_PATHS.prefixes.some((p) => rel.startsWith(p))
}

export function inferTeamId(input: { specialization?: string | null; taskName?: string | null; explicitTeamId?: string | null }): TeamId {
  const explicit = (input.explicitTeamId || '').trim().toLowerCase()
  if (explicit) {
    if (explicit === 'contracts' || explicit === 'platform' || explicit === 'api' || explicit === 'ui' || explicit === 'data_ml') return explicit
  }

  const hay = `${input.specialization || ''}\n${input.taskName || ''}`.toLowerCase()
  if (hay.includes('shared contracts') || hay.includes('contracts team') || hay.includes('contract team') || hay.includes('decision lock')) return 'contracts'
  if (hay.includes('platform team') || hay.includes('infra team') || hay.includes('devops') || hay.includes('platform')) return 'platform'
  if (hay.includes('data/ml') || hay.includes('data ml') || hay.includes('ml team') || hay.includes('data team')) return 'data_ml'
  if (hay.includes('ui team') || hay.includes('frontend') || hay.includes('web team') || hay.includes('ui')) return 'ui'
  if (hay.includes('api team') || hay.includes('backend') || hay.includes('api')) return 'api'

  const nameMatch = hay.match(/\bteam\s*:\s*(contracts|platform|api|ui|data_ml)\b/)
  if (nameMatch?.[1]) return nameMatch[1] as TeamId

  return 'unknown'
}

export function teamLabel(teamId: TeamId): string {
  return TEAM_INFOS.find((t) => t.id === teamId)?.label || teamId
}

export function expectedOwnerTeamForPath(relPath: string): TeamId {
  const rel = normRelPath(relPath)
  if (!rel) return 'platform'

  if (isLockedContractPath(rel)) return 'contracts'
  if (rel.startsWith('types/shared/')) return 'contracts'

  if (rel.startsWith('.github/')) return 'platform'
  if (rel.startsWith('infra/')) return 'platform'
  if (rel.startsWith('scripts/')) return 'platform'

  if (rel.startsWith('apps/web/')) return 'ui'

  if (rel.startsWith('apps/api/src/jobs/')) return 'data_ml'
  if (rel.startsWith('apps/api/src/ml/')) return 'data_ml'
  if (rel.startsWith('apps/api/')) return 'api'

  return 'platform'
}

export function teamPriorityRank(teamId: TeamId): number {
  const idx = TEAM_PRIORITY.indexOf(teamId)
  return idx >= 0 ? idx : TEAM_PRIORITY.length
}

