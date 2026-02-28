# App Factory vs Concierge — Run Lifecycle & Observability Alignment

> Last updated: 2026-02-28 (rev 2)
> Status: Living document — update when either pathway changes.

---

## 1. End-to-End Workflow Sequences

### 1.1 App Factory Pathway

```
User fills Engine form (goal, model, acceptance checks)
  └─ POST /api/app-factory/runs/start  (Next.js route, requires x-execution-token)
       ├─ Generates runId: maint-{ISO_TS}-{uuid8}  (e.g. maint-2026-02-28T12-00-00-000Z-a3f7b2c1)
       ├─ Creates {runsRoot}/{runId}/ directory
       ├─ Writes request.json, run_state.json (status: queued), events.ndjson (initial event)
       ├─ Spawns PowerShell: Unified-Orchestration.ps1 -JobType maintain_existing_app ...
       └─ Returns 202 { runId }

PowerShell process (background):
  ├─ Updates run_state.json in real time (status, stage, progress, risk, links)
  └─ Appends events to events.ndjson (NDJSON format)

UI monitors progress:
  ├─ useRunStatus hook → GET /api/app-factory/runs/{runId}/status (polls every 1.5s)
  └─ useRunEvents hook → EventSource /api/app-factory/runs/{runId}/events?stream=1 (SSE)
       └─ fallback → GET /api/app-factory/runs/{runId}/events?offset=N (file-tail JSON)
```

### 1.2 Concierge Pathway

```
User chats in Concierge → selects proposal → clicks "Start Run"
  └─ startOrchestratorRun(draft)  [conciergeRunService.ts]
       ├─ createNewRun() → local runId: multi-agent_{ts} or codex_{ts}  [orchestratorStore.ts]
       ├─ addLocalRun() → saves to localStorage (orchestrator.runs.v1)
       ├─ POST {ORCHESTRATOR_API_BASE}/orchestrate/run  (external orchestrator at localhost:8000)
       │    └─ Returns manifest: { run_id, status, events, ... }
       └─ saveRunContext() → persists to localStorage (concierge.run-context.v1) [runContextStore.ts]

Concierge page monitors progress:
  ├─ Inline polling (3s interval): GET {ORCHESTRATOR_API_BASE}/orchestrate/run/{runId}
  │    └─ Updates chat messages via narrateRunEvent()
  ├─ CurrentRunCard:
  │    └─ Polls fetchOrchestrationRun() every 5s
  └─ LiveEventPanel (drawer):
       └─ Polls fetchOrchestrationRun() with exponential backoff (3s → 30s)

Concierge run events live ONLY in the external orchestrator.
No filesystem directory is created for orchestrator runs.
```

---

## 2. API Endpoint Inventory

### App Factory (Next.js internal routes)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/app-factory/runs/start` | x-execution-token | Spawn PowerShell job |
| GET | `/api/app-factory/runs` | none | List all filesystem runs |
| GET | `/api/app-factory/runs/{runId}/status` | none | Read run_state.json |
| GET | `/api/app-factory/runs/{runId}/events` | none | SSE stream or JSON from events.ndjson |
| GET | `/api/app-factory/runs/{runId}/events?stream=1` | none | SSE mode |
| GET | `/api/app-factory/runs/{runId}/events?offset=N` | none | File-tail JSON mode |
| POST | `/api/app-factory/runs/{runId}/cancel` | none | Cancel run |

### Canonical unified routes (Next.js, proxy to app-factory + orchestrator fallback)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/runs/{runId}/summary` | Lightweight summary (runId, status, stage, step, timestamps) |
| GET | `/api/runs/{runId}/events/stream` | SSE stream (proxies app-factory; falls back to orchestrator) |
| GET | `/api/runs/{runId}/events/file` | File-tail JSON (proxies app-factory; falls back to orchestrator) |

### Orchestrator API (external, default: http://localhost:8000)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/orchestrate/run` | Create orchestration run |
| GET | `/orchestrate/run/{runId}` | Fetch run + embedded events |
| GET | `/orchestrate/runs` | List all orchestrator runs |
| POST | `/orchestrate/run/{runId}/cancel` | Cancel run |
| POST | `/orchestrate/run/{runId}` (force) | Force cancel |
| GET | `/orchestrate/run/{runId}/log` | Tail log |

---

## 3. Identity Model

| ID | Who Mints It | Format | Lives In | Used By |
|----|-------------|--------|----------|---------|
| `run_id` (App Factory) | `start/route.ts:173` | `maint-{ISO}-{uuid8}` | Filesystem dir name, run_state.json | Status/events routes, useRunStatus, useRunEvents |
| `run_id` (Orchestrator) | `orchestratorStore.ts:62` → confirmed by orchestrator | `multi-agent_{ts}` or `codex_{ts}` | orchestrator DB, localStorage | fetchOrchestrationRun, CurrentRunCard, LiveEventPanel |
| `proposal_id` | `proposalStore.ts:28` | `proposal_{ts}_{random6}` | localStorage | runContextStore.proposalId links back to proposal |
| `slug` | optional, set by orchestrator | arbitrary string | run_state.json (if present) | Not currently used in routing |

**Invariant (post-alignment):** `run_id` is the single key used to look up status, events, and summary across all views. Proposal is upstream and logically separate.

---

## 4. Telemetry Model

### App Factory
- **Write path:** PowerShell appends JSON lines to `{runDir}/events.ndjson`
- **In-memory buffer:** `runEvents.ts` keeps last 400 events per runId in a Node.js Map (process-scoped)
- **Delivery:** SSE via `EventSource` subscribed to in-memory buffer; file-tail JSON as fallback
- **Heartbeat:** Every 15 seconds when SSE connection is open

### Concierge / Orchestrator
- **Write path:** External orchestrator process writes events to its own store
- **Delivery:** HTTP polling — `GET /orchestrate/run/{runId}` returns full run object with embedded `events[]`
- **Poll interval:** 3s in Concierge page, 5s in CurrentRunCard, 3s→30s backoff in LiveEventPanel
- **No SSE:** The orchestrator does not expose an SSE endpoint; polling only

### Canonical unified delivery (post-alignment)
Both pathways are accessible via:
- **SSE:** `GET /api/runs/{runId}/events/stream` — for App Factory runs, proxies to SSE buffer; for orchestrator runs, uses polling-based pseudo-SSE
- **File/JSON:** `GET /api/runs/{runId}/events/file?offset=N` — for App Factory runs, reads NDJSON; for orchestrator runs, returns embedded events

---

## 5. Root Cause Analysis — Concrete Mismatches

### M-1: Swarm View "run not found" for Concierge runs

**Symptom:** Visiting `/runs/{runId}/swarm` for a Concierge run shows an error or "Events unavailable".

**Root cause:**
`useRunEvents` (`features/swarm-viz/hooks/useRunEvents.ts:133`) calls
`GET /api/app-factory/runs/{runId}/status`
which calls `loadRunStatus(runId)` which reads from the **filesystem** at `{runsRoot}/{runId}/`. Concierge runs have no filesystem directory — they live only in the external orchestrator. So the route returns 404 → `useRunEvents` sets `error` → Swarm View shows the error banner.

The Swarm View page also calls `fetchOrchestrationRun(runId)` directly (line 51) as a parallel lookup, which works for orchestrator runs but not for App Factory runs. This partial fix means the status badge shows correctly if the orchestrator API is available, but events remain empty.

**Fix (implemented):** The status and events routes now fall back to the orchestrator API when no filesystem run is found. See §6.

### M-2: Incompatible status vocabulary

**App Factory statuses** (from `normalizeState` in `runStatus.ts`):
- `queued`, `running`, `succeeded`, `failed`

**Orchestrator statuses** (raw from API):
- `queued`, `pending`, `dispatching`, `running`, `in_progress`, `gating`, `awaiting_gate`, `stuck`, `completed`, `cancelled`, `failed`, `error`

**Impact:** App Factory runs only report `succeeded` (not `completed`); `dispatching` and `stuck` are not recognized and fall through to `running`. The Runs list filter for "complete" only matches `completed | success | succeeded`; App Factory's `succeeded` is handled. Status badges in Concierge `CurrentRunCard` handle `succeeded` → "Completed" correctly.

**Fix (implemented):** `normalizeState` now maps `dispatching` → `running` and `stuck` → `failed`. A new `RunStatus` shared enum is defined in `types.ts`.

### M-3: Event format mismatch

**App Factory events** (`events.ndjson`):
```json
{ "ts": "ISO", "type": "stage.start", "stage": "Assemble", "message": "...", "level": "info", "phase": "...", "agent": "...", "status": "running", "data": {} }
```

**Orchestrator events** (embedded in `/orchestrate/run/{runId}`):
```json
{ "ts": "ISO", "type": "status|info|warn|error|agent:*|overseer:*", "message": "..." }
```

**Impact:** `useRunEvents` normalizes both via `normalizeEvent()` but the richer App Factory fields (`phase`, `agent`, `status`, `step`) are absent in orchestrator events, so Swarm View shows fewer nodes for Concierge runs.

**Fix status:** Accepted as current limitation. Orchestrator must emit richer events for full Swarm View support.

### M-4: CurrentRunCard only works for orchestrator runs

`CurrentRunCard` polls `fetchOrchestrationRun()` (orchestrator API). If the run_id is an App Factory run (prefix `maint-`), the orchestrator call returns 404 and the card silently stops updating.

**Fix (implemented):** `CurrentRunCard` now detects App Factory run IDs and falls back to polling `/api/app-factory/runs/{runId}/status`. See §6.

### M-5: Job type routing gap

Concierge blocks `maintain_existing_app` at the service layer (`conciergeRunService.ts:20-22`). App Factory only accepts `maintain_existing_app`. There is no bridge: a user wanting to run a maintenance job must manually navigate to App Factory.

**Fix status:** Accepted as intentional UX split for now. The "Open in App Factory" link in Concierge provides navigation.

### M-6: No dev request tracing

Neither flow logs the sequence of API calls or the IDs returned, making debugging hard.

**Fix (implemented):** Dev-only tracing added in two layers:

- **Server-side** (`orchestratorFallback.ts`): logs `[orchestratorFallback] status lookup → {url}` and resolved status/event count. Status/events routes add `X-Run-Source: app-factory | orchestrator` response header.
- **Client-side** (`orchestratorApi.ts`, `conciergeRunService.ts`, `CurrentRunCard.tsx`, `LiveEventPanel.tsx`): each call emits `console.debug` with the exact endpoint URL, the `run_id` parameter, and the returned `run_id`/`status`/event count.

To observe in browser DevTools: open Console → filter on `[OrchestratorAPI]`, `[ConciergeRun]`, `[CurrentRunCard]`, or `[LiveEventPanel]`.

---

### M-7: `/api/runs/{runId}/summary` has no orchestrator fallback

**Symptom:** Any component calling `GET /api/runs/{runId}/summary` for a Concierge run gets a 404.

**Root cause:** `src/app/api/runs/[runId]/summary/route.ts` (line 16) calls only `loadRunStatus(runId)` (filesystem lookup). It does not call `fetchOrchestratorRunStatus` as a fallback, unlike the parallel status route at `/api/app-factory/runs/{runId}/status`.

**Evidence:**

```typescript
// summary/route.ts:16 — no orchestrator fallback
const status = await loadRunStatus(runId)
if (!status) {
  return NextResponse.json({ error: { code: 'RUN_NOT_FOUND' ... } }, { status: 404 })
}
```

**Impact:** Swarm View and any future dashboard widget that uses the canonical `/api/runs/{runId}/summary` will silently fail for all Concierge runs.

**Fix status:** Open — add `fetchOrchestratorRunStatus` fallback mirroring `status/route.ts`.

---

### M-8: `/runs/[runId]` detail page bypasses canonical routes for App Factory runs

**Symptom:** Navigating to `/runs/maint-{...}` shows "Run not found" because the page calls the orchestrator API directly, which has no knowledge of App Factory runs.

**Root cause:** `src/app/runs/[runId]/page.tsx` (lines 197–218) issues:

1. `GET {ORCHESTRATOR_API_BASE}/orchestrate/repo/{runId}/artifacts` — 404 for any `maint-` run
2. On 404, falls back to `fetchOrchestrationRun(runId)` — also 404 for `maint-` runs

Neither call goes through `/api/app-factory/runs/{runId}/status` or the canonical `/api/runs/{runId}/summary`.

**Evidence:**

```typescript
// runs/[runId]/page.tsx:196-215
const listRes = await fetch(`${ORCHESTRATOR_API_BASE}/orchestrate/repo/${runId}/artifacts`)
if (listRes.status === 404) {
  const [run] = await Promise.allSettled([fetchOrchestrationRun(runId), ...])
  // fetchOrchestrationRun → GET {ORCHESTRATOR_API_BASE}/orchestrate/run/{runId}
  // This always 404s for maint- runs
}
```

**Impact:** The run detail page at `/runs/{runId}` is broken for all App Factory runs. Users must navigate directly to the App Factory Engine page to see run details.

**Fix status:** Open — the page needs a pathway that detects `maint-` prefix and reads from `/api/app-factory/runs/{runId}/status` instead of the orchestrator API.

---

## 6. Unification Plan — Implemented Invariants

### Invariant I-1: run_id is canonical across all views

Any view that receives a `run_id` (regardless of source) can resolve status and events using the canonical routes `/api/runs/{runId}/summary` and `/api/runs/{runId}/events/*`. These routes implement a two-tier lookup:

1. Try filesystem (`{runsRoot}/{runId}/`) — App Factory runs
2. If not found, proxy to orchestrator API — Concierge/orchestrator runs

This makes Swarm View, Run Detail, and Run list work for both pathways.

### Invariant I-2: Single canonical event stream

| Endpoint | SSE | JSON | Fallback |
|----------|-----|------|---------|
| `/api/runs/{runId}/events/stream` | primary | — | polling pseudo-SSE from orchestrator |
| `/api/runs/{runId}/events/file` | — | primary | orchestrator embedded events |

SSE is preferred; file-tail JSON is the fallback when SSE is unavailable (used by `useRunEvents` reconnect path).

### Invariant I-3: Graceful degradation in Swarm View

When `useRunEvents` encounters an error:
- Swarm View shows: "Events unavailable. Showing run summary with agents marked as not started until telemetry returns."
- `runSummary` (from `fetchOrchestrationRun`) is still shown in status bar, stage, and timestamps
- Swarm View never shows "run not found" unless both the filesystem AND orchestrator API return 404

### Invariant I-4: Proposal status is separate from run status

- The proposal panel displays "Proposal status" (approved/pending/rejected)
- The Run Monitor card displays "Run status" (queued/running/complete/failed)
- No UI element merges the two

### Shared status enum

```typescript
// Canonical run status values — use these everywhere
type RunStatusUnified =
  | 'queued'       // no worker assigned yet
  | 'dispatching'  // worker assigned, not yet processing
  | 'running'      // actively processing
  | 'stuck'        // no heartbeat/progress beyond threshold
  | 'gating'       // human review gate
  | 'completed'    // finished successfully (also: succeeded, success, done)
  | 'failed'       // terminal failure (also: error, cancelled)
```

Display labels: Queued / Dispatching / Running / Stuck / Review Required / Completed / Failed

---

## 7. Migration Steps (remaining / future work)

| Priority | Task | Owner |
|----------|------|-------|
| P0 | Orchestrator API should emit richer events (`phase`, `agent`, `step`) for full Swarm View support | Backend |
| P0 | Concierge: CurrentRunCard should detect maint- prefix and use app-factory status polling | Done (this PR) |
| P1 | Unify run listing: `/api/app-factory/runs` and `/orchestrate/runs` should be merged behind `/api/runs` | Full-stack |
| P1 | Concierge → App Factory bridge: when goal matches maintain_existing_app, offer "Start in App Factory" with pre-filled form | UX |
| P2 | Orchestrator: expose SSE endpoint so Concierge runs get true live streaming (not polling) | Backend |
| P2 | App Factory: write run_manifest.json with `source: 'app-factory'` so id-prefix-based detection isn't needed | Backend |
| P3 | Unified run registry: a single database table linking all run_ids, their source, and their proposal_id | Architecture |

---

## 8. File Reference Map

### Frontend Services
| File | Purpose |
|------|---------|
| `src/lib/services/conciergeRunService.ts` | Launch orchestrator runs from Concierge, event narration |
| `src/lib/services/orchestratorApi.ts` | HTTP client for external orchestrator API |
| `src/lib/services/orchestratorStore.ts` | localStorage cache for orchestrator runs |
| `src/lib/services/proposalStore.ts` | CRUD proposals + draft runs |
| `src/lib/services/runContextStore.ts` | Lightweight run metadata for page persistence |

### App Factory Backend
| File | Purpose |
|------|---------|
| `src/lib/app-factory/runs/runStatus.ts` | Read run_state.json + events from filesystem |
| `src/lib/app-factory/runs/runEvents.ts` | In-memory event buffer + SSE subscription |
| `src/lib/app-factory/runs/orchestratorFallback.ts` | NEW: Proxy orchestrator API for non-filesystem runs |
| `src/lib/app-factory/runs/types.ts` | Shared TypeScript types |

### API Routes
| File | Endpoint |
|------|---------|
| `src/app/api/app-factory/runs/start/route.ts` | POST /api/app-factory/runs/start |
| `src/app/api/app-factory/runs/[runId]/status/route.ts` | GET /api/app-factory/runs/{runId}/status |
| `src/app/api/app-factory/runs/[runId]/events/route.ts` | GET /api/app-factory/runs/{runId}/events |
| `src/app/api/runs/[runId]/summary/route.ts` | GET /api/runs/{runId}/summary |
| `src/app/api/runs/[runId]/events/stream/route.ts` | GET /api/runs/{runId}/events/stream |
| `src/app/api/runs/[runId]/events/file/route.ts` | GET /api/runs/{runId}/events/file |

### UI Components
| File | Purpose |
|------|---------|
| `src/components/runs/CurrentRunCard.tsx` | Run Monitor card (Concierge + Reports) |
| `src/components/runs/LiveEventPanel.tsx` | Live event drawer (Concierge) |
| `src/features/swarm-viz/hooks/useRunEvents.ts` | SSE + file-tail event hook (Swarm View) |
| `src/app/engine/_source/hooks/useRunStatus.ts` | App Factory run status poll + SSE hook |
