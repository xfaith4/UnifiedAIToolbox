# Unified AI Toolbox

Local-first orchestration platform for repeatable, auditable AI workflows — with prompt libraries, agent rosters, run tracking, and multiple UX entry points (web app, API, CLI/automation).

## Start here

- **Documentation index:** [index.md](index.md)
- **Master roadmap (canonical):** [ROADMAP.md](ROADMAP.md)
- **Information architecture:** [information-architecture.md](information-architecture.md)
- **Architecture overview:** [Unified-AI-Toolbox-Architecture.md](Unified-AI-Toolbox-Architecture.md)

## Orchestration contracts (2026-05, source of truth)

Canonical specs for run state, events, and agent-to-agent messaging. These
override older statements when they conflict.

- **A2A envelope:** [contracts/A2A_CONTRACT.md](contracts/A2A_CONTRACT.md)
- **Run lifecycle (8 canonical statuses):** [contracts/RUN_LIFECYCLE.md](contracts/RUN_LIFECYCLE.md)
- **Event taxonomy (13 canonical event types):** [contracts/EVENT_TAXONOMY.md](contracts/EVENT_TAXONOMY.md)
- **Decision Lock (blocker severity):** [contracts/DECISION_LOCK.md](contracts/DECISION_LOCK.md)
- **Run events base schema:** [run-events.schema.md](run-events.schema.md)
- **Conceptual model contract:** [CONCEPTUAL_MODEL_CONTRACT.md](CONCEPTUAL_MODEL_CONTRACT.md)

## Operating a run

- **Acceptance checklist (modernization gate):** [ACCEPTANCE_CHECKLIST.md](ACCEPTANCE_CHECKLIST.md)
- **How to evaluate a run:** [EVALUATING_A_RUN.md](EVALUATING_A_RUN.md)
- **Troubleshooting:** [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **Changelog:** [../CHANGELOG.md](../CHANGELOG.md)

## Repository doc discovery contract (important)

This repo has lots of subsystems. To prevent “missing roadmap items” and doc drift:

1) **All roadmap work lives in** `docs/roadmap.md` (single source of truth).
2) **All docs must be discoverable from** `docs/index.md`.
   - Component-level docs may live next to the code (recommended),
   - but they must be linked from the index.
3) Do **not** create ad-hoc “Implementation Summary” files.
   Update `docs/roadmap.md` checkboxes + add completion notes instead.

## Major areas

- `apps/`
  - Product surfaces and services (web app, orchestration bridge, etc.)
- `Orchestration/`
  - PowerShell orchestration engine + agents + contracts
- `agents/`
  - Agent registry and definitions
- `docs/`
  - Canonical docs: roadmap, architecture, runbooks, decisions

## Quickstart (high level)

This repo can be run in multiple ways depending on the app/service you’re working on. Start by:

1) Read `docs/index.md` (it links to app-specific setup).
2) Pick the entrypoint you care about (web app vs orchestration bridge vs scripts).
3) Follow that component README for prerequisites and run commands.

## Common tasks

### Update or add roadmap items

- Edit `docs/roadmap.md`
- Add checklist items under the relevant RM section
- Treat it as the living ledger:
  - checkbox tick
  - completion date
  - PR link or run id
  - 1–2 lines of “done notes”

### Inventory docs and manifests

Use `Sweep-RepoManifests.ps1` to gather:

- manifest files (package.json, requirements, etc.)
- optionally all `.md` files
- optionally generate/refresh `docs/index.generated.md`

See: `tools/` (or wherever you keep scripts) and `docs/index.md`.

## Contributing / workflow notes

- Keep component docs close to code, but always link them from `docs/index.md`.
- Prefer small, checklist-aligned commits that map back to `docs/roadmap.md`.
