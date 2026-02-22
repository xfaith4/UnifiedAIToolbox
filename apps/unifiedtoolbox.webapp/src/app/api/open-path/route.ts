import { spawn } from 'child_process'
import { stat } from 'fs/promises'
import { NextResponse } from 'next/server'

/**
 * POST /api/open-path
 * Body: { path: string }
 *
 * Opens a local file or directory in the OS default viewer (Explorer / Finder / xdg-open).
 * Only usable when the Next.js server is running on localhost — this is intentional since
 * the path must exist on the same machine as the server.
 */
export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const target = typeof (body as Record<string, unknown>)?.path === 'string'
    ? ((body as Record<string, unknown>).path as string).trim()
    : ''

  if (!target) {
    return NextResponse.json({ error: 'path is required' }, { status: 400 })
  }

  // Verify the path exists on the server filesystem before trying to open it
  try {
    await stat(target)
  } catch {
    return NextResponse.json({ error: 'Path not found on server' }, { status: 404 })
  }

  try {
    const platform = process.platform
    if (platform === 'win32') {
      // explorer.exe accepts both files and directories
      spawn('explorer', [target], { detached: true, stdio: 'ignore' }).unref()
    } else if (platform === 'darwin') {
      spawn('open', [target], { detached: true, stdio: 'ignore' }).unref()
    } else {
      spawn('xdg-open', [target], { detached: true, stdio: 'ignore' }).unref()
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to open path: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 }
    )
  }
}
