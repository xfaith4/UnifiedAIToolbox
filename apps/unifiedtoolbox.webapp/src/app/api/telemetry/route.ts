import { NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import { telemetryService } from '@/lib/services/telemetryService'
import { getUxTelemetryOutputDir, getUxTelemetryOutputFile } from '@/lib/ux/telemetryStorage'

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
    const outDir = getUxTelemetryOutputDir()
    const outFile = getUxTelemetryOutputFile()

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
