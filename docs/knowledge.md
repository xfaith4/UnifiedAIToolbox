# Knowledge Rubric

Last updated: 2026-02-28

## Purpose

Knowledge is a learning artifact, not a mirror of run pass/fail state.

- `verification_status` describes run outcome
- `knowledge_status` describes learning quality

This allows:

- `Learning: PASS` with `Run: FAILED`
- `Run: blocked_requirements` without marking knowledge as failed

## Entry schema

Each knowledge entry may include:

- `run_id`
- `goal`, `goal_tokens`
- `status`
- `verification_status`
- `knowledge_status`: `pass | needs_info | fail`
- `knowledge_score`: `0..10` (optional)
- `learning`:
  - `classification`
  - `what_broke`
  - `root_cause`
  - `evidence[]`
  - `prevention_patches[]`: `{ target, change, artifact_ref? }`
  - `regression_checks[]`
  - `questions_needed[]` (required when `knowledge_status=needs_info`)

Legacy fields are preserved for backward compatibility.

## Rubric

- `pass`
  - `learning.classification`, `what_broke`, `root_cause` present
  - `evidence.length >= 1`
  - `prevention_patches.length >= 1`
  - `regression_checks.length >= 1`
- `needs_info`
  - learning exists but evidence/root-cause confidence is insufficient
  - include `questions_needed[]`
- `fail`
  - knowledge generation crashed or output was malformed

## Migration

Existing `knowledge_base.json` entries are migrated safely on load:

- if `learning.prevention_patches.length > 0` -> `knowledge_status=pass`
- else if `overseer_warnings` exists or `verification_status=failed` -> `knowledge_status=needs_info`
- else -> `knowledge_status=needs_info`

No fields are removed during migration.
