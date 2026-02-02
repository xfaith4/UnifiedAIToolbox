# Cost & Environmental Impact Metrics - Grafana Integration

This guide explains how to integrate the Unified AI Toolbox cost and environmental impact metrics with Grafana for advanced visualization and monitoring.

## Overview

The Unified AI Toolbox now tracks detailed metrics for every AI API call, including:

- **Cost** (USD) per model, agent, and orchestration run
- **Energy consumption** (kWh) estimated based on token processing
- **Water usage** (liters) for datacenter cooling
- Token counts (input/output)

These metrics are stored in SQLite tables and can be accessed via:

1. REST API endpoints
2. Prometheus-compatible metrics endpoint
3. Direct database queries

## Architecture

### Database Tables

**orchestration_cost_metrics** - Per-call metrics

```sql
CREATE TABLE orchestration_cost_metrics (
    id INTEGER PRIMARY KEY,
    run_id TEXT,
    timestamp TEXT,
    model_name TEXT,
    agent_name TEXT,
    tokens_input INTEGER,
    tokens_output INTEGER,
    cost_usd REAL,
    kwh_estimated REAL,
    water_liters_estimated REAL,
    project_name TEXT,
    app_name TEXT
);
```

**orchestration_run_aggregates** - Per-run summaries

```sql
CREATE TABLE orchestration_run_aggregates (
    id INTEGER PRIMARY KEY,
    run_id TEXT UNIQUE,
    total_tokens_input INTEGER,
    total_tokens_output INTEGER,
    total_cost_usd REAL,
    total_kwh REAL,
    total_water_liters REAL,
    call_count INTEGER,
    unique_models_json TEXT,
    unique_agents_json TEXT
);
```

## Integration Methods

### Method 1: Prometheus + Grafana (Recommended)

This method uses Prometheus to scrape metrics and Grafana to visualize them.

#### Step 1: Start the Prompt API

```bash
cd apps/UnifiedPromptApp/services/prompt-api
python3 app.py
```

The API will be available at `http://localhost:8000`

#### Step 2: Configure Prometheus

Create a `prometheus.yml` configuration:

```yaml
global:
  scrape_interval: 60s
  evaluation_interval: 60s

scrape_configs:
  - job_name: 'unified_ai_toolbox'
    static_configs:
      - targets: ['localhost:8000']
    metrics_path: '/metrics/cost/prometheus'
    scrape_interval: 60s
```

Start Prometheus:

```bash
docker run -d \
  --name prometheus \
  -p 9090:9090 \
  -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus
```

#### Step 3: Start Grafana

```bash
docker run -d \
  --name grafana \
  -p 3001:3000 \
  grafana/grafana
```

Access Grafana at `http://localhost:3001` (default credentials: admin/admin)

#### Step 4: Add Prometheus Data Source

1. Go to Configuration → Data Sources
2. Add Prometheus
3. URL: `http://prometheus:9090` (or `http://host.docker.internal:9090` on Mac/Windows)
4. Save & Test

#### Step 5: Create Dashboard

Import the sample dashboard (see `grafana-dashboard-sample.json` below) or create your own with these metrics:

- `unified_ai_cost_usd_total{model="gpt-4o-mini"}` - Total cost by model
- `unified_ai_energy_kwh_total{model="gpt-4o-mini"}` - Total energy by model
- `unified_ai_water_liters_total{model="gpt-4o-mini"}` - Total water by model
- `unified_ai_tokens_total{model="gpt-4o-mini"}` - Total tokens by model

### Method 2: SQLite Direct Connection

For simpler setups, connect Grafana directly to the SQLite database.

#### Install SQLite Plugin

```bash
grafana-cli plugins install frser-sqlite-datasource
```

#### Configure Data Source

1. Add SQLite data source in Grafana
2. Point to database: `apps/UnifiedPromptApp/services/prompt-api/workbench.db`
3. Create dashboards with SQL queries

#### Example Queries

**Total cost over time:**

```sql
SELECT
  DATE(timestamp) as time,
  SUM(cost_usd) as cost
FROM orchestration_cost_metrics
WHERE $__timeFilter(timestamp)
GROUP BY DATE(timestamp)
ORDER BY time
```

**Cost by model:**

```sql
SELECT
  model_name as metric,
  SUM(cost_usd) as value
FROM orchestration_cost_metrics
WHERE $__timeFilter(timestamp)
GROUP BY model_name
ORDER BY value DESC
LIMIT 10
```

**Energy consumption by agent:**

```sql
SELECT
  agent_name as metric,
  SUM(kwh_estimated) as value
FROM orchestration_cost_metrics
WHERE agent_name IS NOT NULL
  AND $__timeFilter(timestamp)
GROUP BY agent_name
ORDER BY value DESC
```

### Method 3: REST API + Infinity Plugin

Use Grafana's Infinity plugin to query the REST API endpoints.

#### Install Infinity Plugin

```bash
grafana-cli plugins install yesoreyeram-infinity-datasource
```

#### Configure Data Source

1. Add Infinity data source
2. Configure endpoints:
   - Summary: `http://localhost:8000/metrics/cost/summary`
   - Runs: `http://localhost:8000/metrics/cost/runs`
   - Models: `http://localhost:8000/metrics/cost/models`

3. Add authentication header if needed: `X-Admin-Token: your-token`

## Sample Grafana Dashboard

### Panel Examples

**1. Total Cost (Stat Panel)**

- Query: `unified_ai_cost_usd_total`
- Visualization: Stat
- Unit: currency (USD)

**2. Energy Consumption (Time Series)**

- Query: `rate(unified_ai_energy_kwh_total[5m])`
- Visualization: Time series
- Unit: kWh

**3. Cost by Model (Bar Chart)**

- Query: `topk(5, unified_ai_cost_usd_total)`
- Visualization: Bar chart
- Legend: Model names

**4. Water Usage Trend (Time Series)**

- Query: `increase(unified_ai_water_liters_total[1h])`
- Visualization: Time series
- Unit: liters

### Dashboard JSON Template

Save this to `grafana-dashboard-sample.json`:

```json
{
  "dashboard": {
    "title": "AI Cost & Environmental Impact",
    "panels": [
      {
        "title": "Total Cost (USD)",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(unified_ai_cost_usd_total)"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "currencyUSD"
          }
        }
      },
      {
        "title": "Energy Consumption (kWh)",
        "type": "timeseries",
        "targets": [
          {
            "expr": "sum(rate(unified_ai_energy_kwh_total[5m])) by (model)"
          }
        ]
      },
      {
        "title": "Cost by Model",
        "type": "barchart",
        "targets": [
          {
            "expr": "topk(10, unified_ai_cost_usd_total)"
          }
        ]
      }
    ],
    "refresh": "1m",
    "time": {
      "from": "now-24h",
      "to": "now"
    }
  }
}
```

## Docker Compose Setup

For a complete monitoring stack, use this `docker-compose.yml`:

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    networks:
      - monitoring

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_INSTALL_PLUGINS=frser-sqlite-datasource,yesoreyeram-infinity-datasource
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana-dashboards:/etc/grafana/provisioning/dashboards
    networks:
      - monitoring
    depends_on:
      - prometheus

volumes:
  prometheus_data:
  grafana_data:

networks:
  monitoring:
```

Start the stack:

```bash
docker-compose up -d
```

## Alerting

### Prometheus Alerts

Add to `prometheus.yml`:

```yaml
rule_files:
  - 'alerts.yml'

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['localhost:9093']
```

Create `alerts.yml`:

```yaml
groups:
  - name: ai_cost_alerts
    interval: 5m
    rules:
      - alert: HighAICost
        expr: increase(unified_ai_cost_usd_total[1h]) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High AI API costs detected"
          description: "Cost increased by ${{ $value }} in the last hour"

      - alert: HighEnergyUsage
        expr: increase(unified_ai_energy_kwh_total[1h]) > 5
        for: 5m
        labels:
          severity: info
        annotations:
          summary: "High energy consumption"
          description: "Energy usage: {{ $value }} kWh in the last hour"
```

### Grafana Alerts

Configure alerts directly in Grafana panels:

1. Edit panel → Alert tab
2. Set conditions (e.g., cost > threshold)
3. Configure notification channels (email, Slack, etc.)

## Best Practices

1. **Refresh Rate**: Set Prometheus scrape interval to 60s or higher to avoid overloading the API
2. **Data Retention**: Configure Prometheus retention based on your needs (default: 15 days)
3. **Aggregation**: Use rate() and increase() functions for time-series data
4. **Dashboards**: Create separate dashboards for different audiences (ops, finance, sustainability)
5. **Security**: Protect the metrics endpoint with admin tokens in production

## Troubleshooting

### No Data in Grafana

1. Check Prometheus targets: `http://localhost:9090/targets`
2. Verify metrics endpoint: `http://localhost:8000/metrics/cost/prometheus`
3. Check Prometheus logs: `docker logs prometheus`

### Metrics Not Updating

1. Ensure API calls are being made (check audit table)
2. Verify migrations ran successfully (check `schema_migrations` table)
3. Check API logs for errors

### High Cardinality Issues

If you have many models/agents, consider:

1. Reducing label dimensions
2. Using recording rules in Prometheus
3. Aggregating data before visualization

## Additional Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [PromQL Tutorial](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- Environmental impact methodology: See `config/model_costs.json` for intensity factors

## Support

For issues or questions:

- GitHub Issues: [UnifiedAIToolbox](https://github.com/xfaith4/UnifiedAIToolbox/issues)
- API Documentation: `http://localhost:8000/docs` (when API is running)
