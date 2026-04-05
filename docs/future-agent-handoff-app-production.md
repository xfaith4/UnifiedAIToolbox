# Future Agent Handoff: App Production Loop

Last updated: 2026-04-05

## Read this first

This document assumes you are a future coding agent with no short-term memory of the prior session.

Your job is to continue the app-production loop work without re-deriving the entire repo strategy.

## Project intent

Unified AI Toolbox is not intended to be “just another chat wrapper.”

Its intent is to help a user:

- define work precisely
- route work through an orchestrated set of roles
- supervise runs
- intervene when requirements are unclear
- preserve lessons and reusable patterns
- ultimately produce durable application outputs

The product goal is not hype. It is disciplined application creation through orchestration, validation, learning, and reuse.

## What is already true in the repo

### Orchestration control loop

The repo now has:

- contract-first requirements gating
- structured requirements checkpoints
- same-run resume
- operator-visible checkpoint history
- corrective-action capture
- learning-agent instruction-adjustment capture
- similar-run knowledge context that carries those lessons forward

Relevant files:

- `Orchestration/scripts/POF.ps1`
- `apps/UnifiedPromptApp/services/prompt-api/app.py`
- `apps/unifiedtoolbox.webapp/src/app/runs/[runId]/page.tsx`
- `apps/unifiedtoolbox.webapp/src/app/knowledge/page.tsx`
- `docs/concierge_loop.md`

### Existing generated-app behavior

`build_new_app` already does part of the app-production job:

- Engineer output can be materialized into `generated_app/`
- generated file paths are stored in the run manifest
- the run can complete even when the app itself is not yet proven runnable

Relevant file:

- `apps/UnifiedPromptApp/services/prompt-api/app.py`
  - `_materialize_engineer_artifacts`

### Existing verifier capability

The repo already has a verifier that can run:

- lint
- build
- unit tests
- smoke tests
- docker compose validation

Relevant file:

- `apps/UnifiedPromptApp/services/prompt-api/orchestrator_verifier.py`

This verifier is the starting point. Do not replace it casually. Extend or wrap it.

## What was added in the current session

### Roadmap and planning

- `docs/ROADMAP.md` now includes `RM-011` for the app-production loop
- `docs/application-production-path.md` defines the target path
- this handoff doc exists so you do not need to infer intent from scattered changes

### Learning-path hardening

The Prompt API now stores and exposes:

- checkpoint history
- corrective actions
- instruction adjustments

Relevant file:

- `apps/UnifiedPromptApp/services/prompt-api/app.py`

### Operator-facing surfacing

Run Detail and Knowledge now show:

- checkpoint history
- answered blocker details
- learning-agent instruction adjustments

Relevant files:

- `apps/unifiedtoolbox.webapp/src/app/runs/[runId]/page.tsx`
- `apps/unifiedtoolbox.webapp/src/app/knowledge/page.tsx`

## Active roadmap target

The next active target is not more navigation or copy.

It is to make `build_new_app` converge on a functioning application rather than a plausible artifact set.

## Immediate next implementation order

If you are continuing from this document, do the work in this order:

1. Persist an explicit production-gate summary for `generated_app/`.
2. Surface that summary in Run Detail.
3. Add deterministic install/build proof for generated web apps.
4. Route failed gates into targeted repair tasks.
5. Add runtime and UX smoke evidence.

Do not jump straight to automatic repair loops without first making gate evidence explicit and operator-visible.

## The first slice should stay small

The correct first slice is:

- detect whether `generated_app/` exists
- run applicable verifier checks against `generated_app/`
- write a report artifact such as `generated_app_verification.json`
- store a summarized `app_production` object in the run manifest
- render it in Run Detail

That is enough to move the system from “files generated” to “generated app evaluated.”

## Suggested manifest shape

Use one canonical top-level run field:

`app_production`

Recommended shape:

```json
{
  "status": "repair_needed",
  "delivery_readiness": "insufficient_evidence",
  "app_dir": "generated_app",
  "report_artifact": "generated_app_verification.json",
  "checks": [
    {
      "name": "build",
      "status": "failed",
      "command": "npm run build",
      "exit_code": 1,
      "summary": "Build failed because dependencies were not installed.",
      "log_artifact": "logs/build.log"
    }
  ]
}
```

You may evolve the field names, but keep the data:

- machine-readable
- operator-readable
- stable enough for future repair routing

## Recommended readiness logic

Use explicit readiness states:

- `repair_needed`
- `insufficient_evidence`
- `verified`
- `ready_for_delivery`

Suggested semantics:

- any failed executable gate -> `repair_needed`
- no failed gates but also no meaningful executable proof -> `insufficient_evidence`
- successful build/smoke proof -> `verified`
- verified plus delivery artifacts complete -> `ready_for_delivery`

## Files you are most likely to touch next

- `apps/UnifiedPromptApp/services/prompt-api/app.py`
- `apps/UnifiedPromptApp/services/prompt-api/orchestrator_verifier.py`
- `apps/unifiedtoolbox.webapp/src/lib/types/orchestrator.ts`
- `apps/unifiedtoolbox.webapp/src/lib/services/orchestratorApi.ts`
- `apps/unifiedtoolbox.webapp/src/app/runs/[runId]/page.tsx`
- optionally `apps/UnifiedPromptApp/services/prompt-api/tests/test_orchestration.py`

## Constraints and guardrails

- The worktree is dirty. Do not revert unrelated repo changes.
- Use the existing orchestration flow. Do not redesign POF or the overall orchestration model.
- Do not silently modify agent instruction source files as part of “learning.”
- Prefer adding new manifest fields and report artifacts over changing legacy fields in-place.
- Keep implementation slices disciplined. The repo is large and already has drift.

## Known environment limitations from the current session

- `npm run typecheck` for the web app is usable.
- `python3 -m py_compile` is usable.
- focused pytest execution is unreliable in this environment due a local pytest capture/temp-file failure.
- live orchestration reruns are blocked here when the shell lacks the required API credentials.

This means:

- write code and compile/typecheck it
- add tests where sensible
- report pytest/live-run blockers honestly if still present

## What “done” looks like for the next phase

You are not done when:

- a run still only says “generated 12 files”

You are closer to done when:

- Run Detail can tell an operator whether the generated app passed any meaningful checks
- the run manifest contains structured app-production evidence
- future repair logic has concrete gate failures to consume

## Canonical docs to keep updated

- `docs/ROADMAP.md`
- `docs/application-production-path.md`
- `docs/index.md`
- this handoff doc

If you change the implementation direction materially, update the docs in the same turn.
