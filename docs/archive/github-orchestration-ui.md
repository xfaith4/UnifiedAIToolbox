# GitHub Orchestration UI

Purpose: Describe the artifact contract and the in-app artifact viewer for repo orchestration runs.

## Artifact Contract
Repo orchestration runs standardize outputs under the run directory:

- `REPORT.md` — human-readable summary
- `REPORT.json` — structured summary (`schema_version`, `run_id`, `repo`, `outcome`, `summary`, `verification`, `changes`, `findings`, `blockers`, `artifacts`)
- `PATCH.diff` — optional aggregated diff (if changes exist)
- `EVIDENCE/files.json` — optional evidence index (logs, findings, file lists)
- `verification.md` + `verification.json` — optional verification summaries
- `placeholder-scan.json` — optional placeholder/TODO scan results
- `BLOCKERS.md` — optional blocker summary
- `REPO_GATES_REPORT.json` — optional repo-gates results (if enabled)
- `REPO_GATES_SUMMARY.md` — optional repo-gates summary (if enabled)
- `Final_Synthesis.html` — legacy output when available

Each artifact is referenced in run metadata with:

- `artifactId`
- `fileName`
- `filePath`
- `mimeType`
- `size`
- `createdAt`

### Artifact Index Schema (JSON)
```json
{
  "artifactId": "report-md",
  "fileName": "REPORT.md",
  "filePath": "apps/orchestration-bridge/runs/<runId>/REPORT.md",
  "mimeType": "text/markdown",
  "size": 2048,
  "createdAt": "2026-02-05T20:12:01Z"
}
```

### Report JSON Schema (fields)
```json
{
  "schema_version": "1.0",
  "run_id": "repo-<slug>-<id>",
  "repo": { "url": "owner/repo", "branch": "main", "commit_before": "...", "commit_after": "..." },
  "outcome": "changes_applied | no_changes_by_design | blocked | failed",
  "summary": {
    "headline": "Short human headline",
    "what_happened": ["bullet"],
    "next_actions": ["bullet"]
  },
  "verification": { "commands": [] },
  "changes": { "files_changed": [], "patch_artifact": "PATCH.diff" },
  "findings": {
    "todo_count": 0,
    "placeholder_count": 0,
    "high_risk_items": [],
    "findings_artifact": "placeholder-scan.json"
  },
  "blockers": [],
  "artifacts": {
    "report_md": "REPORT.md",
    "verification_md": "verification.md",
    "verification_json": "verification.json"
  }
}
```

Example: `docs/examples/REPORT.sample.json`

## Artifact Viewer
Route: `/runs/:runId/artifacts/:artifactId`

Tabs:
- **Rendered** — Markdown and JSON are rendered for readability. HTML is treated as a legacy artifact (open externally or raw).
- **Raw** — unmodified content view.
- **Files** — list of all artifacts for the run.

Notes:
- `REPORT.md` is the primary human-readable artifact.
- `REPORT.json` renders with a searchable, collapsible tree view and copy-path buttons.
- HTML previews sanitize scripts and inline event handlers.
- `.log/.txt` artifacts render with text search in both Rendered and Raw views.

### Artifact APIs
- `GET /orchestrate/repo/:runId/artifacts` — list artifact metadata
- `GET /orchestrate/repo/:runId/artifacts/:artifactId` — fetch artifact content
- `GET /orchestrate/repo/:runId/artifacts.zip` — download all artifacts

## GitHub UI v2 Flag
Set `NEXT_PUBLIC_GITHUB_UI_V2=true` to enable the enhanced GitHub Integration dashboard layout and artifact viewer links.

## How to Verify UI V2
1. Start the API and web app.
2. Enable `NEXT_PUBLIC_GITHUB_UI_V2=true`.
3. Run a repo orchestration for a public repo.
4. Open `REPORT.md` and `REPORT.json` via the artifact viewer.
5. Trigger a bad branch to confirm `BRANCH_NOT_FOUND` and suggested fixes.
6. Trigger a non-empty destination folder to confirm `DEST_NOT_EMPTY` and suggested fixes.

## Screenshot
![GitHub orchestration UI](assets/github-orchestration-ui-screenshot.svg)
