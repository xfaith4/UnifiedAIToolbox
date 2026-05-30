# Failure Treatment Policy (Planner-First)

This contract defines how pipeline failures are treated after testing or verification detects a failed outcome.

## 1. Core principle

When an implementation fails verification, default ownership is planning quality, not implementer intent. The testing agent returns evidence to the Planner so the Planner can issue a clarified plan delta and re-run with lessons learned.

## 2. Policy goals

- Preserve developer intent assumption: implementers execute in good faith.
- Route first-failure outcomes to planning by default.
- Force evidence-complete handoff before rerun.
- Prevent infinite repair loops.
- Improve future plan clarity through explicit lessons learned.

## 3. Ownership model

| Condition | Default owner | Why |
| --- | --- | --- |
| Failed or partial verification with ambiguous/missing plan guidance | Planner | Communication quality failed downstream. |
| Environment blocker surfaced during verification | Planner | Planner must make preconditions explicit. |
| Trivial local defect isolated to last patch with clear non-plan cause | Engineer | Fast fix path is cheaper than full planning cycle. |
| Mixed failure (plan ambiguity plus local coding bug) | Shared | Planner must tighten plan and Engineer applies patch. |

## 4. Mandatory artifact handoff to Planner

The testing or auditing stage must produce a planner handoff package with:

- verification report
- repair plan summary
- failure visibility artifact
- terminal summary
- run events log
- command/log artifacts for failed gates

Minimum context fields in handoff metadata:

- parent run id
- failure signature
- focus gate
- planner feedback note
- resume context

If the package is incomplete, the repair rerun must not be queued.

## 5. Failure classification contract

Every terminal failure must be classified into one primary class:

- plan_ambiguity
- missing_precondition
- unverifiable_acceptance
- environment_blocker
- implementation_defect

Routing rules:

- plan_ambiguity, missing_precondition, unverifiable_acceptance, environment_blocker: route to Planner first
- implementation_defect: route to Engineer only when no plan ambiguity is detected
- any mixed class: route to Planner first, then Engineer as delegated by Planner

## 6. Planner repair obligations

The Planner must emit a plan delta, not a full reset. The delta must include:

- clarified preconditions and dependency assumptions
- ordered execution steps with explicit handoff boundaries
- measurable acceptance criteria and runtime proof gates
- ambiguity fixes tied to evidence from failed artifacts
- lessons learned block for future runs

The Planner must also issue an updated repair prompt for the next run.

## 7. Repair rerun lifecycle

1. Test/Audit marks run failed or completed_with_errors.
2. Failure is classified and planner handoff package is written.
3. Planner generates plan delta and updated repair prompt.
4. Repair run is queued with lineage fields:
   - parent_run_id
   - repair_generation
   - failure_signature
   - planner_delta_ref
5. New run executes and reports terminal outcome.

## 8. Loop controls and escalation

- max_repair_generations: 1 by default for automatic handoff
- max_same_failure_signature: 2 across lineage
- escalate when:
  - same signature repeats beyond threshold
  - planner does not produce a valid plan delta
  - repair generation limit is reached with unresolved failure

Escalation target order:

1. Supervisor
2. Commissioner
3. Human intervention

## 9. Required events

The pipeline should emit these events for auditability:

- failure_classified
- planner_handoff_created
- planner_repair_plan_issued
- repair_run_queued
- repair_run_completed
- planner_escalated (when applicable)

## 10. Machine-readable companion contract

Schema: [../../contracts/failure_treatment_policy.v1.json](../../contracts/failure_treatment_policy.v1.json)

Use this schema when persisting policy metadata in run manifests or validating policy configuration files.
