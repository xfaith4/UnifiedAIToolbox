import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'

async function runGit(repoDir: string, args: string[], opts?: { input?: string }): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', ['-C', repoDir, ...args], { shell: false, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (b) => (stdout += b.toString('utf8')))
    child.stderr?.on('data', (b) => (stderr += b.toString('utf8')))
    child.on('error', (err) => resolve({ code: 1, stdout, stderr: String(err) }))
    child.on('exit', (code) => resolve({ code: code ?? 1, stdout, stderr }))
    if (opts?.input) {
      child.stdin?.write(opts.input)
      child.stdin?.end()
    }
  })
}

export async function ensureGitWorkspace(repoDir: string): Promise<void> {
  try {
    const stat = await fs.stat(path.join(repoDir, '.git'))
    if (stat.isDirectory()) return
  } catch {
    // init below
  }

  const init = await runGit(repoDir, ['init'])
  if (init.code !== 0) throw new Error(`git init failed: ${init.stderr || init.stdout}`)

  await runGit(repoDir, ['add', '-A'])
  const commit = await runGit(repoDir, [
    '-c',
    'user.email=app-factory@local',
    '-c',
    'user.name=App Factory',
    'commit',
    '--allow-empty',
    '-m',
    'baseline',
  ])
  if (commit.code !== 0 && !/nothing to commit/i.test(commit.stderr)) {
    throw new Error(`git commit baseline failed: ${commit.stderr || commit.stdout}`)
  }
}

export function extractUnifiedDiff(text: string): string | null {
  const lines = (text || '').split('\n')
  const startIdx = lines.findIndex((l) => l.startsWith('diff --git') || l.startsWith('--- a/') || l.startsWith('*** Begin Patch'))
  if (startIdx < 0) return null
  const diff = lines.slice(startIdx).join('\n').trim()
  return diff || null
}

export async function applyPatchFile(repoDir: string, patchPath: string): Promise<{ ok: boolean; stat?: string; error?: string }> {
  const stat = await runGit(repoDir, ['apply', '--stat', patchPath])
  if (stat.code !== 0) {
    return { ok: false, error: `git apply --stat failed: ${stat.stderr || stat.stdout}` }
  }

  const apply = await runGit(repoDir, ['apply', '--whitespace=nowarn', patchPath])
  if (apply.code !== 0) {
    return { ok: false, error: `git apply failed: ${apply.stderr || apply.stdout}` }
  }

  return { ok: true, stat: stat.stdout }
}

export async function removeGitDir(repoDir: string): Promise<void> {
  const gitDir = path.join(repoDir, '.git')
  try {
    await fs.rm(gitDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
}

