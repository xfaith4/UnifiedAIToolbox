# Concierge Requirements Loop

Last updated: 2026-04-05

## Contract

Incomplete requirements are not run failures.

When requirements are resolvable but missing:

- Commissioner returns `commissioner_decision=needs_requirements`
- Verifier sets `verification_status=needs_requirements`
- Run state is set to `blocked_requirements`
- A structured `requirements_request` packet is persisted
- A durable requirements checkpoint is persisted (`checkpoint_pending.json` + manifest `checkpoints[]`)
- The run keeps the same `run_id`; answering the checkpoint resumes the same run lineage instead of creating a new run
- Concierge and Run Detail can both collect the answers and queue the run to resume

Only hard-stop cases should fail (`hard_fail`), such as policy violations or contradictory constraints.

## requirements_request payload

Minimum shape:

- `summary`
- `blockers[]`
  - `id`
  - `question`
  - `why`
  - `defaults[]`
- `proposed_acceptance_tests[]`

## UX behavior

- Swarm View is observability-first: it must route the user to an actionable response surface instead of ending at telemetry.
- Concierge surfaces blockers as a concise “What I need next” packet.
- Run Detail shows “Needs requirements” as non-failure outcome and provides structured answer fields for each blocker.
- Once answers are submitted, the run returns to `queued` on the same `run_id` with a resume context derived from the checkpoint answers.
- Run Detail also exposes checkpoint history and learning-agent instruction adjustments so operators can see what changed before the resumed attempt.
- Knowledge system records learning from blocked runs and can still mark learning as `pass` if prevention patches + regression checks are present.
- Knowledge context for future similar runs includes corrective actions and minor instruction adjustments captured from prior repairs.
