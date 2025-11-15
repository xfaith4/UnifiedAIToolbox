# Prompt Workbench (Ops Console)

Successor to the FastAPI + Streamlit tooling under `Prompt Library Projects/PromptService`. This app now talks directly to `services/prompt-api`, which means every render or generation flows through the canonical prompt registry, audit log, and refiner entry points.

## What's Included

- `streamlit_app.py` – Streamlit UI for business users to browse canonical prompts, preview rendered blocks via `POST /prompts/render`, and execute `/api/generate` calls with contextual metadata.
- `requirements.txt` – Minimal dependencies (`streamlit`, `requests`). Install into a virtual environment or let `LaunchUnifiedToolbox.ps1` bootstrap it.
- Power BI connector + documentation (`powerbi/AIPromptGenerate.pq`) still live under the legacy PromptService folder and will migrate here in a follow-up.

## Running the Workbench

```powershell
cd UnifiedPromptApp/apps/prompt-workbench
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Set the Prompt API base (defaults to http://localhost:5050)
$env:PROMPT_API_BASE = "http://localhost:5050"

streamlit run streamlit_app.py
```

The UI automatically fetches prompts from `GET /prompts`. If the API is offline it falls back to the starter JSON shipped with Prompt Hub so you can still preview the layout (actions that call the API remain disabled). Variables are rendered dynamically based on the schema exposed in each prompt, and render/generate buttons provide detailed success/error feedback plus the JSON payload returned by the backend.

### Key Features

- **Prompt catalog** – Filterable selector populated straight from the registry payloads.
- **Dynamic variable editors** – Text inputs, number fields, and checkboxes inferred from the prompt schema.
- **Render preview** – Calls `/prompts/render` to show the structured block output without triggering an LLM run.
- **Live generation** – Posts to `/api/generate` with role/task/context metadata so analysts can capture gold responses inside the shared audit log.
- **Offline fallback** – When `PROMPT_API_BASE` is unset or unreachable the tool still loads starter prompts for demo purposes while disabling API buttons.

## Next Steps

1. Port the original Power BI connector + docs from `Prompt Library Projects/PromptService/powerbi`.
2. Link the Streamlit actions to reviewer telemetry by hitting `/prompts/{id}/reviews` after analysts approve a run.
3. Centralize metrics dashboards so Streamlit can display `/metrics` alongside the main UI.
