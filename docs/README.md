# Unified AI Toolbox

Local-first orchestration platform for repeatable, auditable AI workflows — with prompt libraries, agent rosters, run tracking, and multiple UX entry points (web app, API, CLI/automation).

## Start here

- **Documentation index:** `docs/index.md`
- **Master roadmap (canonical):** `docs/roadmap.md`
- **Information architecture:** `docs/information-architecture.md`

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
