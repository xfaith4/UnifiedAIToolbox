import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'

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

function buildWindowsFolderDialogScript() {
  return [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
    '$d.Description = "Select repository or project folder"',
    '$d.ShowNewFolderButton = $false',
    '$r = $d.ShowDialog()',
    'if ($r -eq "OK") { Write-Output $d.SelectedPath }',
  ].join('; ')
}

function runCommand(command: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    child.on('error', (err) => reject(err))
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

async function openWindowsFolderDialog(commands: string[]): Promise<string | null> {
  const psScript = buildWindowsFolderDialogScript()
  let lastError = 'PowerShell was not available.'

  for (const command of commands) {
    try {
      const { code, stdout, stderr } = await runCommand(command, [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        psScript,
      ])
      if (code !== 0 && !stdout.trim()) {
        lastError = `${command} exited ${code}. ${stderr.trim()}`.trim()
        continue
      }
      return stdout.trim() || null
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
    }
  }

  throw new Error(lastError)
}

async function maybeConvertWindowsPathToWsl(selectedPath: string): Promise<string> {
  try {
    const { code, stdout } = await runCommand('wslpath', ['-u', selectedPath])
    if (code === 0 && stdout.trim()) {
      return stdout.trim().replace(/\/$/, '')
    }
  } catch {
    // fall back to the original path
  }
  return selectedPath
}

async function isWslEnvironment(): Promise<boolean> {
  if (process.platform !== 'linux') return false
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true
  try {
    const version = await fs.readFile('/proc/version', 'utf8')
    return /microsoft/i.test(version)
  } catch {
    return false
  }
}

async function openFolderDialog(platform: string): Promise<string | null> {
  if (platform === 'win32') {
    return openWindowsFolderDialog(['pwsh', 'powershell.exe', 'powershell'])
  }

  if (platform === 'darwin') {
    const script = 'choose folder with prompt "Select repository or project folder"'
    const { code, stdout } = await runCommand('osascript', ['-e', script])
    if (code !== 0) return null
    const raw = stdout.trim()
    if (!raw) return null
    const posixResult = await runCommand('osascript', ['-e', `POSIX path of "${raw}"`])
    return posixResult.stdout.trim().replace(/\/$/, '') || null
  }

  if (await isWslEnvironment()) {
    const selected = await openWindowsFolderDialog(['powershell.exe', 'pwsh.exe', 'pwsh'])
    if (!selected) return null
    return maybeConvertWindowsPathToWsl(selected)
  }

  const { code, stdout, stderr } = await runCommand('zenity', [
    '--file-selection',
    '--directory',
    '--title=Select repository or project folder',
  ]).catch((err) => {
    throw new Error(`zenity failed: ${err instanceof Error ? err.message : String(err)}. Install zenity or paste the path manually.`)
  })
  if (code !== 0) {
    if (stderr.trim()) {
      throw new Error(`Folder picker unavailable: ${stderr.trim()}`)
    }
    return null
  }
  return stdout.trim() || null
}
