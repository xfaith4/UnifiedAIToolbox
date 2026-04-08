# Management Team Schema v2

This folder contains a v2 evolution of the management-team protocol schema set.

## Design goals

- Bind `message_type` to the correct payload schema inside the envelope
- Add the missing `Verifier` role explicitly
- Make acceptance tests traceable with stable IDs
- Upgrade evidence from free-text strings to structured evidence objects
- Tighten sender/receiver expectations for key message types
- Improve accountability for stage execution and failure healing

## Main changes

### 1. Envelope is now a protocol gate
`envelope.schema.json` version 2.0 now:
- validates `message_type`
- constrains several sender/receiver pairs
- binds `payload` to the matching schema by `message_type`
- adds optional `stage` and `reply_to_message_id`

### 2. GoalSpec acceptance tests are structured
`goal-spec.schema.json` now defines acceptance tests as objects with:
- `id`
- `title`
- `procedure`
- `expected_result`
- `evidence_required`
- `priority`

This gives the verifier stable test targets and improves requirements-to-verification traceability.

### 3. Verification and knowledge use structured evidence
`verification-report.schema.json` and `knowledge-record.schema.json` now use evidence objects:
- `type`
- `ref`
- `summary`
- optional `excerpt`
- optional `source_role`
- optional `timestamp_utc`

### 4. Role model is internally consistent
The allowed roles now include:
- Concierge
- Commissioner
- Overseer
- Verifier
- Knowledge

### 5. NACK is more expressive
`nack.schema.json` now includes:
- `severity`
- richer `reason` enum
- optional `protocol_rule`
- optional `fix_examples`

### 6. Stage reporting carries more accountability
`stage-report.schema.json` now adds:
- `owner_role`
- `stage_attempt`
- `artifact_manifest`
- `blocking_message_id`
- `depends_on_message_ids`
- `percent_complete`
- `decision_needed`

## Implementation note

A few protocol rules are still beyond what draft-07 can fully guarantee, such as:
- proving every GoalSpec acceptance test has exactly one verification check
- proving `artifacts_expected` is a subset of `artifacts_present`
- enforcing all valid sender/receiver combinations for free-form progress messages

Those should be enforced in a second-layer protocol validator in your orchestration runtime.

## Recommended runtime checks

1. Every `GoalSpec.acceptance_tests[].id` must appear exactly once in `VerificationReport.checks[].acceptance_test_id`
2. `StageReport.status=completed` must imply `artifacts_expected ⊆ artifacts_present`
3. `Approval.decision=approved` should only advance when score >= 80
4. `VerificationReport.verification_status=pass` should require full coverage of all must-pass acceptance tests
5. `KnowledgeRecord` should be deduplicated on `failure_fingerprint` or `anti_repeat_key`

## Suggested migration strategy

- Treat this as protocol version `2.0`
- Update your orchestrator to validate envelopes first, then apply runtime protocol checks
- Migrate GoalSpec producers before Verification producers, because acceptance-test IDs are the main contract shift
