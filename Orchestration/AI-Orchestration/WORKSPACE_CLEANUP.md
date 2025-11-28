# Workspace Cleanup Notes

This repository is now the canonical home for the Unified AI Toolbox orchestration stack. Older experiments and exports were moved to `_archive/2024-legacy` under `G:\Development\20_Staging\AI-Toolbox` so the root folder only contains:

- `UnifiedAIToolbox/` (active repo)
- `_archive/2024-legacy/` (OpenAI_Refiner, Orchestration-Legacy, UnifiedAIToolbox.zip)

## Daily Helpers

| Task | Command |
| --- | --- |
| Reset dashboard deps & run dev server | `pwsh -File scripts/Reset-MilestoneDashboard.ps1 -LaunchDashboard` |
| Preview cleanup actions | `pwsh -File scripts/Clean-Workspace.ps1 -DryRun` |
| Force clean dependencies & builds | `pwsh -File scripts/Clean-Workspace.ps1 -PurgeNodeModules -PurgeBuildArtifacts` |

## Suggested Workflow

1. **Write/Update Goals** in `Goals/` (they are now treated as data—new files stay untracked).
2. **Run orchestration** and inspect outputs under `runs/[timestamp]/`.
3. **Sync dashboard data** via `scripts/MilestoneController.ps1` (still copies data into `MilestoneDashboard/public/data/`).
4. **Clean artifacts** whenever the repo feels heavy:
   - Keep only the last N days of `runs/` with `-RunRetentionDays N`.
   - Remove stale `MilestoneDashboard/public/data/synth/*.txt` automatically.
   - Add `-PurgeNodeModules` before committing if you want a totally fresh install.

## Component Status Map

| Path | Status | Notes / Action |
| --- | --- | --- |
| `scripts/`, `Orchestrator/`, `prompts/` | **Active** | Core PowerShell entry points and agent configs. Keep tidy but do not relocate. |
| `MilestoneDashboard/` | **Active, heavy** | React UI + Express API. Requires Node 20+. Run `Reset-MilestoneDashboard.ps1` before working to avoid stale deps. |
| `Goals/`, `runs/` | **Data only** | Ignored by git except for `.gitkeep`. Safe to wipe with `Clean-Workspace.ps1` once artifacts are exported. |
| `AI Orchestration/` | **Legacy snapshot** | Old Windows run exports. See `AI Orchestration/README.md`—remove once you no longer need those `Final_Synthesis.txt` files. |
| `MilestoneDashboard/public/data/synth/` | **Cache** | Now empty except `.gitkeep`. Scripts repopulate as needed. |
| `MilestoneDashboard.html`, `Untitled.png` | **Reference artifacts** | Static report + screenshot used in docs. Keep or move into an `/docs` folder when reorganizing marketing material. |
| `file_manifest-ClonedCopy.json` | **Forensics** | Captured file metadata from the original machine. Keep if you still need provenance; otherwise archive externally. |
| `GeminiAIOrchestrator/` | **Experimental** | Standalone React app that targets Google Gemini. Not wired into the main orchestration flow. Work in this folder only when iterating on Gemini support. |
| `AI-Agent-Communication/` | **Experimental integration** | n8n/Open WebUI connector. Treat as a separate project until you formalize automation around it. |
| `codex-multiagent-swarm/` | **Optional tooling** | VS Code/Codex swarm runner. Copy/paste into repos that need automated review. Not required for MilestoneController runs. |

## Cleanup Backlog

- Decide whether to move `MilestoneDashboard.html`, `Untitled.png`, and `file_manifest-ClonedCopy.json` into a `/docs/archive` folder so they stop cluttering the root.
- Once the `AI Orchestration/` snapshot is no longer needed, delete it or relocate to `_archive/` to eliminate the lingering staged deletions in `git status`.
- Consider adding a quarterly task to prune `GeminiAIOrchestrator/node_modules` and re-run `npm install --legacy-peer-deps` before committing updates to keep the repo lean.
- When adding new experiments, drop a short `README.md` into their folder (similar to `AI Orchestration/README.md`) so future contributors know why it exists and whether it is safe to delete.

## Notes

- `_archive/2024-legacy` is intentionally left outside git. Delete it later if you are sure no legacy scripts are needed.
- The new helper scripts are idempotent and safe to run repeatedly. Always pair `Clean-Workspace.ps1` with `-DryRun` the first time in a new environment.
