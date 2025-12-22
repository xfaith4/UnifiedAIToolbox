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

## Definition of Done

- Requested repo hygiene updates are implemented.
- AGENTS.md documents orchestration rules and this definition of done.
- PR template includes "How to test" and "Done means..." sections.
- .gitignore ignores local orchestration artifacts (for example `.uaitoolbox/` or `runs/`).
- README includes a short "Orchestration workflow" section with intake/plan/execute steps and artifact locations.
- Any workflow/PR attempt is reported with success or a clear blocker.
