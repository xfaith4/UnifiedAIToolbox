# Repository Orchestration (StartRepoOrchestration)

This flow adds a single end-to-end orchestration entry point that clones a repository, generates an intake report, produces a supervisor taskgraph, executes Codex swarm tasks with conflict awareness, merges results, and opens a pull request. Progress is streamed back to the caller via Server Sent Events (SSE) so the UI can render live updates.

## API surface

### Start a run (SSE)

`POST /orchestrate/repo` with a JSON body:

```json
{
  "repo": "my-org/my-repo",
  "goal": "Add end-to-end orchestration demo",
  "options": {
    "branch": "main",
    "allowed_paths": ["src", "apps/unifiedtoolbox.webapp"],
    "integration_branch": "repo-run-demo",
    "pr_title": "Automated repo orchestration",
    "risk_posture": "standard"
  }
}
```

Responses are streamed as `text/event-stream`. Each `data:` payload includes a `run_id` plus `type` values such as `clone_progress`, `intake_complete`, `planned`, `task_progress` (with Codex `log_line` entries), `merged`, and a `complete` event with the final PR URL. Artifacts are written deterministically under `apps/orchestration-bridge/runs/<run_id>/`.

### Cancel a run

`POST /orchestrate/repo/{run_id}/cancel` immediately signals CodexSwarmService and halts the remaining workflow. Cancellation events are emitted on the SSE stream.

### Read a run summary

`GET /orchestrate/repo/{run_id}` returns the persisted manifest (intake, taskgraph, merge/PR result) along with the final result payload if present.

## Required credentials

- Provide a GitHub token with `repo` scope so clone, branch pushes, and PR creation succeed. The service never logs or persists the raw token—options are stored with the token redacted, and authorization headers are omitted from artifacts.
- The repository remote must allow pushes for the generated integration branch. The merge coordinator pushes the branch before creating the PR.

## Operational notes

- PowerShell (`pwsh` or `powershell`) must be available for Codex swarm execution.
- Git author/committer details default to `repo-orchestrator <repo-orchestrator@example.com>` if the repository does not already configure them.
- The run workspace lives under `apps/orchestration-bridge/runs/<run_id>/` and contains `intake.json`, `taskgraph.json`, task artifacts, merge reports, and the final result JSON.
