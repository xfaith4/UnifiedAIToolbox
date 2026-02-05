import { NextResponse } from 'next/server'
import { featureFlags } from '@/lib/app-factory/flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    HARDENING_PIPELINE: featureFlags.hardeningPipeline(),
    PARALLEL_TEAMS: featureFlags.parallelTeams(),
    MAX_PARALLEL_TEAMS: featureFlags.maxParallelTeams(),
    REQUIREMENT_WIZARD: featureFlags.requirementWizard(),
  })
}
