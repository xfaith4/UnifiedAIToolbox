# Conceptual Model Contract Stage

A mandatory `ConceptualModelContract` stage now runs between `Commissioner` and `Engineer`.

## Purpose

Convert interpreted intent into a machine-verifiable runtime contract that constrains implementation.

## Enforced Order

`... -> Commissioner -> ConceptualModelContract -> Engineer -> ...`

This is enforced in both:
- `scripts/swarms/toolbox_runner.py`
- `Orchestration/engine/codex-multiagent-swarm/Orchestrate-Codex.ps1`

## Contract Rules

- Contract output must be strict JSON (no markdown or commentary).
- Contract must include machine-falsifiable probes for objects/interactions/dynamics.
- Acceptance tests must be executable in theory and must be able to fail.

## Engineer Rules

Engineer output must include:

`### Contract Traceability`

with one line per contract id:

`contractId -> filePath : symbol : runtimeProbeExplanation`

Coverage is required for every object, interaction, and dynamic id in the contract.

## Runtime Verification

`apps/UnifiedPromptApp/services/prompt-api/app.py` now validates:
- Conceptual Model Contract schema and falsifiability checks.
- Engineer traceability coverage against the contract.

The verifier appends a mandatory conceptual-contract check to `sandbox_report.json` for each run.
