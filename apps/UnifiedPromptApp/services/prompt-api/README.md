# Prompt API Service

Unified backend that serves prompts to the Prompt Hub React app, the Streamlit Workbench, and CLI helpers. It fronts the canonical `prompt-registry`, provides render/refiner operations, and keeps the legacy YAML template runtime online until every client migrates.

## Capabilities

- **Prompt Registry Bridge** - `GET /prompts` streams canonical payloads directly from `packages/prompt-registry` (falls back to the cached JSON file under `data/prompt-library.json`).
- **Sync Endpoint** - `POST /prompts:sync` accepts simplified JSON from the React app and persists it locally as a temporary cache.
- **Render + Refiner** – `POST /prompts/render` resolves block text with user variables, while `POST /refiner/run` writes manifests and optionally invokes the PowerShell refiner worker.
- **Agent Instruction Store** – `/agents` + `/agents:sync` expose the curated agent instruction catalog so orchestrator workers can share the same metadata as the UI.
- **Template Runtime** - Existing `/api/templates/*` + `/api/generate` routes execute legacy YAML templates with cache/audit hooks so nothing breaks while consolidation continues.
- **Registry-first Execution** - `/api/generate` now prefers canonical prompts from `prompt-registry` before falling back to the local YAML templates directory, ensuring every surface reuses the same schema.
- **Audit & Caching** – SQLite tables (`workbench.db`) capture every execution with token counts, payload hashes, and cache hits.
- **AI Provider Integration** - Unified abstraction layer for OpenAI, Anthropic (Claude), and other AI providers with retry logic, rate limiting, and cost tracking.
- **Cost Tracking** - Track API usage and costs per provider/model with budget alerts and detailed breakdowns via `/admin/costs/*` endpoints.

## Getting Started

```powershell
cd UnifiedPromptApp/services/prompt-api
python -m venv .venv
.\.venv\Scripts\Activate.ps1                    # or source .venv/bin/activate
pip install -r requirements.txt                 # FastAPI runtime deps
pip install -e ..\..\packages\prompt-registry   # registry helpers (editable install)

# Optional .env (PROMPT_API_* takes precedence)
# PROMPT_API_OPENAI_API_KEY=sk-***
# PROMPT_API_OPENAI_MODEL=gpt-4o-mini

uvicorn app:app --reload --host 0.0.0.0 --port 8000

> Tip: The root `Start-Toolbox.ps1` launcher (choose option 2 for API-only or option 1 for the full stack) sets `PROMPT_API_PORT=8000` and runs this exact command, so you can start all services from the workspace root without remembering the manual steps.
```

Point Prompt Hub at `http://localhost:8000` via `VITE_API_BASE`. Useful endpoints once the server is running:

- `GET /prompts` / `GET /prompts/{id}` – canonical prompt payloads that match the UI contract.
- `POST /prompts/render` – render prompt blocks with the supplied variable bag.
- `POST /refiner/run` – queue a review manifest and optionally invoke the PowerShell refiner (`apps/orchestration-bridge/OpenAI_Refiner.ps1`).
- `POST /prompts/{id}/reviews` - append review outcomes (status, reviewers, notes) directly into the prompt's `telemetry.audit.runs`.
- `GET /agents` / `POST /agents:sync` - house agent instructions (missions, triggers, tooling) alongside prompts so orchestrator workers and the UI stay in sync.
- `POST /orchestrator/tasks` - accept supervisor manifests and enqueue them for automation; use `GET /orchestrator/tasks` to inspect the queue and `PATCH /orchestrator/tasks/{id}` to update status/notes as runs progress.
- `POST /prompts:sync` – persist edited prompts to `data/prompt-library.json` for offline use.
- `POST /api/generate` – legacy YAML execution with caching + audit logging for downstream BI tooling.
- `GET /admin/costs/summary` – get total AI API cost summary with optional date/provider filters.
- `GET /admin/costs/breakdown` – detailed cost breakdown by provider, model, and daily usage.
- `GET /admin/costs/budget` – check budget status and get alerts when approaching limits.

## Health & launch checklist

- Visit `http://localhost:8000/health` once the service is running to confirm the FastAPI health check is healthy; the root launcher polls this path before stating that the API is ready.
- If you need to fire up the API manually, rerun the commands above in `apps/UnifiedPromptApp/services/prompt-api`. On Windows, `Start-Toolbox.ps1` or `Start-PromptWorkbench.ps1` handles the virtual environment, dependency install, and `uvicorn` invocation for you.
- The same health check is exercised by `apps/UnifiedPromptApp/services/prompt-api/tests/test_prompts.py`, so running `pytest` from that directory ensures the endpoint is reachable before you point other services at it.

## AI Provider Configuration

The service supports multiple AI providers with automatic retry, rate limiting, and cost tracking:

### Supported Providers

1. **OpenAI** (GPT-4, GPT-3.5-turbo, etc.)
   - Set `OPENAI_API_KEY` environment variable
   - Supports all OpenAI chat completion models
   - Token counting via tiktoken
   - Automatic cost calculation based on current pricing

2. **Anthropic** (Claude 3 models)
   - Set `ANTHROPIC_API_KEY` environment variable
   - Supports Claude 3 Opus, Sonnet, and Haiku
   - Streaming support
   - Automatic cost calculation

3. **Mock Provider** (for testing)
   - No API key required
   - Simulates responses without API calls
   - Zero cost, useful for development

### Usage in Python

```python
from providers import OpenAIProvider, AnthropicProvider, Message, ModelRole

# Initialize provider
provider = OpenAIProvider(api_key="your-api-key")

# Create messages
messages = [
    Message(role=ModelRole.SYSTEM, content="You are a helpful assistant."),
    Message(role=ModelRole.USER, content="Hello!")
]

# Generate response
response = await provider.generate(
    messages=messages,
    model="gpt-4o-mini",
    max_tokens=1024,
    temperature=0.2
)

print(f"Response: {response.text}")
print(f"Cost: ${response.cost:.4f}")
print(f"Tokens: {response.tokens_used}")
```

### Usage in PowerShell

The `Invoke-Model` function in `modules/PromptLibrary` now supports both providers:

```powershell
# OpenAI
$result = Invoke-Model -Provider openai -Model gpt-4o-mini `
    -System "You are a helpful assistant" -User "Hello!" `
    -MaxTokens 1024 -Temperature 0.2

# Anthropic (Claude)
$result = Invoke-Model -Provider anthropic -Model claude-3-haiku-20240307 `
    -System "You are a helpful assistant" -User "Hello!" `
    -MaxTokens 1024 -Temperature 0.2

Write-Host $result.text
```

### Cost Tracking

All API calls are automatically logged to the cost tracking database. Access cost reports via:

- `/admin/costs/summary` - Overall cost summary
- `/admin/costs/breakdown` - Breakdown by provider and model
- `/admin/costs/budget?budget_amount=100&period_days=30` - Budget monitoring

Cost tracking requires an admin token when `PROMPT_API_ADMIN_TOKEN` is set.

## Developer Notes

- Configuration is powered by `ServiceSettings` (Pydantic). Any `PROMPT_API_*` env var overrides defaults (e.g., `PROMPT_API_DB_PATH`, `PROMPT_API_DATA_DIR`). Plain `OPENAI_API_KEY` is still honored for backwards compatibility with legacy scripts.
- Run the service tests from this directory with `PYTHONPATH=. pytest`. They cover health checks plus registry-backed prompt lookups.
- Export the OpenAPI contract via `python scripts/export_openapi.py`; `docs/openapi.json` is versioned so downstream consumers (Prompt Hub, Power BI) can diff schema changes without running the server.
- Keep both `prompt-registry` and this service installed in editable mode during development so code changes are immediately reflected.
- The provider abstraction layer includes retry logic with exponential backoff, rate limiting, and comprehensive error handling for production use.
