import { NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'
import { telemetryService } from '@/lib/services/telemetryService'

function getRepoRoot() {
  // process.cwd() is apps/unifiedtoolbox.webapp
  return path.resolve(process.cwd(), '..', '..')
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const timeWindow = searchParams.get('timeWindow') || '7d'

    const data = await telemetryService.getDashboardTelemetry(timeWindow)
    
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching telemetry:', error)
    return NextResponse.json(
      { error: 'Failed to fetch telemetry data' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ ok: false, error: 'disabled' }, { status: 403 })
  }

  try {
    const text = await req.text()
    const repoRoot = getRepoRoot()
    const outDir = path.join(repoRoot, 'artifacts', 'telemetry')
    const outFile = path.join(outDir, 'web-ux-events.jsonl')

    await fs.mkdir(outDir, { recursive: true })

    // best-effort: validate JSON lines but don't throw on parse to avoid losing events
    const line = text.trim()
    const jsonLine = line && (line.startsWith('{') ? line : JSON.stringify({ raw: line }))

    await fs.appendFile(outFile, `${jsonLine}\n`, { encoding: 'utf-8' })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
