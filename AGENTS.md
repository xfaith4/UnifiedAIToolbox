# Codex Orchestration Rules

This repo uses a lightweight orchestration workflow for Codex-driven changes. Keep steps small, verify intent, and keep artifacts local.

## Orchestration Rules

1. Intake
   - Restate the goal in one or two sentences.
   - Identify required files, scripts, or workflows.
   - Call out missing inputs (tokens, env vars) before execution.

2. Plan
   - Propose the smallest viable plan for the goal.
   - Prefer existing scripts/templates in this repo.
   - Avoid broad refactors; stay scoped to the request.

3. Execute
   - Make targeted changes.
   - Keep orchestration artifacts in local-only directories.
   - Do not commit or push unless explicitly requested.

4. Verify
   - Run relevant checks if feasible.
   - If checks are skipped, state why.

5. Report
   - Summarize what changed and where.
   - List any follow-ups or remaining blockers.

## Worktree-Isolated Execution (Phase 1)

For runs that modify code, the orchestration engine supports git-worktree
isolation so parallel agents in the same wave cannot trample each other.

**When to use it:** any plan whose steps mutate files in a target repo
(code-gen, refactors, doc updates, multi-implementer A/B tournaments).

**Branching scheme:**

```
uaitb/<runId>/integration       <- run-level branch (audit trail)
uaitb/<runId>/step-<id>         <- per-step branch (isolated worktree)
uaitb/<runId>/quarantine/step-N <- failed step (preserved for forensics)
```

**Lifecycle:**

1. `Initialize-RunIntegration` creates `uaitb/<run>/integration` off `main`
   and gives it a worktree under `.uaitoolbox/runs/<run>/worktrees/integration/`.
2. For each step, `New-RunWorktree` creates `uaitb/<run>/step-<id>` and a
   worktree under `.uaitoolbox/runs/<run>/worktrees/step-<id>/`.
3. Steps in the same wave run in parallel without conflict because each has
   its own working tree.
4. After each step, `Merge-RunWorktree` either:
   - **OK** -> commits pending changes, merges step branch into integration,
     removes the worktree, deletes the step branch.
   - **FAILED** -> renames step branch to `uaitb/<run>/quarantine/step-N`,
     removes the worktree (branch preserved for inspection).
5. `Complete-RunIntegration` optionally fast-forwards a target branch
   (typically `main`) to the integration branch — but only if it's not
   currently checked out anywhere (no silent working-tree desyncs).

**Invocation:**

```powershell
.\Run-Orchestration.ps1 -PlanPath plan.json `
    -UseWorktrees `
    -RepoRoot C:\path\to\target\repo `
    -BaseRef main `
    -RunId my-run-id `
    -MergeIntegrationTo main `
    -PushOnComplete
```

**Or enable in `runner.config.json`:**

```json
{
  "worktree": {
    "enabled": true,
    "baseRef": "main",
    "purgeOnFailure": false
  }
}
```

**Cleanup contract:**
- Successful run -> integration branch + main fast-forwarded; all worktrees gone; step branches deleted.
- Failed run -> integration branch preserved; quarantine branches preserved; worktrees gone.
- `-PurgeOnFailure` -> aggressive cleanup including quarantine branches.
- `Remove-RunArtifacts` is idempotent and safe to call after partial failures.

## Definition of Done

- Requested repo hygiene updates are implemented.
- AGENTS.md documents orchestration rules and this definition of done.
- PR template includes "How to test" and "Done means..." sections.
- .gitignore ignores local orchestration artifacts (for example `.uaitoolbox/` or `runs/`).
- README includes a short "Orchestration workflow" section with intake/plan/execute steps and artifact locations.
- Any workflow/PR attempt is reported with success or a clear blocker.
