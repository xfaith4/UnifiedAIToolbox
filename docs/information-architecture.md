# Information Architecture

Last updated: 2026-04-05

## Purpose

This document defines the current canonical information architecture for Unified AI Toolbox and records the Phase 0 direction for moving the product toward a story-led orchestration experience.

## Current canonical structure

### Home

- `/`
- Narrative front door for the product
- Explains the primary workflow:
  - intent
  - cast
  - run
  - learn

### Ideas

- `/concierge`
- Guided intake, proposal generation, requirements clarification, and proposal-to-run handoff

### Recipes

- `/prompts`
- `/agents`
- `/mcp-library`
- Reusable prompt assets, agent roles, and governed tool capabilities

### Build

- `/orchestrator`
- `/engine`
- Execution surfaces for flexible orchestration and structured application-building workflows

### Runs

- `/runs`
- `/runs/[runId]`
- `/runs/[runId]/swarm`
- Run review, status, events, artifacts, and intervention context

### Memory

- `/knowledge`
- Durable learning and pattern reuse from previous runs

### Observe

- `/dashboard`
- `/milestones`
- Analytics, telemetry, and trend reporting

### Admin

- `/settings`
- Preferences, credentials, and operator controls

## Route policy

### Canonical home route

- `/` is the canonical Home route
- `/home` and `/overview` redirect to `/`
- sidebar Home should target `/`

### Compatibility routes

The telemetry board remains available at `/dashboard` during the transition to a story-led home page.

Reason:
- preserve existing deep links and operator habits
- avoid a broad analytics/nav refactor in the same change set

Tradeoff:
- Home and telemetry remain separate concepts for now
- a later phase should decide whether `/dashboard` is renamed or absorbed into a broader Studio surface

## Phase 0 design decisions

### Decision 1: Make Home narrative-first

Home now orients the user around what to do next instead of immediately dropping them into telemetry.

Why:
- the repo already has strong execution and observability features
- the main UX gap is understanding how those features connect

### Decision 2: Keep the execution surfaces separate for now

`/orchestrator` and `/engine` remain distinct.

Why:
- each surface already has meaningful behavior and different constraints
- merging them now would create unnecessary implementation risk

Follow-up:
- later phases should rationalize when a user is sent to Playground vs App Lifecycle

### Decision 3: Add route-aware guidance instead of rewriting every page

Major surfaces now get a shared contextual banner describing where the user is in the workflow and what typically comes next.

Why:
- improves coherence immediately
- keeps page-level edits small
- avoids broad component churn

## Follow-up items

- decide whether `/dashboard` should remain a standalone route or become part of a future `Studio` surface
- turn prompt, agent, and tooling surfaces into explicit recipe objects
- add cast assembly UX between proposal approval and run launch
- redesign run detail around chapter-based storytelling and intervention moments
