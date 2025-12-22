# Orchestration Bridge Workflow Review

## Issues Found

### Critical
- None blocking the workflow detected.

### High
- GitHub client creation and retry behavior were inconsistent across clone/PR/merge flows, risking divergent auth headers and rate-limit handling. Consolidated on shared helpers with rate-limit aware retries. 【shared/github_core.py】
- Findings and metadata writes were non-atomic, risking corrupted artifacts on reruns or cancellation. Hardened Codex run and intake writes. 【github_integration/codex_service.py】【github_integration/repo_intake_service.py】

### Medium
- Clone failures could surface URLs containing embedded tokens. Added redaction before surfacing errors. 【github_integration/clone_service.py】
- PR service did not share the centralized GitHub client logic or retries, creating potential drift from clone/list behaviors. Now aligned with shared helpers. 【github_integration/pr_service.py】
- Log and artifact content from Codex runs could capture sensitive strings from downstream tools. Added redaction when persisting findings. 【github_integration/codex_service.py】

### Low
- Validation/reporting documentation for the workflow was missing. Added a deterministic validation recipe in this review.

## Recommended Future Fixes
- Expand redaction to streaming log relays and git command stderr outputs to guarantee no credential leakage from external tools.
- Add workspace locking to prevent concurrent task executions from sharing the same repo path when conflict groups overlap.
- Introduce structured error codes (e.g., rate_limit_exceeded, auth_missing) for UI consumption in all GitHub service methods.
- Extend validation to cover merge_coordinator conflict report rendering and to ensure integration branch cleanup after PR creation.

## Changes Made
- Centralized GitHub client initialization and rate-limit aware retries via `create_github_client` and `github_call_with_backoff`, and applied them to clone and PR services. 【shared/github_core.py】【github_integration/clone_service.py】【github_integration/pr_service.py】
- Added shared redaction utilities and applied them to clone error surfaces and Codex findings persistence. 【shared/security.py】【github_integration/clone_service.py】【github_integration/codex_service.py】
- Hardened artifact writes for Codex runs and intake reports with atomic JSON writes to preserve idempotency. 【github_integration/codex_service.py】【github_integration/repo_intake_service.py】

## What Remains and Why
- Full end-to-end automated tests for the orchestration workflow are still absent; the current scope adds manual validation guidance but avoids large refactors.
- Git command retries and remote cleanup are unchanged to keep changes minimal; consider adding bounded retries and post-run cleanup helpers in a follow-up.
- The Codex PowerShell script execution path is left as-is; deeper sandboxing would require cross-language changes beyond this hardening pass.

## Validation (happy-path checklist)
1. **List repositories (private included)**  
   ```bash
   GITHUB_TOKEN=... python - <<'PY'
   from github_integration.clone_service import GitHubCloneService
   service = GitHubCloneService()
   repos = service.list_accessible_repos(limit=5)
   print([r["full_name"] for r in repos])
   PY
   ```
2. **Generate intake report**  
   ```bash
   GITHUB_TOKEN=... python - <<'PY'
   from github_integration.repo_intake_service import RepoIntakeService
   intake = RepoIntakeService().run_intake(repo_url="owner/repo", run_id="demo-run")
   print(intake["artifacts"])
   PY
   ```
3. **Plan taskgraph**  
   ```bash
   python - <<'PY'
   import json
   from github_integration.supervisor_planner import SupervisorPlanner
   intake = json.load(open("apps/orchestration-bridge/runs/demo-run/intake.json"))
   tg = SupervisorPlanner().generate_taskgraph(
       run_id="demo-run",
       intake=intake,
       user_goal="Implement requested feature",
       constraints={"allowed_paths": ["."]},
   )
   print(tg["artifacts"])
   PY
   ```
4. **Execute tasks (one succeeds, one blocked by scope)**  
   ```bash
   python - <<'PY'
   import asyncio, json
   from pathlib import Path
   from github_integration.task_executor import TaskExecutor, TaskExecutionError
   repo_path = Path("apps/orchestration-bridge/github_clone/sample")  # replace with cloned repo
   executor = TaskExecutor()
   try:
       result = executor.execute_taskgraph(repo_path=repo_path, run_id="demo-run")
       print(json.dumps(result, indent=2))
   except TaskExecutionError as exc:
       print(f"Execution stopped: {exc}")
   PY
   ```
   Ensure `task_results.json` shows at least one completed task and any scope violations reported.
5. **Merge + PR creation**  
   ```bash
   GITHUB_TOKEN=... python - <<'PY'
   from pathlib import Path
   from github_integration.merge_coordinator import MergeCoordinator
   mc = MergeCoordinator()
   result = mc.merge_taskgraph(
       repo_path=Path("apps/orchestration-bridge/github_clone/sample"),  # cloned repo
       run_id="demo-run",
       repo_owner="owner",
       repo_name="repo",
       push_integration=False,  # set True to push
   )
   print(result)
   PY
   ```
   Verify `status` is `merged` or conflict details are stored under `runs/demo-run/merge/`.
