# Application Production Path

Last updated: 2026-04-05

## Purpose

This document defines the optimal path from orchestration to a fully produced, functioning application.

The current system is already strong at:

- intent capture
- proposal and requirements refinement
- orchestration visibility
- checkpoint and resume
- learning capture

The remaining gap is application completion. A run should not stop at “agents produced output.” It should converge on “the generated application is materially runnable and reviewable.”

## North-star path

The canonical path for `build_new_app` should be:

`Intent -> Contract -> Requirements checkpoint if needed -> Plan -> Generate files -> Install dependencies -> Build -> Test -> Smoke -> Repair targeted failures -> Re-test -> Package deliverables -> Learn -> Improve next run`

This is the transition from an orchestration engine to an application production loop.

## What “functioning app” means here

A functioning app is not merely code on disk.

At minimum, the system should prove:

- the app files were materialized into a coherent project structure
- dependencies can be installed or otherwise resolved
- the app builds successfully for its declared stack
- core tests or smoke checks run successfully when available
- the output matches the declared brief closely enough for operator review
- the run packages enough evidence for a human to trust the result

For frontend applications, this should eventually include:

- section-presence checks against the brief
- interaction checks for primary user flows
- responsive layout proof
- screenshot or preview evidence

## Production gate layers

### Layer 0: Structural readiness

Verify that the generated app has the files needed for its stack.

Examples:

- `package.json`
- `index.html`
- `vite.config.*`
- `src/`
- `pyproject.toml`
- `go.mod`

### Layer 1: Executable setup

Verify the app can prepare its runtime.

Examples:

- `npm install`
- `pnpm install`
- Python environment and dependency resolution

### Layer 2: Build proof

Verify the app can compile or bundle.

Examples:

- `npm run build`
- `python -m build`
- `cargo build`

### Layer 3: Runtime proof

Verify the app can start or serve.

Examples:

- `npm run dev` with bounded timeout and health probe
- framework-specific start script

### Layer 4: Behavior proof

Verify the app does the brief’s core job.

Examples:

- smoke tests
- section/route presence checks
- DOM assertions
- workflow walkthroughs

### Layer 5: Delivery proof

Verify the run leaves behind a usable package.

Examples:

- generated source tree
- verification logs
- summarized readiness state
- screenshots or preview evidence when relevant
- final synthesis tied to gate evidence

## Readiness states

The application-production loop should converge on one of these explicit states:

- `repair_needed`
- `insufficient_evidence`
- `verified`
- `ready_for_delivery`

These states should be operator-visible and written into the run manifest.

## Recommended implementation phases

### Phase A: Production gate summary

Goal:
Make `build_new_app` runs show whether the generated app passed any meaningful executable checks.

Deliverables:

- detect `generated_app/`
- run applicable verifier checks against that directory
- write a machine-readable gate report
- surface it in Run Detail

### Phase B: Deterministic install + build

Goal:
Move from passive verification to active proof that the generated app can prepare and build.

Deliverables:

- install gate with bounded timeout
- build gate with bounded timeout
- logs captured as artifacts
- stack-aware command selection

### Phase C: Targeted repair routing

Goal:
When gates fail, produce specific repair work instead of generic requeue.

Deliverables:

- map failing gate to likely responsible agent lane
- attach build/test logs to repair prompts
- re-run only the needed repair stage where possible

### Phase D: Runtime + UX smoke

Goal:
Prove the built app behaves plausibly.

Deliverables:

- health probe or local launch check
- route/section presence validation
- optional browser smoke for key user path

### Phase E: Delivery and packaging

Goal:
Make the run output operator-ready and handoff-ready.

Deliverables:

- delivery manifest
- readiness summary
- verification artifacts
- screenshots or preview evidence when applicable

## Guardrails

- Do not replace the current orchestration core. Extend it.
- Keep requirements checkpoints and learning artifacts first-class.
- Do not silently mutate agent instruction libraries as part of this phase.
- Every new gate should emit machine-readable artifacts and operator-readable summaries.
- Prefer bounded, deterministic checks over long-running open-ended execution.

## Current status

As of 2026-04-05:

- requirements checkpoints and learning loops are in place
- corrective actions and instruction adjustments are surfaced
- the next active track is the app-production loop
- the first implementation slice is to verify `generated_app/` explicitly and surface the result in Run Detail
