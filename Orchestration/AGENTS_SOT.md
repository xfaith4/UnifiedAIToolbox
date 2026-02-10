# Agent Source-of-Truth Map

Last verified: 2026-02-10

## Canonical Registry

- Canonical file: `Orchestration/agents/agent-library.json`
- This is the only human-edited agent definition source (prompts, routing metadata, and `io_contract` schemas).

## Loader Contract (Safety Rail)

- PowerShell canonical loader: `Orchestration/scripts/AgentRoster.psm1` (`Get-AgentRoster`)
  - `-Mode full`: returns full canonical agent objects.
  - `-Mode thin`: returns deterministic `name`/`role`/`prompt` roster for legacy-style callers.
- Python canonical loader wrapper: `scripts/swarms/agent_roster.py` (`get_agent_roster`)
  - `mode="full"` or `mode="thin"`.
  - Default canonical path: `Orchestration/agents/agent-library.json`.
  - Legacy `{ "Agents": [...] }` format is accepted only for compatibility input.

## Runtime Load Paths (Current State)

- Canonical contract-aware orchestrator:
  - `Orchestration/scripts/MilestoneController.ps1` loads `Orchestration/agents/agent-library.json`.
  - `apps/UnifiedPromptApp/services/prompt-api/MilestoneController.ps1` loads the same canonical registry.
- Legacy/hybrid orchestration:
  - `Orchestration/scripts/POF.ps1` now defaults to canonical via `Get-AgentRoster -Mode thin`.
  - `POF.ps1` can still use legacy export only when explicitly requested (`-UseLegacyAgentConfig` or explicit `-AgentConfigPath`).
- Swarms runtime:
  - `scripts/swarms/toolbox_runner.py` now defaults to canonical via `agent_roster.py`.
  - `Orchestration/engine/codex-multiagent-swarm/Orchestrate-Codex.ps1` and `apps/orchestration-bridge/github_integration/codex_service.py` inherit that canonical default.

## Derived / Legacy Files

- `Orchestration/prompts/Agents.json`
  - Generated thin export from canonical.
  - Contains `GeneratedNotice`, `GeneratedFrom`, and `GeneratedBy` metadata.
- `Orchestration/prompts/Agents2.json`
  - Generated legacy export from canonical.
  - Marked with `LegacyExport: true`.
- `Agents.json` and `Agents2.json` are not hand-edited.

## Generation and Drift Enforcement

- Generate exports:
  - `pwsh ./Orchestration/scripts/Generate-AgentExports.ps1`
- Check drift (CI/local):
  - `pwsh ./Orchestration/scripts/Check-AgentExports.ps1`
- CI hook:
  - `Orchestration/.github/workflows/run-orchestration.yml` runs the drift check and fails when exports diverge from canonical.

## Contract Enforcement

- Implemented in:
  - `Orchestration/scripts/MilestoneController.ps1`
  - `apps/UnifiedPromptApp/services/prompt-api/MilestoneController.ps1`
  - `Orchestration/scripts/POF.ps1`
- Behavior:
  1. Parse agent output as JSON.
  2. Validate against `io_contract.output_schema` (JSON schema).
  3. If invalid, perform one automatic repair retry with schema + validation errors.
  4. If still invalid, fail fast and write structured artifact:
     - `artifacts/contract_failures/<agent>.<timestamp>.json`
     - Includes run id, schema, validation errors, raw output, and repaired output (if present).

## Pipeline Prompt File Status

- `Orchestration/orchestration_pipeline.prompt.yml` is explicitly marked `mode: eval_only`.
- Runtime orchestration does not load this file; runtime routing is from job types/pipeline configs plus canonical registry.

## How To Modify Agents Safely

1. Edit only `Orchestration/agents/agent-library.json`.
2. Regenerate derived exports:
   - `pwsh ./Orchestration/scripts/Generate-AgentExports.ps1`
3. Run drift gate:
   - `pwsh ./Orchestration/scripts/Check-AgentExports.ps1`
4. Run orchestration checks/tests used by this repo before merge.

## How To Verify

1. `pwsh ./Orchestration/scripts/Generate-AgentExports.ps1`
2. `pwsh ./Orchestration/scripts/Check-AgentExports.ps1`
3. `python scripts/swarms/toolbox_runner.py --help`
4. `python -m pytest tests/test_orchestration.py -q` (from `apps/UnifiedPromptApp/services/prompt-api`)
5. `python -m pytest tests/test_task_executor_summary_events.py -q` (from `apps/orchestration-bridge`)
