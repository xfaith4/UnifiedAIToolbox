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
    const status = await readJsonIfExists(path.join(runDir, 'status.json'))
    
    // Get PR URL from links
    const links = state?.links || status?.links || {}
    const prUrl = links.pr_url || links.pr
    const repoUrl = links.repo_url || links.repo
    
    runs.push({
      runId: entry.name,
      jobType: state?.job_type || status?.job_type,
      status: state?.status || status?.state,
      updatedAt: state?.updated_at || status?.updated_at,
      startedAt: state?.started_at || status?.started_at,
      endedAt: state?.ended_at || status?.finished_at,
      risk: state?.risk || status?.risk,
      pr: prUrl,
      repo: repoUrl,
    })
  }

  runs.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
  return NextResponse.json({ runs, count: runs.length }, { status: 200 })
}
