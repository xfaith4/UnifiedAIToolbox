# Run Telemetry UI Inventory and Model

## Step 1 inventory (current runtime telemetry sources)

### API + polling path used by App Lifecycle today

- `apps/unifiedtoolbox.webapp/src/app/engine/page.tsx` routes to the engine source app.
- `apps/unifiedtoolbox.webapp/src/app/engine/_source/hooks/useRunStatus.ts` polls `/api/app-factory/runs/{runId}/status`.
- `apps/unifiedtoolbox.webapp/src/app/api/app-factory/runs/[runId]/status/route.ts` returns normalized run status.
- `apps/unifiedtoolbox.webapp/src/lib/app-factory/runs/runStatus.ts` builds status from local run artifacts.

### Data files used by the status normalizer

- `run_state.json`
- `status.json`
- `run_manifest.json`
- `orchestration-summary.json`
- `events.ndjson` (preferred), `events.jsonl`, or `events.log`
- `artifacts/` and fallback `artifacts_index.json`

### UI panels currently consuming status payloads

- `apps/unifiedtoolbox.webapp/src/app/engine/_source/components/MaintenanceRunPanel.tsx`
- `apps/unifiedtoolbox.webapp/src/app/engine/_source/components/JobTypeOverviewPanel.tsx`
- `apps/unifiedtoolbox.webapp/src/app/engine/_source/components/PipelineStepper.tsx`

### Event stream availability

- `/api/app-factory/runs/{runId}/events` exists but is not currently the primary UI source.
- Milestone runtime writes `events.ndjson` from `Orchestration/scripts/MilestoneController.ps1`.

## Step 2 normalized telemetry model (new)

Implemented in:

- `apps/unifiedtoolbox.webapp/src/lib/app-factory/runs/telemetryModel.ts`

### Purpose

Provide one reducer/selector layer that converts raw `RunStatusResponse` + event text into a stable UI model for:

- active phase + active agent
- per-agent status cards
- per-phase progress/blocked state
- artifacts by lifecycle state
- gates by live status
- timeline narrative text

### Supported normalized event types

- `run_started`, `run_completed`, `run_failed`
- `phase_started`, `phase_completed`, `phase_failed`
- `agent_started`, `agent_completed`, `agent_failed`, `agent_waiting`
- `artifact_created`, `artifact_updated`
- `gate_started`, `gate_result`
- `contract_invalid`, `contract_repair_attempted`, `contract_repair_failed`
- `log`

### Core state shape

```ts
RunTelemetryState {
  runId, runStatus, startedAt, updatedAt, endedAt,
  activePhaseId, activeAgentId,
  phases: Record<TimelinePhaseId, PhaseTelemetryState>,
  phaseOrder: TimelinePhaseId[],
  agents: Record<string, AgentTelemetryState>,
  agentOrder: string[],
  artifacts: ArtifactTelemetryState[],
  gates: Record<string, GateTelemetryState>,
  gateOrder: string[],
  events: NormalizedTelemetryEvent[],
  timeline: TimelineNodeState[],
  narrative,
  warnings
}
```

### Selectors exposed for UI wiring

- `selectAgentBoardGroups(state, filters?)`
- `selectPhaseBoardCards(state, filters?)`
- `selectPipelineSteps(state)`
- `selectTimeline(state)`
- `selectTimelineEvents(state, filters?)`
- `selectTimelineGroups(state, filters?)`
- `selectAgentSignals(state)`
- `selectArtifactsPanel(state, filters?)`
- `selectGates(state, filters?)`

### Graceful fallback behavior in model

- Missing telemetry returns an empty pending model with `narrative = "No telemetry yet"`.
- Unknown event/stage names are inferred into best-fit phases.
- Agent/group/phase/gate states default to pending/queued and upgrade as events arrive.

## Step 3 UI wiring (completed)

### Wired UI surface

- `apps/unifiedtoolbox.webapp/src/app/engine/_source/components/MaintenanceRunPanel.tsx`
  - Builds `RunTelemetryState` from polled run status via `buildRunTelemetryState(status)`.
  - Uses selectors only for view data:
    - `selectPhaseBoardCards`
    - `selectAgentBoardGroups`
    - `selectTimeline`
    - `selectTimelineGroups`
    - `selectArtifactsPanel`
    - `selectGates`
  - Adds local filter state:
    - `selectedPhaseId?: TimelinePhaseId`
    - `selectedAgentId?: string`
    - handlers: phase click, agent click, clear filters
  - Restores transparency panels:
    - Phase Board (ordered cards, active + blocked + completion state)
    - Agent Board (grouped cards with status, activity, duration, quick signals)
    - Timeline strip + chronological grouped events with severity styling
    - Artifacts panel (in progress vs produced, newest-first from selector)
    - Gates panel (ordered status cards with messages/report links)
    - Narrative + warnings banner

### Selector additions for filtering

- `apps/unifiedtoolbox.webapp/src/lib/app-factory/runs/telemetryModel.ts`
  - Added shared filter contract: `TelemetryFilterOptions`
  - Added phase card selector: `selectPhaseBoardCards`
  - Added event selectors: `selectTimelineEvents`, `selectTimelineGroups`
  - Added agent signal selector: `selectAgentSignals`
  - Extended existing selectors to accept filter options:
    - `selectAgentBoardGroups`
    - `selectArtifactsPanel`
    - `selectGates`

### Verification

1. `cd apps/unifiedtoolbox.webapp`
2. `npm run test -- src/lib/app-factory/runs/__tests__/telemetryModel.test.ts`
3. `npx eslint src/lib/app-factory/runs/telemetryModel.ts src/lib/app-factory/runs/__tests__/telemetryModel.test.ts src/app/engine/_source/components/MaintenanceRunPanel.tsx`
4. Start the web app and run a maintenance orchestration from App Lifecycle.
5. Click phase cards and agent cards to verify filtered timeline/board behavior and clear filters.

## Step 4 run-view hardening (incremental)

### Scope

- `apps/unifiedtoolbox.webapp/src/app/engine/_source/components/MaintenanceRunPanel.tsx`
- `apps/unifiedtoolbox.webapp/src/lib/app-factory/runs/telemetryModel.ts`
- `apps/unifiedtoolbox.webapp/src/lib/app-factory/runs/__tests__/telemetryModel.test.ts`

### Performance and scale safety

- Timeline row rendering is virtualization-aware for large runs in `MaintenanceRunPanel.tsx`.
  - Virtualized mode enables when row count exceeds `TIMELINE_VIRTUALIZATION_ROW_THRESHOLD` (240).
  - Uses viewport windowing + overscan (`TIMELINE_OVERSCAN`) and measured row heights.
- Expensive derivations are memoized at the panel boundary:
  - `buildRunTelemetryState(status)` memoized on `status`.
  - selector bundle (`phaseCards`, `agentGroups`, timeline groups, artifacts, gates, repair targets, warnings) memoized on telemetry + filters + warning clock.

### Operator warnings (pure selector logic)

- Warning logic is centralized in `telemetryModel.ts`:
  - `selectRunOperatorWarnings(state, { nowMs?, thresholdMs? })`
  - `RUN_VIEW_WARNING_THRESHOLD_MINUTES` / `RUN_VIEW_WARNING_THRESHOLD_MS` defaults to 5 minutes.
- Running-state rules:
  - no telemetry: `now - updatedAt > threshold`
  - phase stalled: active phase has not transitioned for `threshold`
- Queued-state stall signal is also surfaced:
  - queued stalled: `run status is queued` and no fresh telemetry beyond threshold.
- Tests added/updated in `telemetryModel.test.ts` for finished runs, missing/future timestamps, unknown active phase, and stale run warnings.

### URL filter persistence and operator workflow

- `selectedPhaseId` and `selectedAgentId` are synchronized to query params in `MaintenanceRunPanel.tsx`:
  - read on mount/run switch
  - write via `history.replaceState` (preserves other query params)
  - clear removes both params
- Keyboard flow:
  - cards remain focusable buttons
  - `Escape` clears active filters
  - `Enter` / `Space` uses native button activation

### Explainability and safe fallbacks

- In-place legend added for phase and severity chips.
- Live telemetry hint banner added to reduce "silent queued/running" ambiguity:
  - waiting for first event
  - telemetry active
  - telemetry idle/stalled warning tone
- Repair indicator in agent cards is clickable when a target exists:
  - opens artifact when supported
  - otherwise jumps to linked timeline event
  - if no target: explicit `Not available`.
- Incomplete telemetry safeguards:
  - empty timeline: `Run started, awaiting telemetry...`
  - unknown phases: disabled in phase board (`Unknown telemetry`)
  - missing artifact open links: `Open not available`

### How to verify

1. `cd apps/unifiedtoolbox.webapp`
2. `npm run test -- src/lib/app-factory/runs/__tests__/telemetryModel.test.ts`
3. `npx eslint src/lib/app-factory/runs/telemetryModel.ts src/lib/app-factory/runs/__tests__/telemetryModel.test.ts src/app/engine/_source/components/MaintenanceRunPanel.tsx`
4. `npm run dev`, open App Lifecycle Run View, start a run.
5. Click a phase card and verify timeline + boards scope to that phase, then click an agent card and verify agent-level scoping.
6. Refresh with active filters and confirm `selectedPhaseId` / `selectedAgentId` restore from URL query params.
