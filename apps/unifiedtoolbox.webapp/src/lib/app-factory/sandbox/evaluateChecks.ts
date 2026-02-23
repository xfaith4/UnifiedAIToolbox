import type { SandboxCheck, VerificationResult } from '@/lib/types/orchestrator'

// Regex patterns that map acceptance check strings to evaluators and commands
const CHECK_RULES: Array<{
  pattern: RegExp
  evaluator: string
  command: string | null
}> = [
  { pattern: /build.*(pass|exit\s*0|succeed)/i, evaluator: 'build_check', command: 'npm run build' },
  { pattern: /no\s*(high.severity|critical).*(finding|vuln|issue)/i, evaluator: 'lint_check', command: 'npm run lint' },
  { pattern: /lint.*(pass|clean|zero)/i, evaluator: 'lint_check', command: 'npm run lint' },
  { pattern: /test.*(pass|succeed)/i, evaluator: 'test_check', command: 'npm test' },
  { pattern: /api\s*returns?\s*200/i, evaluator: 'http_probe', command: null },
  { pattern: /health\s*(check|endpoint)/i, evaluator: 'http_probe', command: null },
  { pattern: /commissioner\s*score\s*[>=]\s*\d+/i, evaluator: 'commissioner_score', command: null },
]

export type EvaluatedCheck = SandboxCheck & { command?: string }

/**
 * Determine the evaluator type and optional shell command for a given
 * acceptance check string.
 */
export function classifyCheck(check: string): { evaluator: string; command: string | null } {
  for (const rule of CHECK_RULES) {
    if (rule.pattern.test(check)) {
      return { evaluator: rule.evaluator, command: rule.command }
    }
  }
  return { evaluator: 'commissioner_score', command: null }
}

/**
 * Evaluate a list of acceptance checks without executing external commands.
 * Checks that require shell execution are marked as "deferred"; checks that
 * can be scored from static analysis or heuristics return "passed"/"failed".
 *
 * @param checks - Raw acceptance check strings from the proposal
 * @returns Array of evaluated SandboxCheck objects
 */
export function evaluateAcceptanceChecks(checks: string[]): EvaluatedCheck[] {
  return checks.map((check): EvaluatedCheck => {
    const { evaluator, command } = classifyCheck(check)

    if (command !== null) {
      // Shell commands must be executed by the sandbox engine; defer here
      return {
        check,
        evaluator,
        result: 'deferred' as VerificationResult,
        details: `Requires shell execution: \`${command}\`. Will be executed by the sandbox engine.`,
        command,
      }
    }

    if (evaluator === 'http_probe') {
      return {
        check,
        evaluator,
        result: 'deferred' as VerificationResult,
        details: 'HTTP probe requires a running service. Deferred until a target URL is available.',
      }
    }

    // commissioner_score and other abstract checks: defer for now
    return {
      check,
      evaluator,
      result: 'deferred' as VerificationResult,
      details: 'Abstract check deferred; review manually or configure a specific evaluator.',
    }
  })
}

/**
 * Merge a list of evaluated checks (possibly with shell-execution results
 * already filled in) and compute the aggregate VerificationStatus.
 */
export function aggregateStatus(
  checks: SandboxCheck[],
): 'passed' | 'failed' | 'partial' | 'deferred' | 'pending' {
  if (checks.length === 0) return 'pending'
  const passed = checks.filter((c) => c.result === 'passed').length
  const failed = checks.filter((c) => c.result === 'failed').length
  const deferred = checks.filter((c) => c.result === 'deferred').length

  if (failed > 0 && passed === 0 && deferred === 0) return 'failed'
  if (failed > 0) return 'partial'
  if (passed > 0 && deferred === 0) return 'passed'
  return 'deferred'
}
