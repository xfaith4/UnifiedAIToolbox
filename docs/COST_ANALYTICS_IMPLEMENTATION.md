# Cost & Environmental Impact Analytics - Implementation Summary

## Overview

This document summarizes the implementation of comprehensive cost and environmental impact analytics for the Unified AI Toolbox. The feature tracks USD cost, energy consumption (kWh), and water usage (liters) for every AI API call across all orchestration runs.

**Status**: ✅ **COMPLETE** - All phases implemented, tested, and ready for production use.

## Architecture

### Database Schema

Two new tables were added via migrations #4 and #5:

#### 1. orchestration_cost_metrics (Per-Call Metrics)
```sql
CREATE TABLE orchestration_cost_metrics (
    id INTEGER PRIMARY KEY,
    run_id TEXT,
    timestamp TEXT NOT NULL,
    model_name TEXT NOT NULL,
    agent_name TEXT,
    tokens_input INTEGER,
    tokens_output INTEGER,
    cost_usd REAL,
    kwh_estimated REAL,
    water_liters_estimated REAL,
    project_name TEXT,
    app_name TEXT,
    created_at TEXT NOT NULL
);
```

**Indexes**: run_id, timestamp, model_name, agent_name

#### 2. orchestration_run_aggregates (Per-Run Summaries)
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
    unique_agents_json TEXT,
    project_name TEXT,
    app_name TEXT,
    run_goal TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
```

**Indexes**: run_id, created_at, project_name

### Backend Components

#### 1. Configuration (config/model_costs.json)
Stores pricing and environmental intensity factors for AI models:

```json
{
  "gpt-4o-mini": {
    "input_price_per_million": 0.15,
    "output_price_per_million": 0.60,
    "kwh_per_million_tokens": 0.5,
    "liters_per_million_tokens": 5.0
  }
}
```

**Supported Models**: GPT-4o, GPT-4o-mini, GPT-4, GPT-4-turbo, GPT-3.5-turbo, Claude-3.5-Sonnet, Claude-3-Opus, Claude-3-Sonnet, Claude-3-Haiku

#### 2. Core Modules

**model_costs.py**
- `ModelCostCalculator` class
- Loads config and calculates impact per API call
- Returns `ModelImpact` dataclass with cost, kWh, liters
- Handles unknown models gracefully (returns zero impact)

**cost_metrics.py**
- `record_call_metrics()` - Records per-call metrics
- `aggregate_run_metrics()` - Aggregates metrics per run
- `get_run_summary()` - Retrieves run summaries
- Safe handling of table existence checks

**routes_cost_metrics.py**
- REST API endpoint implementations
- Query builders with filtering support
- Prometheus metrics generation
- SQL injection prevention using json_each()

#### 3. Integration Points

**app.py - audit_log() function**
```python
def audit_log(..., run_id=None, agent_name=None):
    # Record to audit table
    # Then record environmental metrics if tokens available
    if tokens and not cached:
        cost_metrics.record_call_metrics(...)
```

Automatic metrics recording on every non-cached API call.

### API Endpoints

#### GET /metrics/cost/summary
**Purpose**: Aggregated metrics with timeseries

**Query Parameters**:
- `start_date`, `end_date` (ISO 8601)
- `project`, `app` (string filters)

**Response**:
```json
{
  "total_cost_usd": 12.45,
  "total_kwh": 3.21,
  "total_water_liters": 32.1,
  "total_tokens": 1500000,
  "call_count": 245,
  "run_count": 12,
  "top_models": [...],
  "top_agents": [...],
  "daily_timeseries": [...]
}
```

#### GET /metrics/cost/runs
**Purpose**: Paginated list of runs with metrics

**Query Parameters**:
- `page`, `per_page` (pagination)
- `model`, `agent`, `app` (filters)
- `start_date`, `end_date` (date range)

**Response**:
```json
{
  "runs": [
    {
      "run_id": "...",
      "total_cost_usd": 1.23,
      "total_kwh": 0.45,
      "total_water_liters": 4.5,
      "total_tokens": 50000,
      "unique_models": ["gpt-4o-mini"],
      "unique_agents": ["Agent1", "Agent2"]
    }
  ],
  "total_count": 156,
  "page": 1,
  "per_page": 20
}
```

#### GET /metrics/cost/models
**Purpose**: Per-model aggregates

**Response**:
```json
{
  "models": [
    {
      "model": "gpt-4o-mini",
      "total_cost_usd": 8.90,
      "total_kwh": 2.34,
      "total_water_liters": 23.4,
      "call_count": 180,
      "run_count": 8,
      "avg_cost_per_call": 0.049
    }
  ]
}
```

#### GET /metrics/cost/prometheus
**Purpose**: Prometheus-compatible metrics export

**Response** (text/plain):
```
# HELP unified_ai_cost_usd_total Total AI API cost in USD by model
# TYPE unified_ai_cost_usd_total counter
unified_ai_cost_usd_total{model="gpt-4o-mini"} 8.90
unified_ai_cost_usd_total{model="gpt-4o"} 3.55

# HELP unified_ai_energy_kwh_total Total energy consumption in kWh
# TYPE unified_ai_energy_kwh_total counter
unified_ai_energy_kwh_total{model="gpt-4o-mini"} 2.34
...
```

### Frontend Components

#### EnvironmentalMetrics.tsx
**Features**:
- Real-time metrics cards (cost, energy, water, tokens)
- CO₂ equivalent calculation (kWh × 0.4)
- Time range selector (24h, 7d, 30d, all time)
- Interactive charts using Recharts:
  - Daily trends (line chart)
  - Top models by cost (bar chart)
- Recent runs table with full environmental data
- Auto-refresh every 5 minutes
- Dark mode support

**Props**:
```typescript
interface EnvironmentalMetricsProps {
  apiBaseUrl?: string;
  adminToken?: string;
}
```

#### CostsPage.tsx
**Updates**:
- View toggle between "Environmental" and "Legacy"
- Maintains backward compatibility with existing CostTracker
- Responsive layout with Tailwind CSS

### Testing

#### Unit Tests (18 total, all passing)

**test_model_costs.py** (10 tests)
- Configuration loading
- Model lookup (exact and partial match)
- Cost/energy/water calculations
- Unknown model handling
- None token handling
- to_dict() conversion
- Custom config path
- Config reloading

**test_cost_metrics.py** (8 tests)
- Recording call metrics
- Recording multiple calls
- Aggregating run metrics
- Storing in aggregates table
- Retrieving run summary
- Empty run handling
- Update existing aggregate
- Not found handling

#### Validation
- ✅ Python syntax checks
- ✅ TypeScript compilation
- ✅ SQL injection prevention
- ✅ Import optimization
- ✅ Code review feedback addressed

### Documentation

#### 1. API Documentation
Available at `/docs` when API is running (FastAPI auto-generated)

#### 2. Grafana Integration Guide
**File**: `docs/cost-metrics-grafana.md`

**Contents**:
- 3 integration methods (Prometheus, SQLite, REST API)
- Sample dashboard configurations
- Alert rule examples
- Docker Compose setup
- Troubleshooting guide
- Best practices

### Performance Considerations

1. **Database Indexes**: All frequently queried columns indexed
2. **Caching**: Dashboard auto-refreshes every 5 minutes
3. **Pagination**: All list endpoints support pagination
4. **Async Recording**: Metrics recording doesn't block API calls
5. **Error Handling**: Failed metrics recording doesn't break audit logs

### Security

1. **Admin Token**: All metrics endpoints require admin authentication
2. **SQL Injection**: Prevented using parameterized queries and json_each()
3. **Input Validation**: FastAPI Pydantic models validate all inputs
4. **CORS**: Configured for local development only

### Environmental Impact Methodology

#### Energy Intensity (kWh per million tokens)
Based on estimated datacenter GPU/CPU consumption for inference:
- **Small models** (gpt-3.5-turbo): ~0.3 kWh/M tokens
- **Medium models** (gpt-4o-mini, Claude-3-Haiku): ~0.4-0.5 kWh/M tokens
- **Large models** (gpt-4o, Claude-3-Sonnet): ~1.2-1.5 kWh/M tokens
- **Largest models** (gpt-4, Claude-3-Opus): ~2.0-2.5 kWh/M tokens

#### Water Usage (liters per million tokens)
Estimated for datacenter cooling systems:
- **Rule of thumb**: ~10 liters per kWh for cooling
- Varies by datacenter location and efficiency
- Includes both direct evaporative cooling and power generation

#### Carbon Emissions
Approximate conversion: **1 kWh ≈ 0.4 kg CO₂** (global grid average)
- Actual values vary by region and renewable energy usage
- Some datacenters use 100% renewable energy (lower carbon)

**Note**: These are estimates. Actual values depend on:
- Datacenter location and efficiency
- Renewable energy percentage
- Model optimization and batch processing
- Hardware utilization

### Deployment

#### Prerequisites
- Python 3.8+
- SQLite 3.35+ (for json_each support)
- Node.js 16+ (for dashboard)

#### Backend Setup
```bash
cd apps/UnifiedPromptApp/services/prompt-api

# Install dependencies
pip install -r requirements.txt

# Run migrations (automatic on startup)
python3 app.py
```

#### Frontend Setup
```bash
cd apps/dashboard

# Install dependencies
npm install

# Start development server
npm run dev
```

#### Environment Variables
```bash
# Optional admin token for metrics endpoints
export PROMPT_API_ADMIN_TOKEN=your-secret-token

# API base URL for dashboard
export VITE_API_BASE_URL=http://localhost:8000
```

### Usage Examples

#### Python API
```python
from model_costs import calculate_impact

# Calculate impact for an API call
impact = calculate_impact(
    model="gpt-4o-mini",
    tokens_input=1000,
    tokens_output=500
)

print(f"Cost: ${impact.cost_usd:.4f}")
print(f"Energy: {impact.kwh_estimated:.3f} kWh")
print(f"Water: {impact.water_liters_estimated:.2f} L")
```

#### REST API
```bash
# Get summary metrics
curl http://localhost:8000/metrics/cost/summary

# Get runs from last 7 days
curl "http://localhost:8000/metrics/cost/runs?start_date=2024-12-01"

# Get metrics by model
curl http://localhost:8000/metrics/cost/models

# Export for Prometheus
curl http://localhost:8000/metrics/cost/prometheus
```

### Maintenance

#### Updating Model Costs
1. Edit `config/model_costs.json`
2. Restart API (no migration needed)
3. New costs apply to new API calls only

#### Database Cleanup
```sql
-- Delete metrics older than 90 days
DELETE FROM orchestration_cost_metrics 
WHERE timestamp < date('now', '-90 days');

-- Rebuild aggregates if needed
DELETE FROM orchestration_run_aggregates;
-- Re-aggregate from cost_metrics
```

#### Monitoring
- Check `/health` endpoint for API status
- Monitor database size growth
- Review Grafana dashboards for anomalies
- Set up alerts for high costs

### Future Enhancements

**Potential Additions**:
- [ ] Carbon intensity by datacenter region
- [ ] Cost prediction based on usage patterns
- [ ] Budget alerts and notifications
- [ ] Multi-currency support
- [ ] Azure OpenAI and AWS Bedrock support
- [ ] Real-time cost dashboards with WebSockets
- [ ] Cost optimization recommendations
- [ ] Integration with billing systems
- [ ] Renewable energy percentage tracking
- [ ] Team/user-level cost tracking

### Troubleshooting

#### Metrics Not Recording
1. Check migrations applied: `SELECT * FROM schema_migrations`
2. Verify tables exist: `.tables` in sqlite3
3. Check API logs for errors
4. Ensure tokens are being returned by provider

#### Dashboard Not Loading
1. Verify API is running: `curl http://localhost:8000/health`
2. Check CORS configuration in app.py
3. Verify admin token if required
4. Check browser console for errors

#### Incorrect Costs
1. Verify model_costs.json has correct prices
2. Check token counts in audit table
3. Review calculation logic in model_costs.py
4. Compare with provider's pricing page

### References

- OpenAI Pricing: https://openai.com/pricing
- Anthropic Pricing: https://www.anthropic.com/pricing
- Datacenter Energy: https://www.iea.org/energy-system/buildings/data-centres-and-data-transmission-networks
- Water Usage: https://www.nature.com/articles/s41893-021-00790-5

### Contributors

This feature was implemented as part of the Unified AI Toolbox project.

**Implementation Date**: December 2024
**Version**: 1.0.0
**Status**: Production Ready ✅
