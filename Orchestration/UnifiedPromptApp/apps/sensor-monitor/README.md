# Sensor Monitor Service

Modern take on the Sensor-Reward framework that continuously evaluates sensor profiles and logs normalized “reward” scores back into Prompt API runbooks so Prompt Hub dashboards can highlight operational risks automatically.

## How it Works

- Profiles defined in `sensor_profiles/*.json` describe each sensor (command to run, normalization range, whether “lower is better”, target prompt to annotate).
- `monitor.py` executes each profile on a configurable interval, normalizes the result to 0..1, writes a runbook entry under `data/runbooks/`, and POSTs the runbook to `services/prompt-api` via `/prompts/{id}/reviews`.
- Threshold breaches show up in Prompt Hub / Orchestrator dashboards because the review status flips to `needs_changes` when the reward drops below the configured `threshold`.

## Running Locally

```powershell
cd UnifiedPromptApp/apps/sensor-monitor
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

$env:SENSOR_PROMPT_API_BASE = "http://localhost:5050"
python monitor.py
```

Each sample profile uses a simple Python command to simulate measurements; replace the `command` array with real scripts (PowerShell, bash, custom executables) to capture production metrics (latency probes, budget monitors, etc.).

## Configuration

Env vars (prefix `SENSOR_`):

| Variable | Default | Description |
| --- | --- | --- |
| `SENSOR_PROFILE_PATH` | `sensor_profiles/default.json` | JSON file containing sensor definitions (array). |
| `SENSOR_DATA_DIR` | `./data` | Root directory for runbook artifacts. |
| `SENSOR_PROMPT_API_BASE` | `http://localhost:5050` | Prompt API base URL. |
| `SENSOR_POLL_INTERVAL` | `300` | Seconds between polling loops. |

Profile fields:

```jsonc
{
  "name": "PromptLatency",
  "command": ["pwsh", "-Command", "./scripts/Test-Latency.ps1"],
  "min": 0.5,
  "max": 3.0,
  "invert": true,
  "prompt_id": "operations.prompt.latency",
  "threshold": 0.7
}
```

- `command`: array executed by `subprocess.run`.
- `min`/`max`: normalization range.
- `invert`: set to true when lower values are better (latency, error rates).
- `prompt_id`: Prompt registry entry to annotate when the sensor runs.
- `threshold`: minimum acceptable reward; below this the runbook is marked `needs_changes`.

## Next Steps

1. Call real sensors (PowerShell functions from `Sensor-Reward-Framework.ps1`, system APIs, monitoring endpoints) instead of the placeholder Python snippets.
2. Expose a REST interface (FastAPI) for on-demand sensor queries and to publish aggregated metrics.
3. Show sensor cards + runbook summaries in Prompt Hub dashboards.
