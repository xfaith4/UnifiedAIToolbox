import { NextResponse } from 'next/server'
import { spawn } from 'child_process'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/app-factory/browse-folder
 *
 * Opens a native OS folder-picker dialog on the server machine and returns
 * the selected path.  Only useful when the Next.js server is running locally
 * (same machine as the browser).
 *
 * Response: { path: string } | { cancelled: true } | { error: string }
 */
export async function POST() {
  const platform = process.platform

  try {
    const selectedPath = await openFolderDialog(platform)

    if (selectedPath === null) {
      return NextResponse.json({ cancelled: true })
    }

    return NextResponse.json({ path: selectedPath })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to open folder dialog' },
      { status: 500 }
    )
  }
}

function openFolderDialog(platform: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    if (platform === 'win32') {
      // PowerShell: show WinForms FolderBrowserDialog, write selected path to stdout
      const psScript = [
        'Add-Type -AssemblyName System.Windows.Forms',
        '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
        '$d.Description = "Select repository or project folder"',
        '$d.ShowNewFolderButton = $false',
        '$r = $d.ShowDialog()',
        'if ($r -eq "OK") { Write-Output $d.SelectedPath }',
      ].join('; ')

      const child = spawn(
        'pwsh',
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', psScript],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      )

      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })

      child.on('error', (err) => reject(new Error(`PowerShell spawn failed: ${err.message}`)))
      child.on('close', (code) => {
        if (code !== 0 && !stdout.trim()) {
          // Non-zero exit with no output = pwsh not found; try fallback
          reject(new Error(`PowerShell exited ${code}. stderr: ${stderr.trim()}`))
          return
        }
        const selected = stdout.trim()
        resolve(selected || null)
      })
    } else if (platform === 'darwin') {
      // macOS: AppleScript folder picker
      const script = 'choose folder with prompt "Select repository or project folder"'
      const child = spawn('osascript', ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] })

      let stdout = ''
      child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
      child.on('error', (err) => reject(new Error(`osascript failed: ${err.message}`)))
      child.on('close', (code) => {
        if (code !== 0) { resolve(null); return }
        // osascript returns "alias Macintosh HD:Users:..." — convert to POSIX path
        const raw = stdout.trim()
        if (!raw) { resolve(null); return }
        const posixChild = spawn('osascript', ['-e', `POSIX path of "${raw}"`], { stdio: ['ignore', 'pipe', 'ignore'] })
        let posix = ''
        posixChild.stdout.on('data', (d: Buffer) => { posix += d.toString() })
        posixChild.on('close', () => resolve(posix.trim().replace(/\/$/, '') || null))
      })
    } else {
      // Linux: zenity (GTK file picker, common on GNOME desktops)
      const child = spawn(
        'zenity',
        ['--file-selection', '--directory', '--title=Select repository or project folder'],
        { stdio: ['ignore', 'pipe', 'pipe'] }
      )

      let stdout = ''
      child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
      child.on('error', (err) => reject(new Error(`zenity failed: ${err.message}. Install zenity for folder picking.`)))
      child.on('close', (code) => {
        if (code !== 0) { resolve(null); return }
        resolve(stdout.trim() || null)
      })
    }
  })
}
