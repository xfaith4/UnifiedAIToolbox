# Prompt Library (React + Vite)

An opinionated workspace for capturing, searching, and testing AI prompts. The dashboard now provides a unified interface for all toolbox components including prompts, agents, orchestration, and service monitoring.

## Highlights
- **Dashboard Home** - Service health monitoring showing status of all UnifiedAIToolbox services (Prompt API, Orchestration Bridge, Codex Swarm, Sensor Monitor, Dataset Explorer).
- **Prompt Library** - Import/export prompt collections, quick capture, deep editing, and provider payload previews (OpenAI, Anthropic, Google Gemini, Ollama).
- **Agent Library** - Curate orchestrator-ready agents with missions, triggers, playbooks, and handoff definitions.
- **Orchestrator** - Supervisor workspace to assemble tasks, pick agents/prompts, and download ready-to-run manifests for the automation bridge.
- **Dataset Explorer** - Upload and analyze datasets (CSV, JSON, Excel) for use in prompts and agents with prompt-driven exploration.
- **Sensor Monitor** - Track sensor rewards and telemetry data, view runbooks, and monitor operational health metrics.
- **GitHub Integration** - Browse repositories and manage GitHub workflows.
- **Genesys Integration** - Monitor Genesys Cloud metrics, divisions, and call quality data.
- Live render panel that shows resolved templates and provider-ready payloads when `VITE_API_BASE` points at the Prompt API (default `http://localhost:8000`).

## Getting Started
```bash
npm install
npm run launch          # checks from PORT/VITE_PORT/5173 and falls back to a random free port
```

`npm run launch` searches for an open port (starting with `PORT`, `VITE_PORT`, or `5173`) before starting Vite, preventing "address already in use" errors. Pass additional Vite flags after the script (e.g. `npm run launch -- --open`).

Prefer a fixed port? You can still use `npm run dev`, or set `PORT=3000 npm run launch`.

## Dashboard Pages

### Home Dashboard
- **Service Health Monitoring** - Real-time status of all UnifiedAIToolbox services (Prompt API, Orchestration Bridge, Codex Swarm, Sensor Monitor, Dataset Explorer).
- **Quick Actions** - Fast access to common tasks like creating prompts, running AI Refiner, uploading datasets, and executing Codex swarm reviews.
- The dashboard home provides a single-pane-of-glass view for all toolbox operations.

### Dataset Explorer
- Upload datasets (CSV, JSON, Excel, text files) for use in prompt-driven analysis.
- Analyze uploaded datasets with prompts from the library.
- View dataset metadata including size, upload date, and processing status.
- Integrates with the Data Exploration Service (`apps/data-exploration`) when available.

### Sensor Monitor
- Track sensor rewards and telemetry data in real-time.
- View sensor status cards showing reward scores, trends, and health indicators.
- Acknowledge sensors and trigger follow-up actions.
- Access runbooks for detailed sensor analysis.
- Integrates with the Sensor Monitor Service (`apps/sensor-monitor`) when available.

### Integration Tools
- **GitHub** - Browse repositories with optional personal access token for private repos.
- **Genesys** - Monitor Genesys Cloud metrics, divisions, and call quality data (requires proxy configuration).

## Prompt JSON Format

Upload a `.json` file that contains an array of prompt objects. Each object can use the simplified format below or the full schema produced by the editor.

### Simplified entry
```json
[
  {
    "title": "Sales Discovery Opener",
    "category": "Sales",
    "context": "Warm up new prospects before discovery.",
    "prompt": "You are a friendly SDR. Ask three qualifying questions tailored to {{industry}}.",
    "tags": ["sales", "discovery"],
    "variables": [
      { "name": "industry", "type": "string", "required": true }
    ]
  }
]
```

**Required**
- `prompt` – the template/body of the prompt.

**Recommended**
- `title` – label shown in the library.
- `category` – primary classification (also used for filtering).
- `context` – usage notes shown in the list/detail view.

**Optional**
- `tags` – additional labels.
- `variables` – array of variable definitions with `name`, optional `label`, `type`, `default`, `required`.
- `style`, `role`, `fewShot`, `stop`, `outputFormat`, `temperature`, `top_p`, `id`, timestamps – match the advanced editor fields.

Entries missing `prompt` are skipped during import. Existing prompts with the same `id` are overwritten; others are added with fresh IDs.

## Managing Prompts
- Use **Quick add prompt** on the Prompt Library page for single entries; it drops you directly into the editor for further tweaks.
- Edit prompts inline, define variables, few-shot examples, output structure, and provider-specific controls.
- Search box indexes title, category, context, tags, and the template text itself; combine with the category dropdown to narrow results.
- Export at any time to back up or share (`Export` button).
- Data syncs through the Prompt API when `VITE_API_BASE` is set and gracefully falls back to browser `localStorage` when the service is unavailable.
- Use the **Render via API** button in the render panel to call `POST /prompts/render` with the variables you’ve provided and preview the structured JSON blocks generated by the backend.

## Agent Instructions
- Navigate to **Agent Library** to curate agents (missions, triggers, playbooks, tooling notes) destined for the orchestrator.
- New agents default to local storage; set `VITE_API_BASE` to sync with the Prompt API once `/agents` endpoints are available.
- Import/export the full collection via JSON to collaborate with other teams (`agent-library.starter.json` shows the expected shape).

## Orchestrator Supervisor
- Visit **Orchestrator** to assemble a mission: define objectives, pick a priority/due date, and choose the agents + prompts that should participate.
- The Supervisor preview explains how each agent will be deployed (assignments, handoffs) and which prompts need coverage.
- Use **Send to Orchestrator** to POST the manifest to the Prompt API (`/orchestrator/tasks`). When `VITE_API_BASE` isn’t set the button gracefully falls back to downloading the JSON so you can hand it off manually.
- A dedicated **Download JSON** button always exports the manifest if you want to archive or review it before submission.

## Migration Tasks
1. Copy the existing React/Vite codebase into this directory (preserve `npm run launch` behavior). ✅
2. Replace the local storage store with API-aware data hooks so `GET /prompts` and `POST /prompts:sync` power the UI (fallback supported). ✅
3. Add schema-aware forms so YAML fields such as `risk_tier`, `owners`, and `review_policy` are editable. ⏳
4. Embed provider payload previews (OpenAI, Anthropic, Gemini, Ollama) as documented in `PromptLibrary/README.md:5`. ✅
5. Wire refine + orchestration actions to the Prompt API once those endpoints exist. ⏳

## Scripts
- `npm run launch` – start the dev server after finding an open port.
- `npm run dev` – start Vite on the default port (no port probing).
- `npm run build` – production build.
- `npm run preview` – preview the built bundle.
- `npm run lint` – TypeScript-aware ESLint rules.
- `npm run format` – Prettier across the repo.

## Environment Notes
- Optional `.env` / `.env.local` can override host/port (`VITE_PORT`, `VITE_HOST`) and configure API targets (e.g. `VITE_API_BASE`, `VITE_GITHUB_TOKEN`). The default `.env.example` points `VITE_API_BASE` at `http://localhost:8000` so launching the toolbox starts a compatible backend immediately.
- Tailwind, routing, Recharts demo components, and Zustand store wiring remain available from the original starter template for broader dashboard needs.
