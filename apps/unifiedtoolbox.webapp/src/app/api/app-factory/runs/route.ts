import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fs } from 'fs'
import { getRunsRoot, isValidRunId } from '@/lib/app-factory/runs/runStatus'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function readJsonIfExists(filePath: string) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function GET() {
  const runsRoot = getRunsRoot()
  let entries: { name: string; isDirectory: boolean }[] = []
  try {
    const dirents = await fs.readdir(runsRoot, { withFileTypes: true })
    entries = dirents.map((d) => ({ name: d.name, isDirectory: d.isDirectory() }))
  } catch {
    return NextResponse.json({ runs: [], count: 0 }, { status: 200 })
  }

  const runs = []
  for (const entry of entries) {
    if (!entry.isDirectory) continue
    if (!isValidRunId(entry.name)) continue
    const runDir = path.join(runsRoot, entry.name)
    const state = await readJsonIfExists(path.join(runDir, 'run_state.json'))
    runs.push({
      runId: entry.name,
      jobType: state?.job_type,
      status: state?.status,
      updatedAt: state?.updated_at,
      startedAt: state?.started_at,
      endedAt: state?.ended_at,
      risk: state?.risk,
    })
  }

  runs.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
  return NextResponse.json({ runs, count: runs.length }, { status: 200 })
}
