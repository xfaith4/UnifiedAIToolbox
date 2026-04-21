# Frontier Software Factory Strategy

Last updated: 2026-04-21

## One-line positioning

Unified AI Toolbox is an evidence-first software production arena: one intent runs through multiple isolated candidate lanes, each lane produces verifiable evidence, and a judge promotes the best verified outcome.

## Purpose

This document defines how Unified AI Toolbox should evolve from a capable local-first orchestration system into a frontier-grade software factory.

The goal is not to add fashionable agent features.

The goal is to produce meaningfully better software outcomes than single-agent coding tools by combining:

- isolated execution
- multi-lane candidate generation
- real verification evidence
- durable state and resumability
- trace-based evaluation
- learning from prior runs

## What the latest primary sources actually support

The strongest current pattern is not “more agents.”

It is better harness engineering.

Across the latest official product and framework documentation:

- OpenAI Codex emphasizes isolated task environments, parallel task execution, verifiable terminal/test evidence, and repo-specific guidance via `AGENTS.md`.
- OpenAI background responses support long-running asynchronous agent work with polling, cancellation, and resumable streaming.
- OpenAI evals and trace grading support systematic regression detection and analysis of why an agent succeeded or failed.
- OpenAI computer use recommends sandboxed browser/VM execution, explicit allowlists, and human approval for high-impact actions.
- Anthropic’s Agent SDK exposes the same terminal/web/code loop used by Claude Code and adds hooks, memory, and subagent specialization.
- LangGraph documents durable execution, interrupts, and time-travel replay as first-class orchestration patterns.
- MCP remains the cleanest cross-provider tool plane for connecting models to external systems.
- SWE-agent and SWE-CI both reinforce the same design lesson: interface quality and long-horizon iterative verification matter more than naive one-shot agent generation.

## Repo-grounded implication

Unified AI Toolbox already has several pieces many teams do not have:

- run lifecycle control
- operator-visible checkpoints
- app-production verification and repair routing
- MCP governance
- run observability
- knowledge carry-forward

That means the repo should not pivot into “yet another chat-to-code surface.”

It should become an evidence-first orchestration harness for software production.

## Proposed differentiator

The most promising differentiated product direction is:

## Evidence Arena

Inference from current market behavior:
Most products still center on one agent working one task in one lane, with humans manually comparing outcomes across tools.

Unified AI Toolbox can instead run a single software goal through multiple evidence-producing lanes, score the outcomes, and present the best verified result with traceable reasons.

The system should feel less like “an AI IDE” and more like “a software build arena.”

Core properties:

- one intent
- multiple isolated candidate lanes
- each lane produces code, logs, traces, verification artifacts, and UX evidence
- a judge lane compares candidates against explicit success criteria
- the system can promote the best candidate or request another repair round

This is the unusual opportunity in this repo.

## Repo asset map

The arena does not need to be invented from scratch. Most of the inputs already exist. This table documents which existing repo asset feeds which arena concept so future agents do not re-derive it.

| Arena concept | Existing repo asset |
| --- | --- |
| Lane evidence: code/files changed | `generated_app_files`, `_materialize_engineer_artifacts` in `app.py` |
| Lane evidence: gate verdicts | `app_production` summary written by `_summarize_app_production_gates` |
| Lane evidence: repair history | `app_production_repairs` plan + `attempts[]` written by `_execute_app_production_repairs` |
| Lane evidence: verification result | `verification_status`, `sandbox_report` in run manifest |
| Lane evidence: events / trace | `events.ndjson` and `events[]` in the run manifest |
| Lane evidence: checkpoints | `checkpoints[]` and `corrective_actions[]` in run manifest |
| Adjudication evidence input | `app_production.passed_count/failed_count/skipped_count`, `delivery_readiness`, repair attempt counts, file change count |
| Lane execution boundary | `out_dir` (run directory) — already isolated per run |
| Cross-lane comparison surface | Run Detail (`apps/unifiedtoolbox.webapp/src/app/runs/[runId]/page.tsx`) |

The remaining work is therefore not "build the evidence", it is "promote the evidence to a canonical lane shape and add a judge".

## Canonical lane and arena schema

The contract below is the canonical shape for the multi-lane manifest. All providers (the existing internal lane today, optional Codex / Anthropic SDK lanes later) must conform to it.

### Lane record (one per candidate)

```json
{
  "lane_id": "internal-default",
  "provider": "internal",
  "label": "Internal Orchestration",
  "status": "verified",
  "started_at": "2026-04-21T00:00:00Z",
  "completed_at": "2026-04-21T00:05:00Z",
  "evidence": {
    "files_changed_count": 12,
    "files_changed": ["generated_app/package.json", "generated_app/src/index.tsx"],
    "commands_run_count": 7,
    "checkpoints_triggered": 1,
    "events_recorded": 42,
    "gates": {
      "passed": 4,
      "failed": 0,
      "skipped": 1,
      "verdicts": [
        { "name": "build", "status": "passed" },
        { "name": "dev_server", "status": "passed" }
      ]
    },
    "repair": {
      "targets": 1,
      "attempts": 2,
      "status": "verified"
    },
    "verification_status": "passed",
    "delivery_readiness": "verified"
  },
  "score": {
    "total": 0.86,
    "components": {
      "gate_pass_rate": 0.80,
      "delivery_readiness": 1.0,
      "repair_efficiency": 0.75,
      "patch_size_penalty": -0.05,
      "checkpoint_penalty": -0.04
    }
  }
}
```

### Arena record (one per run)

```json
{
  "schema_version": "1",
  "run_id": "local-2026-04-21-...",
  "intent": "Build a Next.js todo app with auth",
  "criteria": {
    "must_have": ["build", "dev_server"],
    "nice_to_have": ["unit_tests", "smoke_tests"]
  },
  "lanes": [ /* lane record(s) above */ ],
  "verdict": {
    "winner_lane_id": "internal-default",
    "confidence": "low",
    "reasons": [
      "Only one candidate lane was executed for this run.",
      "Winning lane reached delivery_readiness=verified after 2 repair attempt(s)."
    ],
    "loser_reasons": [],
    "follow_up": [
      "Add a second candidate lane to enable comparative judgement."
    ]
  },
  "report_artifact": "arena.json",
  "summary_artifact": "arena.md"
}
```

The `score.total` is a number in `[0, 1]` and is the primary cross-lane comparable signal. Component breakdown is preserved so adjudication is debuggable.

## Sharpened Phase 1 acceptance criteria

Phase 1 is "done" when **all** of the following hold for any `build_new_app` run:

1. The run manifest contains a top-level `arena` field matching the schema above.
2. The run directory contains `arena.json` and `arena.md` artifacts.
3. The arena always contains at least one lane (the internal lane wrapping the existing run).
4. The arena verdict names a winner with at least one human-readable reason, even when only one lane exists.
5. None of the existing fields (`app_production`, `app_production_repairs`, `verification_status`, `sandbox_report`) are renamed or removed.
6. The Run Detail UI surfaces the arena as a discrete section with lane cards and verdict.

## Recommended frontier capability set

### 1. Provider-agnostic frontier execution lanes

Support the current in-repo orchestration lane plus optional frontier lanes behind one run contract:

- current local swarm / orchestration path
- OpenAI Codex-style lane for isolated parallel software tasks
- Anthropic Agent SDK / Claude-based lane for alternative coding behavior

This should be a lane abstraction, not a rewrite of the current orchestration model.

Each lane should emit the same canonical run evidence shape:

- actions taken
- files changed
- commands run
- tests executed
- checkpoints triggered
- artifacts produced
- final candidate verdict

### 2. Trace-graded evaluation arena

Move evaluation from “did build pass?” to “which lane performed best and why?”

Add a first-class arena evaluator that scores:

- contract adherence
- gate pass/fail outcome
- patch size and risk
- test delta
- UX evidence quality
- number and kind of interventions
- trace quality

The important shift is that traces themselves become evaluable artifacts, not just logs.

### 3. Browser / UX evidence lane

For generated apps, package/build success is not enough.

Add a browser evidence lane using sandboxed Playwright first, with computer-use style orchestration patterns where useful later.

Evidence should include:

- route reachability
- responsive layout proof
- section-presence assertions against brief requirements
- primary interaction checks
- screenshots or short step capture artifacts

This closes the current gap between “code exists” and “app is plausibly usable.”

### 4. Competitive candidate generation

For high-value tasks, run more than one candidate lane in parallel:

- different providers
- different prompting strategies
- different agent casts
- different repair heuristics

Then judge them.

Do not start with automatic patch-splicing across candidates.

Start with whole-candidate adjudication because it is easier to trust and debug.

### 5. Durable checkpointed execution

Preserve and extend the current same-run checkpoint model with stronger replay semantics:

- resume at lane level
- replay from pre-repair state
- compare attempt N vs N+1 directly
- surface operator decisions as part of the evaluation record

This is where LangGraph-style durable execution and time-travel concepts are useful as reference patterns even if the repo does not adopt LangGraph directly.

### 6. Run memory that learns from evidence, not only summaries

The knowledge loop should index more than goal text and narrative notes.

It should retain:

- which lane/provider won
- which eval criteria failed repeatedly
- which repair target types converged fastest
- which stack archetypes were fragile
- which prompts or recipes produced strong outcomes

This turns the product into a compounding system rather than a sequence of disconnected agent runs.

## Recommended implementation order

### Phase 1. Canonical lane contract

Add a provider-neutral `candidate lane` contract and event model.

Do not replace the existing run model.
Wrap it.

Definition of done:

- one run can contain multiple candidate lanes
- each lane has isolated artifacts
- each lane writes a canonical evidence summary

### Phase 2. Arena judge

Add an arena adjudicator that compares candidate lanes using explicit criteria and produces:

- winner
- loser reasons
- confidence
- required follow-up

Definition of done:

- one run with two lanes can produce a machine-readable adjudication artifact

### Phase 3. Frontend browser proof

Add frontend UX smoke evidence as a required lane for frontend app briefs.

Definition of done:

- a generated frontend app run can fail on UX evidence even when package/build succeeds

### Phase 4. Frontier provider lanes

Add optional OpenAI Codex-backed and Anthropic Agent SDK-backed execution lanes.

Definition of done:

- the same run contract can launch at least one external frontier lane and compare it to the internal lane

### Phase 5. Learning from arena outcomes

Promote arena judgments into knowledge and recipe recommendations.

Definition of done:

- future runs can prefer lanes, models, or recipes based on historical win rate for similar goals

## What to avoid

- do not replace the existing orchestration bridge wholesale
- do not make the UI more complex before the execution model improves
- do not equate more agents with better outcomes
- do not adopt browser autonomy without sandboxing and explicit approval boundaries
- do not trust vendor benchmark claims without repo-native evals

## Smallest high-leverage next slice

The next implementation slice should be:

1. add a canonical multi-lane candidate manifest shape
2. let one run contain the current internal lane plus a placeholder second lane
3. add an arena judge artifact that compares the lanes
4. feed the existing app-production evidence into that judge

This is smaller and more defensible than immediately integrating every new agent SDK.

It creates the seam where those integrations can later plug in.

## Source notes

Primary sources consulted for this direction:

- OpenAI Codex product and harness engineering materials
- OpenAI background responses, evals, trace grading, and computer use docs
- Anthropic Agent SDK, hooks, and subagent docs
- MCP official docs
- LangGraph durable execution, interrupts, and time-travel docs
- SWE-agent and SWE-CI research papers
