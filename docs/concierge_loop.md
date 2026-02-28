# Concierge Requirements Loop

Last updated: 2026-02-28

## Contract

Incomplete requirements are not run failures.

When requirements are resolvable but missing:

- Commissioner returns `commissioner_decision=needs_requirements`
- Verifier sets `verification_status=needs_requirements`
- Run state is set to `blocked_requirements`
- A structured `requirements_request` packet is persisted
- Concierge asks follow-up questions and resumes flow

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

- Concierge surfaces blockers as a concise “What I need next” packet.
- Run Detail shows “Needs requirements” as non-failure outcome.
- Knowledge system records learning from blocked runs and can still mark learning as `pass` if prevention patches + regression checks are present.
