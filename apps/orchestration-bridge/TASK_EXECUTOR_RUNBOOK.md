# Task Executor Runbook

## Prerequisites

- Git is installed and configured
- PowerShell/`pwsh` available if you intend to run the real Codex swarm
- TaskGraph located at `apps/orchestration-bridge/runs/<run_id>/taskgraph.json`
- Repository cloned locally (used as the source worktree)

## Steps

1. **Prepare paths**

   ```bash
   export RUN_ID=demo-run
   export REPO_PATH=/path/to/repo
   ```

2. **Generate a TaskGraph (if not already)**
   - Use the supervisor planner endpoint:

   ```bash
   curl -X POST http://localhost:8000/github/supervisor/taskgraph \
     -H 'Content-Type: application/json' \
     -d '{"run_id":"'$RUN_ID'","user_goal":"Add feature","constraints":{"allowed_paths":["src"],"max_parallel":2,"risk_posture":"standard"}}'
   ```

3. **Run the executor**

   ```bash
   python - <<'PY'
   from pathlib import Path
   from github_integration.task_executor import TaskExecutor

   executor = TaskExecutor()
   result = executor.execute_taskgraph(
       repo_path=Path("$REPO_PATH"),
       run_id="$RUN_ID",
   )
   print(result)
   PY
   ```

4. **Inspect artifacts**
   - `apps/orchestration-bridge/runs/$RUN_ID/tasks/<task_id>/task_run.log`
   - `.../task_findings.json`
   - `.../task_diff.patch`
   - `.../scope_violation.json` (only if scope was violated)

5. **Parallel vs conflict group**
   - Tasks in the same `conflict_group` run serially.
   - Different groups may run in parallel (current executor runs sequentially but enforces group exclusivity to prevent overlap).

6. **Validation example**
   - Prepare two tasks: one with `conflict_group: build` and another with `conflict_group: test`.
   - Executor will process them in order; adjust future enhancements to parallelize non-conflicting groups if desired.
