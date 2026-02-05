import path from 'path'
import { promises as fs } from 'fs'
import type { PlannedArtifactWrite } from '../pipeline/ingestArtifacts'
import { expectedOwnerTeamForPath, inferTeamId, teamLabel, type TeamId } from './teams'

export type OwnershipViolation = {
  relPath: string
  artifactName: string
  teamId: TeamId
  expectedTeamId: TeamId
  sourceTaskId?: string
  sourceTaskName?: string
  reason: string
}

export type OwnershipCheckResult = {
  passed: boolean
  allowed: PlannedArtifactWrite[]
  violations: OwnershipViolation[]
  reportPath: string
}

function formatTaskRef(v: OwnershipViolation): string {
  const bits = [v.sourceTaskId ? `id=${v.sourceTaskId}` : null, v.sourceTaskName ? `name=${v.sourceTaskName}` : null].filter(Boolean)
  return bits.length ? bits.join(', ') : 'n/a'
}

export async function checkOwnership(repoDir: string, plannedWrites: PlannedArtifactWrite[]): Promise<OwnershipCheckResult> {
  const violations: OwnershipViolation[] = []
  const allowed: PlannedArtifactWrite[] = []

  for (const entry of plannedWrites) {
    const relPath = entry.relPath || ''
    if (!relPath) {
      violations.push({
        relPath: relPath || '(missing)',
        artifactName: entry.originalName,
        teamId: 'unknown',
        expectedTeamId: 'platform',
        sourceTaskId: entry.artifact.sourceTaskId,
        sourceTaskName: entry.artifact.sourceTaskName,
        reason: 'artifact did not resolve to a path',
      })
      continue
    }

    const teamId = inferTeamId({
      explicitTeamId: entry.artifact.sourceTeamId || null,
      specialization: entry.artifact.sourceTaskName || null,
      taskName: entry.artifact.sourceTaskName || null,
    })
    const expected = expectedOwnerTeamForPath(relPath)

    if (teamId === 'unknown') {
      violations.push({
        relPath,
        artifactName: entry.originalName,
        teamId,
        expectedTeamId: expected,
        sourceTaskId: entry.artifact.sourceTaskId,
        sourceTaskName: entry.artifact.sourceTaskName,
        reason: 'missing/unknown team identity; set agent specialization to a team (contracts/platform/api/ui/data_ml)',
      })
      continue
    }

    if (teamId !== expected) {
      violations.push({
        relPath,
        artifactName: entry.originalName,
        teamId,
        expectedTeamId: expected,
        sourceTaskId: entry.artifact.sourceTaskId,
        sourceTaskName: entry.artifact.sourceTaskName,
        reason: `path owned by ${teamLabel(expected)} team`,
      })
      continue
    }

    allowed.push(entry)
  }

  const reportPath = path.join(repoDir, 'OWNERSHIP_REPORT.md')
  const lines: string[] = [
    '# Ownership Report',
    '',
    `- Allowed writes: ${allowed.length}`,
    `- Violations: ${violations.length}`,
    '',
  ]

  if (violations.length) {
    lines.push('## Violations', '')
    for (const v of violations) {
      lines.push(
        `- \`${v.relPath}\` from **${teamLabel(v.teamId)}** (expected **${teamLabel(v.expectedTeamId)}**) · task: ${formatTaskRef(v)} · ${v.reason}`
      )
    }
    lines.push('')
  } else {
    lines.push('## Violations', '', '_None_', '')
  }

  await fs.writeFile(reportPath, lines.join('\n'), 'utf8')

  return { passed: violations.length === 0, allowed, violations, reportPath }
}
