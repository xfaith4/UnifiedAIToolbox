# Hardening

Purpose: Explain the App Factory hardening pipeline (assembly, normalization, contracts, gates, and repair).

## When it runs
Enable with:
```bash
HARDENING_PIPELINE=true
```

## Pipeline stages
1. **Assemble** — create missing build plumbing for the selected stack.
2. **Normalize** — strip wrappers and ensure “raw code only”.
3. **Repo contract** — verify required files and forbidden patterns.
4. **Acceptance gates** — run install/typecheck/lint/build/boot + health checks.
5. **Patch-only repair** — apply diffs, re-run normalization and gates.

## Reports produced
All reports are written into the exported repo root:
- `ARTIFACT_INGEST_REPORT.md`
- `ASSEMBLY_REPORT.md`
- `NORMALIZATION_REPORT.md`
- `REPO_CONTRACT.json`
- `GATE_REPORT.md` + `gate-logs/`
- `PATCHLOG.md` + `patches/`
- `RUN_DIAGNOSTICS.md` + `run_state_snapshot.json` + `run_config_snapshot.json` + `artifact_tree.txt`

## Normalization behaviors
- Strip markdown code fences from code files.
- Split bundled multi-file blobs into discrete files.
- Relocate orphan/weirdly named files into safe locations.
- Create minimal scaffolding (frontend + backend) when missing.
- Fix invalid `docker-compose.yml` into valid YAML.
- Run lightweight validations (Python compile, package.json checks, YAML parse).

## Contract guidance
Contracts are defined under:
- `apps/unifiedtoolbox.webapp/src/lib/app-factory/contracts/stacks/`

Key fields:
- `requiredFilesAll`
- `codeFileExtensions`
- `forbiddenPatternsByExtension`
- `installCommand`, `buildCommand`, `bootCommands`, `healthChecks`

## Configuration
Common environment variables (defaults shown):
```bash
MAX_REPAIR_CYCLES=3
GATE_TIMEOUT_SECONDS=600
BOOT_TIMEOUT_SECONDS=120
HEALTH_POLL_INTERVAL_MS=1000
APP_FACTORY_FIXER_MODEL=gpt-4o-mini
```

## Related docs
- [Engine status schema](engine-status-schema.md)
- [Orchestration](orchestration.md)
- [Parallel teams](parallel-teams.md)
