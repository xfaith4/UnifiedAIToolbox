# Findings

## Repo-grounded orchestration state

- `docs/ROADMAP.md` has `RM-010` for orchestration experience unification but no dedicated roadmap track yet for app-production gates / functioning-app completion.
- `docs/orchestration-experience-roadmap.md` is product-facing and stops short of a deep execution/verification pipeline for fully produced apps.
- `apps/UnifiedPromptApp/services/prompt-api/app.py` already:
  - materializes Engineer code blocks into `generated_app/` via `_materialize_engineer_artifacts`
  - stores `generated_app_files` in the run manifest
  - records verifier output for some paths, but the main `build_new_app` run flow does not yet expose a dedicated production-gate summary for the generated app
  - now stores checkpoint/corrective-action / instruction-adjustment artifacts from previous work in this session
- `apps/UnifiedPromptApp/services/prompt-api/orchestrator_verifier.py` already supports:
  - lint
  - build
  - unit tests
  - smoke tests
  - docker compose validation
- `Run Detail` currently surfaces requirements checkpoints and learning adjustments, but not yet an explicit “generated app verification / production readiness” panel for `build_new_app`.

## Design direction

- The next logical implementation slice is not another orchestration UX change.
- It is to verify the actual `generated_app/` directory for `build_new_app` runs and expose the result as a production-gate summary.
- Keep the first slice small:
  - do not redesign the whole verifier
  - do not add automatic repair loops yet
  - do add a canonical manifest field and operator-visible summary

## Documentation targets

- `docs/ROADMAP.md`
- `docs/index.md`
- new canonical doc for optimal application-production path
- new future-agent handoff doc with concrete continuation steps

## Implemented first production-gate slice

- Added `RM-011` for the app-production loop.
- Added canonical docs:
  - `docs/application-production-path.md`
  - `docs/future-agent-handoff-app-production.md`
- Added backend production-gate summary generation for `generated_app/` in Prompt API.
- Added operator surfacing for `app_production` in Run Detail.
- Deliberately did **not** change overall run completion semantics yet; the new gate summary is informative groundwork for the later repair-routing phase.
