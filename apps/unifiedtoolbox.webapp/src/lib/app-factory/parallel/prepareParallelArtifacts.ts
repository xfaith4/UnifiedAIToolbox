import type { PlannedArtifactWrite, AppFactoryArtifact } from '../pipeline/ingestArtifacts'
import type { OwnershipCheckResult } from './ownership'
import { checkOwnership } from './ownership'
import type { AssemblerResult } from './assembleDeterministic'
import { resolveDeterministic } from './assembleDeterministic'
import { inferTeamId } from './teams'

export type ParallelPrepareResult = {
  passed: boolean
  ownership: OwnershipCheckResult
  assembler: AssemblerResult
  selectedArtifacts: AppFactoryArtifact[]
}

function fillTeamIds(plannedWrites: PlannedArtifactWrite[]): PlannedArtifactWrite[] {
  return plannedWrites.map((p) => {
    const current = String(p.artifact.sourceTeamId || '').trim()
    if (current) return p
    const inferred = inferTeamId({
      explicitTeamId: null,
      specialization: p.artifact.sourceTaskName || null,
      taskName: p.artifact.sourceTaskName || null,
    })
    return {
      ...p,
      artifact: {
        ...p.artifact,
        sourceTeamId: inferred === 'unknown' ? undefined : inferred,
      },
    }
  })
}

export async function prepareParallelArtifacts(repoDir: string, plannedWrites: PlannedArtifactWrite[]): Promise<ParallelPrepareResult> {
  const withTeams = fillTeamIds(plannedWrites)
  const ownership = await checkOwnership(repoDir, withTeams)
  const assembler = await resolveDeterministic(repoDir, ownership.allowed)

  const selectedArtifacts = assembler.selected.map((p) => p.artifact)
  const passed = ownership.passed && assembler.passed

  return { passed, ownership, assembler, selectedArtifacts }
}
