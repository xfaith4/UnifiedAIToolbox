import { promises as fs } from 'fs'
import path from 'path'
import type { RepoContract } from './RepoContract'
import { globToRegExp } from './glob'
import { DEFAULT_CODE_FILE_FORBIDDEN } from './defaultForbidden'

export type ContractFailure =
  | { kind: 'missing_required_file'; pattern: string; message: string }
  | { kind: 'missing_required_any'; patterns: string[]; message: string }
  | { kind: 'env_missing'; envVar: string; message: string }
  | {
      kind: 'forbidden_pattern'
      filePath: string
      ext: string
      ruleId: string
      description: string
      matches: { line: number; snippet: string }[]
      message: string
    }

export type RepoContractEvaluation = {
  stackId: string
  passed: boolean
  requiredFilesAll: { pattern: string; matched: string[] }[]
  requiredFilesAny: { patterns: string[]; matched: string[] }[]
  env: { name: string; present: boolean }[]
  failures: ContractFailure[]
  reportPath: string
}

const TEXT_FILE_MAX_BYTES = 2 * 1024 * 1024

async function listFilesRecursively(baseDir: string): Promise<string[]> {
  const out: string[] = []
  const stack: string[] = [baseDir]
  while (stack.length) {
    const current = stack.pop()
    if (!current) continue
    const entries = await fs.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next' || entry.name === 'dist' || entry.name === 'build') {
          continue
        }
        stack.push(full)
      } else if (entry.isFile()) {
        out.push(full)
      }
    }
  }
  return out
}

function relPosix(baseDir: string, fullPath: string): string {
  return path.relative(baseDir, fullPath).replace(/\\/g, '/')
}

function findLineMatches(text: string, re: RegExp, maxMatches = 20): { line: number; snippet: string }[] {
  const matches: { line: number; snippet: string }[] = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i] ?? '')) {
      matches.push({ line: i + 1, snippet: (lines[i] ?? '').slice(0, 200) })
      if (matches.length >= maxMatches) break
    }
  }
  return matches
}

function mergeForbidden<T extends { id: string }>(defaults: T[], overrides: T[]): T[] {
  const byId = new Map<string, T>()
  for (const r of defaults) byId.set(r.id, r)
  for (const r of overrides) byId.set(r.id, r)
  return Array.from(byId.values())
}

export async function evaluateRepoContract(repoDir: string, contract: RepoContract): Promise<RepoContractEvaluation> {
  const failures: ContractFailure[] = []
  const allFiles = await listFilesRecursively(repoDir)
  const allRel = allFiles.map((f) => relPosix(repoDir, f))

  const requiredFilesAll = contract.requiredFilesAll.map((pattern) => {
    const re = globToRegExp(pattern)
    const matched = allRel.filter((p) => re.test(p))
    if (!matched.length) {
      failures.push({
        kind: 'missing_required_file',
        pattern,
        message: `Missing required file matching '${pattern}'`,
      })
    }
    return { pattern, matched }
  })

  const requiredFilesAnyGroups = (contract.requiredFilesAny || []).map((patterns) => {
    const matched: string[] = []
    for (const pattern of patterns) {
      const re = globToRegExp(pattern)
      matched.push(...allRel.filter((p) => re.test(p)))
    }
    const uniq = Array.from(new Set(matched)).sort()
    if (!uniq.length) {
      failures.push({
        kind: 'missing_required_any',
        patterns,
        message: `Missing at least one of: ${patterns.join(', ')}`,
      })
    }
    return { patterns, matched: uniq }
  })

  const env = (contract.envVarsRequired || []).map((envVar) => {
    const present = Boolean(process.env[envVar])
    if (!present) {
      failures.push({ kind: 'env_missing', envVar, message: `Missing required env var '${envVar}'` })
    }
    return { name: envVar, present }
  })

  for (const fullPath of allFiles) {
    const ext = path.extname(fullPath).toLowerCase()
    const rules = mergeForbidden(DEFAULT_CODE_FILE_FORBIDDEN, contract.forbiddenPatternsByExtension[ext] || [])
    if (!rules?.length) continue

    const stat = await fs.stat(fullPath)
    if (stat.size > TEXT_FILE_MAX_BYTES) continue
    const text = await fs.readFile(fullPath, 'utf8')

    for (const rule of rules) {
      const re = new RegExp(rule.pattern, rule.flags ?? '')
      if (!re.test(text)) continue
      const rel = relPosix(repoDir, fullPath)
      failures.push({
        kind: 'forbidden_pattern',
        filePath: rel,
        ext,
        ruleId: rule.id,
        description: rule.description,
        matches: findLineMatches(text, re),
        message: `Forbidden pattern '${rule.id}' in ${rel}`,
      })
    }
  }

  const report: RepoContractEvaluation = {
    stackId: contract.stackId,
    passed: failures.length === 0,
    requiredFilesAll,
    requiredFilesAny: requiredFilesAnyGroups,
    env,
    failures,
    reportPath: path.join(repoDir, 'REPO_CONTRACT.json'),
  }

  await fs.writeFile(report.reportPath, JSON.stringify(report, null, 2), 'utf8')
  return report
}
