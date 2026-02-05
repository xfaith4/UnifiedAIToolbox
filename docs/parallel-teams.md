# Parallel Teams Mode

Purpose: Describe safety-first parallel agent teams with deterministic assembly and ownership enforcement.

Parallel Teams Mode (`PARALLEL_TEAMS=true`) is a safety-first workflow for running multiple specialist agent teams concurrently while keeping the final repo deterministic and runnable.

It adds three concepts on top of the existing hardening pipeline:

1) **Decision Lock** (canonical contracts + stack lock + contract hash)
2) **Ownership enforcement** (teams can only write within assigned paths)
3) **Deterministic assembly** (stable conflict policy + reports)

This mode is optional and does not change behavior when disabled.

## Pipeline

When enabled, the App Factory hardening pipeline is treated as:

1. Agents
2. Decision Lock
3. Teams (ownership + deterministic assembly)
4. Assemble
5. Normalize
6. Contract
7. Gates
8. Repair (patch-only, limited cycles)
9. Export

Export is blocked until Normalize + Contract + Gates pass.

## Decision Lock artifacts

Decision Lock produces a set of canonical, frozen artifacts (written into the generated repo root):

- `STACK_LOCK.json`
- `API_CONTRACT.json`
- `DB_SCHEMA.sql`
- `types/shared/index.ts`
- `REPO_CONTRACT_SPEC.json`
- `CONTRACT_HASH.txt`
- `DECISION_LOCK_REPORT.md`

`CONTRACT_HASH.txt` is computed from the other Decision Lock artifacts (not including itself) so it remains stable.

## Team ownership boundaries (strict)

Each generated file is mapped to a single owner team. Writes outside a team’s owned paths are blocked and reported.

- **Shared Contracts Team**
  - `STACK_LOCK.json`
  - `API_CONTRACT.*`
  - `DB_SCHEMA.sql`
  - `types/shared/**`
- **Platform Team**
  - `infra/**`
  - `scripts/**`
  - `.github/**`
  - Root tooling/config files (workspace/package manager/config)
- **API Team**
  - `apps/api/**` (excluding `types/shared/**` and contract files)
- **UI Team**
  - `apps/web/**`
- **Data/ML Team**
  - `apps/api/src/jobs/**`
  - `apps/api/src/ml/**`

Violations produce:

- `OWNERSHIP_REPORT.md`

## Deterministic assembly + conflict policy

If multiple artifacts target the same file path, the assembler resolves the winner deterministically and emits:

- `ASSEMBLER_REPORT.md`

Priority order (highest wins):

1. Shared Contracts
2. Platform
3. API
4. UI
5. Data/ML

If a file is modified by a non-owner team, it is blocked (ownership violation). If conflicting writes occur, the result is deterministic and explained in `ASSEMBLER_REPORT.md`.

## Configuration

Environment variables:

- `PARALLEL_TEAMS` (default `false`)
- `MAX_PARALLEL_TEAMS` (default `4`)

## How to add a new team

1) Update team inference + ownership rules:

- `apps/unifiedtoolbox.webapp/src/lib/app-factory/parallel/teams.ts`

2) Update the planner instructions (so tasks are labeled with the new team specialization):

- `apps/unifiedtoolbox.webapp/src/app/engine/_source/hooks/orchestratorRuntime.ts`

3) Add or update tests:

- `apps/unifiedtoolbox.webapp/src/lib/app-factory/parallel/__tests__/`

## Interpreting reports

- `DECISION_LOCK_REPORT.md`: what was created/existing, locked paths, contract hash
- `OWNERSHIP_REPORT.md`: which artifacts were blocked and why (team/path mismatch)
- `ASSEMBLER_REPORT.md`: duplicate/conflicting writes and deterministic resolution

## Related docs
- [Hardening](hardening.md)
- [Orchestration](orchestration.md)
