import { promises as fs } from 'fs'
import path from 'path'
import type { RepoContract } from '../contracts/RepoContract'
import type { RepoContractEvaluation } from '../contracts/evaluateRepoContract'

export type DeterministicRepairResult = {
  fixed: boolean
  filesPatched: string[]
  notes: string[]
}

/**
 * Attempts to fix common contract failures without an LLM.
 * Safe to call without an API key. Returns what was patched.
 *
 * Currently handles:
 * - invalid_root_package_json (parse errors): recovers JSON or writes a minimal stub
 * - invalid_root_package_json (missing fields): patches name/private/scripts in place
 */
export async function runDeterministicRepair(
  repoDir: string,
  contract: RepoContract,
  contractEval: RepoContractEvaluation,
): Promise<DeterministicRepairResult> {
  const filesPatched: string[] = []
  const notes: string[] = []

  const parseFailure = contractEval.failures.find(
    (f) => f.kind === 'invalid_root_package_json' && Array.isArray(f.missing) && f.missing.includes('parse'),
  )

  if (parseFailure) {
    const patched = await tryFixPackageJsonParse(repoDir, contract)
    if (patched) {
      filesPatched.push('package.json')
      notes.push('Recovered package.json from parse error')
    }
  } else {
    const fieldFailure = contractEval.failures.find(
      (f) =>
        f.kind === 'invalid_root_package_json' &&
        Array.isArray(f.missing) &&
        f.missing.length > 0 &&
        !f.missing.includes('parse'),
    )
    if (fieldFailure) {
      const patched = await tryPatchPackageJsonFields(repoDir, contract)
      if (patched) {
        filesPatched.push('package.json')
        notes.push('Patched missing fields in package.json')
      }
    }
  }

  return { fixed: filesPatched.length > 0, filesPatched, notes }
}

/**
 * Attempts to recover package.json when it cannot be JSON-parsed.
 * Tries in order:
 *   1. Strip markdown code fences
 *   2. Extract first {...} block
 *   3. Write a minimal stub derived from the contract
 */
async function tryFixPackageJsonParse(repoDir: string, contract: RepoContract): Promise<boolean> {
  const pkgPath = path.join(repoDir, 'package.json')
  let raw: string
  try {
    raw = await fs.readFile(pkgPath, 'utf8')
  } catch {
    // File missing — write a minimal one
    await fs.writeFile(pkgPath, JSON.stringify(buildMinimalPackageJson(contract), null, 2) + '\n', 'utf8')
    return true
  }

  // Already valid — caller should not have called us, but guard anyway
  try {
    JSON.parse(raw)
    return false
  } catch {}

  // Strategy 1: strip markdown code fences (``` ... ```)
  const fenceStripped = raw
    .replace(/^```[a-z]*\n?/gm, '')
    .replace(/^```\s*$/gm, '')
    .trim()
  try {
    JSON.parse(fenceStripped)
    await fs.writeFile(pkgPath, fenceStripped + '\n', 'utf8')
    return true
  } catch {}

  // Strategy 2: find first complete {...} block in the content
  const match = fenceStripped.match(/(\{[\s\S]*\})/)
  if (match) {
    try {
      const extracted = match[1]
      JSON.parse(extracted)
      await fs.writeFile(pkgPath, extracted + '\n', 'utf8')
      return true
    } catch {}
  }

  // Strategy 3: write a minimal valid stub derived from the contract
  await fs.writeFile(pkgPath, JSON.stringify(buildMinimalPackageJson(contract), null, 2) + '\n', 'utf8')
  return true
}

/**
 * Patches a parseable package.json that is missing required fields
 * (name, private, scripts) as reported by the contract evaluator.
 */
async function tryPatchPackageJsonFields(repoDir: string, contract: RepoContract): Promise<boolean> {
  const pkgPath = path.join(repoDir, 'package.json')
  let pkg: Record<string, unknown>
  try {
    pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'))
  } catch {
    return false
  }

  let changed = false

  if (typeof pkg.name !== 'string' || !String(pkg.name).trim()) {
    pkg.name = (contract.stackId || 'app').replace(/[^a-z0-9-]/g, '-').toLowerCase()
    changed = true
  }

  if (typeof pkg.private !== 'boolean') {
    pkg.private = true
    changed = true
  }

  const existingScripts = pkg.scripts
  const scriptsInvalid =
    !existingScripts ||
    typeof existingScripts !== 'object' ||
    Array.isArray(existingScripts) ||
    Object.keys(existingScripts as object).length === 0

  if (scriptsInvalid) {
    pkg.scripts = buildMinimalPackageJson(contract).scripts
    changed = true
  }

  if (changed) {
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
  }
  return changed
}

function buildMinimalPackageJson(contract: RepoContract): {
  name: string
  version: string
  private: boolean
  scripts: Record<string, string>
} {
  return {
    name: (contract.stackId || 'app').replace(/[^a-z0-9-]/g, '-').toLowerCase(),
    version: '0.1.0',
    private: true,
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      lint: 'next lint',
      typecheck: 'tsc --noEmit',
    },
  }
}
