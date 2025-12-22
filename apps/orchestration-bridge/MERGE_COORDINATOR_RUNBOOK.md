# Merge Coordinator Runbook

## Purpose
Integrate completed task branches into an integration branch, run per-task validations, and open a PR.

## Prerequisites
- Repository cloned locally and up to date with remote
- `taskgraph.json` present at `apps/orchestration-bridge/runs/<run_id>/taskgraph.json` with `branch` set for each task
- `GITHUB_TOKEN` exported (PAT with repo access) if creating a PR

## Steps
1. **Set environment**
   ```bash
   export RUN_ID=demo-run
   export REPO_PATH=/path/to/repo
   export OWNER=your-org
   export NAME=your-repo
   ```

2. **Inspect task graph**
   ```bash
   cat apps/orchestration-bridge/runs/$RUN_ID/taskgraph.json | jq '.tasks[] | {id, branch, validation}'
   ```

3. **Run merge coordinator**
   ```bash
   python - <<'PY'
   from pathlib import Path
   from github_integration.merge_coordinator import MergeCoordinator

   mc = MergeCoordinator()
   result = mc.merge_taskgraph(
       repo_path=Path("$REPO_PATH"),
       run_id="$RUN_ID",
       repo_owner="$OWNER",
       repo_name="$NAME",
       base_branch=None,  # auto-detects origin/HEAD fallback to main
   )
   print(result)
   PY
   ```

4. **Review artifacts**
   - Validation: `apps/orchestration-bridge/runs/$RUN_ID/merge/<task_id>_validation.json`
   - Conflicts: `.../<task_id>_conflict.json` (only on conflict)

5. **PR creation**
   - On success, result includes `pr.pr_url`. Body lists merged tasks, validation results, and artifact path.

6. **Conflict scenario**
   - If conflict occurs, integration stops. Inspect conflict JSON for hints, resolve manually or re-run after fixing.

## Parallel/Conflict Groups
- Merge order follows taskgraph order. Conflict groups are respected during execution (handled earlier by executor). Merge coordinator assumes branches are ready to merge.
