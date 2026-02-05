import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'

export type CommandResult = {
  name: string
  command: string
  cwd: string
  exitCode: number | null
  timedOut: boolean
  durationMs: number
  logPath: string
}

async function fileAppend(filePath: string, chunk: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.appendFile(filePath, chunk, 'utf8')
}

async function commandExists(cmd: string): Promise<boolean> {
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      const p = spawn('where', [cmd], { stdio: 'ignore', shell: false })
      p.on('exit', (code) => resolve(code === 0))
      p.on('error', () => resolve(false))
    })
  }

  return new Promise((resolve) => {
    const p = spawn('which', [cmd], { stdio: 'ignore', shell: false })
    p.on('exit', (code) => resolve(code === 0))
    p.on('error', () => {
      const fallback = spawn('sh', ['-lc', `command -v ${cmd}`], { stdio: 'ignore', shell: false })
      fallback.on('exit', (code) => resolve(code === 0))
      fallback.on('error', () => resolve(false))
    })
  })
}

export async function rewriteCommandForTooling(command: string): Promise<string> {
  const trimmed = command.trim()
  if (!trimmed) return trimmed

  const first = trimmed.split(/\s+/)[0] ?? ''
  if (first.toLowerCase() === 'pnpm') {
    const hasPnpm = await commandExists('pnpm')
    if (hasPnpm) return command
    const hasCorepack = await commandExists('corepack')
    if (hasCorepack) return trimmed.replace(/^pnpm\b/i, 'corepack pnpm')
  }
  return command
}

export async function runCommandToLog(options: {
  name: string
  command: string
  cwd: string
  env?: Record<string, string>
  timeoutSeconds: number
  logDir: string
}): Promise<CommandResult> {
  const startedAt = Date.now()
  const logPath = path.join(options.logDir, `${options.name}.log`)
  await fs.mkdir(options.logDir, { recursive: true })
  await fs.writeFile(logPath, `# ${options.name}\n# cwd: ${options.cwd}\n# cmd: ${options.command}\n\n`, 'utf8')

  const cmd = await rewriteCommandForTooling(options.command)

  const child = spawn(cmd, {
    cwd: options.cwd,
    env: { ...process.env, ...(options.env || {}) },
    shell: true,
    windowsHide: true,
  })

  child.stdout?.on('data', (buf) => void fileAppend(logPath, buf.toString('utf8')))
  child.stderr?.on('data', (buf) => void fileAppend(logPath, buf.toString('utf8')))

  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    void fileAppend(logPath, `\n[gate] Timeout after ${options.timeoutSeconds}s\n`)
    killProcessTree(child.pid)
  }, options.timeoutSeconds * 1000)

  const exitCode = await new Promise<number | null>((resolve) => {
    child.on('exit', (code) => resolve(code))
    child.on('error', () => resolve(1))
  })

  clearTimeout(timer)
  const durationMs = Date.now() - startedAt
  await fileAppend(logPath, `\n[gate] exitCode=${exitCode} durationMs=${durationMs} timedOut=${timedOut}\n`)

  return {
    name: options.name,
    command: cmd,
    cwd: options.cwd,
    exitCode,
    timedOut,
    durationMs,
    logPath,
  }
}

export function killProcessTree(pid?: number): void {
  if (!pid) return
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', shell: false })
      return
    }
    process.kill(pid, 'SIGTERM')
  } catch {
    // best-effort
  }
}
