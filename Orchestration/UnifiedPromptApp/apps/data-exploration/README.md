# Data Exploration Service

Brings the HTMX/PowerShell data exploration workflow into the unified toolbox as a FastAPI worker so analysts can upload datasets, trigger prompt-driven analysis, and capture runbooks that flow through the Prompt API + orchestration dashboards.

## Capabilities

- `POST /datasets/upload` – Accepts file uploads (CSV, JSON, Excel, etc.), stores them under `apps/data-exploration/data/uploads/`, and tracks metadata (`datasets/index.json`).
- `GET /datasets` – Lists available datasets with metadata (file name, size, description, timestamp).
- `POST /datasets/{id}/analyze` – Calls the Prompt API to render an analysis prompt, generates a runbook (summary, references, reasoning, next steps), saves it to `data/runbooks/`, and logs the review via `POST /prompts/{id}/reviews`.
- `GET /health` – Simple readiness probe for launchers/CI.

This service does not call an LLM directly; it orchestrates Prompt API render/review flows so the resulting runbooks appear instantly in Prompt Hub and Prompt Workbench dashboards.

## Running Locally

```bash
cd UnifiedPromptApp/apps/data-exploration
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# (Optional) configure env overrides
set DATA_EXP_PROMPT_API_BASE=http://localhost:5050

uvicorn app:app --reload --port 8100
```

Use `http://localhost:8100/datasets/upload` (via `curl` or the Swagger UI at `/docs`) to upload files. Then call `POST /datasets/{id}/analyze` with a `prompt_id` and optional `variables` to capture runbooks. Prompt Hub will show the new review entry because the service posts the runbook to `services/prompt-api`.

## Configuration

Environment variables (prefix `DATA_EXP_`):

| Variable | Default | Description |
| --- | --- | --- |
| `DATA_EXP_DATA_DIR` | `apps/data-exploration/data` | Root directory for uploads, metadata, and runbooks. |
| `DATA_EXP_PROMPT_API_BASE` | `http://localhost:5050` | Base URL for `services/prompt-api`. |

An `.env` file in this folder can override the same settings.

## Next Steps

1. Port the HTMX UI from `DataExtraction/Start-DataExplorationForm.v3-HTMX.ps1` into a React page under Prompt Hub that calls these endpoints.
2. Add dataset metadata fields (columns, row counts, sample stats) during upload so dashboards can show more context.
3. Trigger automated explorations via the orchestration bridge (e.g., nightly dataset sweeps tied to critical prompts).
