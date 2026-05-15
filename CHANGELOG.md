# Changelog

All notable changes to the Unified AI Toolbox are recorded here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project does not
yet declare semver across the whole repo, but feature surfaces (contracts,
endpoints) are versioned where they appear.

---

## [2026-05] Modernization Pass

A four-lane parallel modernization of the orchestration core: contracts, run
reliability, web UI, and documentation. Goal: make a run readable end-to-end —
from the user's intent through agent activity, blockers, validation, and a
final answer with cited evidence.

### Orchestration contracts (Lane 1)

- Added [docs/contracts/A2A_CONTRACT.md](docs/contracts/A2A_CONTRACT.md) — canonical
  agent-to-agent envelope, blocker shape, final-answer contract, recovery, and
  versioning policy (`envelope_version` 1.0.0).
- Added [docs/contracts/RUN_LIFECYCLE.md](docs/contracts/RUN_LIFECYCLE.md) — the
  state machine for the 8 canonical statuses (`queued`, `running`,
  `waiting_on_input`, `recovering`, `blocked`, `validating`, `completed`,
  `failed`) plus transition rules and UI badge mapping.
- Added [docs/contracts/EVENT_TAXONOMY.md](docs/contracts/EVENT_TAXONOMY.md) — 13
  canonical event types with required payload fields and ordering guarantees.
- Added [docs/contracts/DECISION_LOCK.md](docs/contracts/DECISION_LOCK.md) —
  blocker severity model (`hard_blocker`, `soft_blocker`, `clarification_needed`,
  `non_blocking_gap`) and recovery-strategy mapping.
- Added TypeScript validators at
  `apps/unifiedtoolbox.webapp/src/lib/contracts/a2aEnvelope.ts` and
  `decisionLock.ts` (26 tests passing).
- Hardened agent prompts in [prompts/agent-library.active.json](prompts/agent-library.active.json)
  for Commissioner, Critic, Engineer, and Synthesizer to emit canonical
  envelopes and blocker shapes.
- **Known limitation.** Drift between `prompts/agent-library.active.json` and
  `Orchestration/agents/agent-library.json`; the Researcher checksum is stale
  (`"1.11111111111111E+63"`). Tracked in
  [docs/ROADMAP.md](docs/ROADMAP.md) → "Post-Modernization → Soon".

### Run reliability and eventing (Lane 3)

- New libraries under `apps/unifiedtoolbox.webapp/src/lib/app-factory/runs/`:
  `canonicalEvents.ts` (append-only `events.jsonl` writer + SSE serializer),
  `manifest.ts` (run manifest builder), `artifactIndex.ts`
  (`artifacts.index.jsonl` append + reader), `finalSummary.ts` (atomic
  `final_summary.json` writer), `runLogger.ts` (structured run-scoped logger).
- New API endpoints:
  - `GET /api/runs/[runId]/manifest` — canonical run manifest.
  - `GET /api/runs/[runId]/artifacts` — listing from the artifact index.
  - `GET /api/runs/[runId]/events/canonical` — JSON snapshot and SSE stream
    with `Last-Event-ID` replay, 15 s heartbeat, and `stream-end` sentinel.
  - Enriched `GET /api/runs/[runId]/summary`.
- 61/61 tests passing; `npx tsc --noEmit` exits 0.
- **Known limitation.** Producers (orchestrator + agent runners) are not yet
  wired to `appendEvent` / `indexArtifact` / `writeFinalSummary`. Legacy runs
  will show empty manifests until producers are migrated. Tracked in
  [docs/ROADMAP.md](docs/ROADMAP.md) → "Post-Modernization → Now".

### WebUI / UX (Lane 2)

- Run Console redesign aligned to the canonical contracts: per-agent cards
  consume `agent_started` / `agent_progress` / `agent_completed` events;
  blockers panel reads `agent_blocked` severity from the Decision Lock; final
  result panel reads `final_summary.json`; artifacts panel reads the artifact
  index; SSE client uses `Last-Event-ID` for replay.

> See the Lane 2 components under `apps/unifiedtoolbox.webapp/src/components/runs/`
> (existing `CurrentRunCard`, `LiveEventPanel`, `RequirementsPanel`,
> `RequirementsConfirmCard`) and any new files added by the Lane 2 pass for the
> exact component layout.

### Documentation / testing (Lane 4)

- Updated [README.md](README.md) — short product description, quickstart,
  prominent links to `docs/contracts/`, acceptance checklist, and modernization
  pass summary.
- Updated [docs/README.md](docs/README.md) — index of new docs.
- Updated [docs/ROADMAP.md](docs/ROADMAP.md) — added "Post-Modernization"
  section (Now / Soon / Later) covering producer wiring, agent-library drift,
  Windows file-locking, and live-tail.
- Updated [docs/Unified-AI-Toolbox-Architecture.md](docs/Unified-AI-Toolbox-Architecture.md)
  — added "Run Lifecycle & Contracts (2026-05)" section with flow diagram,
  status table, event-type list, and endpoint list.
- Updated [docs/orchestration-experience-roadmap.md](docs/orchestration-experience-roadmap.md)
  — appended satisfied vs. remaining goals.
- Added [docs/ACCEPTANCE_CHECKLIST.md](docs/ACCEPTANCE_CHECKLIST.md) — 10-item
  modernization-pass acceptance gate.
- Added [docs/EVALUATING_A_RUN.md](docs/EVALUATING_A_RUN.md) — operator/engineer
  guide to verifying a run end-to-end.
- Added [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) — covers stuck runs,
  empty manifests, SSE disconnects, envelope validation, rollup binary, and
  pnpm vs npm.
- Added this CHANGELOG.md.
