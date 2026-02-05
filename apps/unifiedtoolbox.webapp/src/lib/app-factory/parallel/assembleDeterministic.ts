import path from 'path'
import { promises as fs } from 'fs'
import type { PlannedArtifactWrite } from '../pipeline/ingestArtifacts'
import { expectedOwnerTeamForPath, teamLabel, teamPriorityRank, type TeamId } from './teams'

export type AssemblerConflict = {
  relPath: string
  expectedOwner: TeamId
  candidates: { teamId: TeamId; taskId?: string; taskName?: string; artifactName: string }[]
  chosen: { teamId: TeamId; taskId?: string; taskName?: string; artifactName: string }
  kind: 'duplicate_same_owner' | 'conflict_owner_present' | 'conflict_no_owner'
}

export type AssemblerResult = {
  passed: boolean
  selected: PlannedArtifactWrite[]
  conflicts: AssemblerConflict[]
  reportPath: string
}

function cmpStable(a: PlannedArtifactWrite, b: PlannedArtifactWrite): number {
  const pa = teamPriorityRank(plannedTeamId(a))
  const pb = teamPriorityRank(plannedTeamId(b))
  if (pa !== pb) return pa - pb
  const ta = String(a.artifact.sourceTaskId || '')
  const tb = String(b.artifact.sourceTaskId || '')
  if (ta !== tb) return ta.localeCompare(tb)
  return a.index - b.index
}

function plannedTeamId(entry: PlannedArtifactWrite): TeamId {
  const raw = String(entry.artifact.sourceTeamId || '').trim().toLowerCase()
  if (raw === 'contracts' || raw === 'platform' || raw === 'api' || raw === 'ui' || raw === 'data_ml') return raw
  return 'unknown'
}

function pickWinner(entries: PlannedArtifactWrite[], expectedOwner: TeamId): { winner: PlannedArtifactWrite; kind: AssemblerConflict['kind'] } {
  const withOwner = entries.filter((e) => plannedTeamId(e) === expectedOwner)
  if (withOwner.length) {
    withOwner.sort(cmpStable)
    return { winner: withOwner[0], kind: entries.length > 1 ? 'conflict_owner_present' : 'duplicate_same_owner' }
  }
  const sorted = [...entries].sort(cmpStable)
  return { winner: sorted[0], kind: 'conflict_no_owner' }
}

export async function resolveDeterministic(repoDir: string, allowedWrites: PlannedArtifactWrite[]): Promise<AssemblerResult> {
  const byPath = new Map<string, PlannedArtifactWrite[]>()
  for (const entry of allowedWrites) {
    const rel = entry.relPath
    byPath.set(rel, [...(byPath.get(rel) ?? []), entry])
  }

  const conflicts: AssemblerConflict[] = []
  const selected: PlannedArtifactWrite[] = []
  let passed = true

  for (const [relPath, list] of byPath.entries()) {
    if (list.length === 1) {
      selected.push(list[0])
      continue
    }

    const expectedOwner = expectedOwnerTeamForPath(relPath)
    const { winner, kind } = pickWinner(list, expectedOwner)

    if (kind === 'conflict_no_owner') {
      passed = false
    }

    conflicts.push({
      relPath,
      expectedOwner,
      candidates: list.map((e) => ({
        teamId: plannedTeamId(e),
        taskId: e.artifact.sourceTaskId,
        taskName: e.artifact.sourceTaskName,
        artifactName: e.originalName,
      })),
      chosen: {
        teamId: plannedTeamId(winner),
        taskId: winner.artifact.sourceTaskId,
        taskName: winner.artifact.sourceTaskName,
        artifactName: winner.originalName,
      },
      kind,
    })
    selected.push(winner)
  }

  selected.sort((a, b) => a.relPath.localeCompare(b.relPath))

  const reportPath = path.join(repoDir, 'ASSEMBLER_REPORT.md')
  const lines: string[] = [
    '# Assembler Report',
    '',
    `- Selected writes: ${selected.length}`,
    `- Conflicts: ${conflicts.length}`,
    `- Status: ${passed ? 'passed' : 'failed'}`,
    '',
  ]

  if (conflicts.length) {
    lines.push('## Conflicts', '')
    for (const c of conflicts.sort((a, b) => a.relPath.localeCompare(b.relPath))) {
      lines.push(`### \`${c.relPath}\``, '')
      lines.push(`- Expected owner: **${teamLabel(c.expectedOwner)}**`)
      lines.push(`- Resolution: **${c.kind}**`)
      lines.push(`- Chosen: **${teamLabel(c.chosen.teamId)}** · ${c.chosen.taskId || 'n/a'} · ${c.chosen.taskName || 'n/a'} · \`${c.chosen.artifactName}\``)
      lines.push('- Candidates:')
      for (const cand of c.candidates) {
        lines.push(`  - **${teamLabel(cand.teamId)}** · ${cand.taskId || 'n/a'} · ${cand.taskName || 'n/a'} · \`${cand.artifactName}\``)
      }
      lines.push('')
    }
  } else {
    lines.push('## Conflicts', '', '_None_', '')
  }

  await fs.writeFile(reportPath, lines.join('\n'), 'utf8')

  return { passed, selected, conflicts, reportPath }
}
