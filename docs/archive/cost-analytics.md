# Cost Analytics

Purpose: Describe cost and environmental impact analytics for orchestration runs.

## Overview
Cost analytics track:
- USD cost per call and per run
- Energy (kWh) and water usage (liters)
- Token usage by model and agent

## Data model (SQLite)
Key tables (created via migrations):
- `orchestration_cost_metrics` — per-call metrics
- `orchestration_run_aggregates` — per-run summaries

## Core modules
- `model_costs.py` — pricing and impact calculations
- `cost_metrics.py` — record and aggregate metrics
- `routes_cost_metrics.py` — REST endpoints

## API endpoints
- `GET /metrics/cost/summary`
- `GET /metrics/cost/runs`
- `GET /metrics/cost/models`
- `GET /metrics/cost/prometheus`

## Dashboard
The dashboard shows cost, energy, and water metrics with trend charts.

Start the dashboard:
```bash
cd apps/dashboard
npm run dev
```

## Grafana integration
Three supported paths:
1. **Prometheus** scraping `/metrics/cost/prometheus`
2. **SQLite** direct datasource against `workbench.db`
3. **REST** via Grafana Infinity datasource

## Configuration
Pricing and environmental factors live in `config/model_costs.json`.

Admin token for metrics endpoints:
```bash
PROMPT_API_ADMIN_TOKEN=your-secret-token
```

## Related docs
- [Telemetry](telemetry.md)
- [Workflows](workflows.md)
