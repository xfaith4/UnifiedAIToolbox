# Orchestration Run Storyboard

Last updated: 2026-05-15

## Purpose

This document defines the intended operator story for an orchestration run in UnifiedAIToolbox.

It answers one practical question:

When a run pauses, fails, or finishes, should the operator stay in **Run Detail** to act on the run, or go back to **Concierge** to talk about what happened?

## Core rule

Use the surface that matches the kind of work you need to do next.

- Use **Run Detail** when the next step is to act on the current run.
- Use **Concierge** when the next step is to reinterpret the goal, adjust the plan, or talk through what should happen next.

That distinction must stay clear in the UI.

## The product story

The intended story is:

`Intent -> Proposal -> Run -> Observe -> Decide -> Resume or Reframe`

### 1. Intent

The operator starts in **Concierge**.

Concierge is for:

- describing the goal
- refining the ask
- reviewing the proposed plan
- approving a run

Concierge is not the primary place for low-level run remediation.

### 2. Proposal

The system produces a proposal with:

- goal summary
- assumptions
- risks
- agent cast
- tool permissions
- acceptance expectations

The operator either approves the proposal or revises it.

### 3. Run

After approval, the system creates a run and launches orchestration.

At this point:

- the run becomes the active execution object
- **Run Detail** becomes the primary operational surface
- global status surfaces may point back to the run, but should not replace it

### 4. Observe

The operator can observe the run from:

- global run pill: awareness only
- Runs list: history and navigation
- Run Detail: primary operational summary
- Swarm View: observability and sequencing, not remediation-first detail dumping

### 5. Decide

When the run stops being straightforward, the UI must help the operator make one clear choice.

The decision must always resolve to one of two paths:

1. **Resume this run**
2. **Reframe outside this run**

Anything else is noise.

## Surface responsibilities

### Concierge

Concierge is for:

- re-explaining the user goal
- describing dissatisfaction with the outcome
- changing scope
- changing assumptions
- clarifying intent
- creating a new or revised proposal

Concierge should sound like:

- "The goal needs to be reframed."
- "The previous run surfaced confusion in the request."
- "Let’s revise the plan before trying again."

Concierge should not be the first place the UI sends the user when the current run already has a direct, structured recovery path.

### Run Detail

Run Detail is for:

- understanding what happened in the current run
- seeing the definitive outcome
- seeing the next recommended action
- answering requirements questions
- requeueing or retrying the run
- opening artifacts only when needed

Run Detail should sound like:

- "This run paused because requirements are missing."
- "Answer these requirement prompts to resume the same run."
- "This run failed due to configuration mismatch."
- "Correct the configuration, then requeue."

Run Detail should not force the operator to infer whether the next step is local run recovery or broader goal reframing.

## State-by-state storyboard

### Queued

Meaning:

- the run has been accepted
- execution has not started yet

Primary surface:

- Runs list for awareness
- Run Detail if the operator wants to inspect or cancel

Expected CTA:

- wait
- cancel if no longer wanted

### Running

Meaning:

- execution is active

Primary surface:

- Run Detail

Expected CTA:

- observe only unless cancellation is necessary

### Blocked requirements

Meaning:

- the run did not hard-fail
- the workflow is waiting for information that can resume the same run lineage

Primary surface:

- **Run Detail**

Expected CTA:

- answer the structured requirements prompts in Run Detail
- resume the same run

Secondary path:

- go to Concierge only if the operator believes the goal itself is wrong, incomplete, or should be rewritten

Clear rule:

- if the missing information is already expressed as structured requirement questions, the default path is **stay in Run Detail**

### Failed with a recoverable execution or validation issue

Meaning:

- the run executed, but a gate, contract, configuration, or orchestration condition prevented success

Primary surface:

- **Run Detail**

Expected CTA:

- read the concise incident summary
- take the named correction
- requeue or repair

Secondary path:

- go to Concierge only if the operator wants to rethink the request, the acceptance expectations, or the proposed approach

Clear rule:

- if the failure message ends in a concrete operational action, the default path is **stay in Run Detail**

### Completed successfully

Meaning:

- the run finished its current contract successfully

Primary surface:

- Run Detail for results

Expected CTA:

- review outputs
- start the next chapter from Concierge only if follow-on work is needed

## Decision rule for the UI

When a run is not in a straightforward success path, the UI must present one primary recommendation:

### Recommend "Stay in Run Detail" when

- the run has structured requirements prompts
- the run has a named repair or requeue path
- the issue is configuration, contract, gate, or execution-state specific
- the next step can be completed without changing the user’s goal

### Recommend "Go to Concierge" when

- the operator needs to explain dissatisfaction in plain language
- the goal, assumptions, or success criteria need to change
- the run surfaced ambiguity that is not captured as structured requirement questions
- the operator wants a fresh proposal rather than resuming the current lineage

## UX wording contract

The UI should stop asking the operator to infer the workflow.

For blocked requirements, the page should say something like:

- **What happened:** This run paused because required information was missing.
- **What to do now:** Answer the requirement prompts below to resume the same run.
- **Use Concierge instead if:** you want to revise the goal or explain why the proposal itself was wrong.

For recoverable failures, the page should say something like:

- **What happened:** This run failed because the execution contract did not match the requested workflow.
- **What to do now:** Correct the issue and requeue this run.
- **Use Concierge instead if:** you want to change the goal, scope, or success criteria before trying again.

## Non-goals

This storyboard does not make:

- Swarm View the primary remediation surface
- Concierge the default place for every failure
- raw logs the first thing the operator sees

## Implementation implications

The product should reflect these rules consistently:

- **Run Detail** should own the operational next step for blocked and recoverable runs.
- **Concierge** should be framed as the reframing and narrative surface, not the default recovery surface.
- Summary panels should always include:
  - what happened
  - what to do now
  - when to use Concierge instead
- Swarm View should remain observability-first and point back to the correct action surface.

## Definition of clarity

The operator should be able to answer these questions in under five seconds:

1. Did the run fail, pause, or complete?
2. What is the single recommended next action?
3. Am I supposed to stay with this run, or go back to Concierge?

If the UI does not answer those three questions clearly, it is not meeting the storyboard.
