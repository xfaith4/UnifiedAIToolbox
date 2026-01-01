# Orchestration Bridge

The orchestration bridge provides run tracking and API endpoints for managing AI orchestration executions.

## Features

- **Run Tracking**: Capture detailed metrics for every orchestration run
- **Cost Analysis**: Calculate API, compute, storage, and environmental costs
- **REST API**: Full CRUD operations for runs
- **File-based Storage**: Simple JSON storage with fast index
- **Human Equivalence**: Compare machine vs. human costs and time

## MCP Resource Center

The bridge now ships with a file-backed MCP registry so orchestration agents can reuse shared MCP servers.

- Registry location: `data/mcp/servers.json`
- Access helpers: `src/utils/mcp_registry.py`

```python
from src.utils.mcp_registry import resolve_servers

default_servers = resolve_servers(tags=["default"])
browser_servers = resolve_servers(capabilities=["browser-automation"])
```

## Quick Start

### 1. Install Dependencies

Node (for the bridge helpers):

```bash
npm install
```

Python (for Git-backed repo orchestration workflows):

```bash
pip install -r requirements.txt
```

### 2. Start the API Server

```bash
node lib/api-server.js
```

The API will be available at `http://localhost:8001`

### 3. Test the Integration

```bash
# Run example orchestration
node lib/example-orchestration.js

# Test the API
curl http://localhost:8001/api/runs
```

## API Endpoints

- `POST /api/runs` - Create/update a run
- `GET /api/runs` - List all runs (supports `?status=success` and `?limit=10`)
- `GET /api/runs/:id` - Get run details
- `GET /api/runs/:id/download` - Download run as JSON
- `GET /api/config/costs` - Get cost configuration

## Directory Structure

```markdown

orchestration-bridge/
├── lib/
│   ├── run-tracker.js           # Core tracking module
│   ├── api-server.js            # REST API server
│   ├── test-run-tracker.js      # Unit tests
│   └── example-orchestration.js # Integration example
├── runs/                        # Run storage directory
│   ├── index.json              # Fast summary index
│   └── *.json                  # Individual run files
└── package.json
```

## Usage in Your Code

```javascript
const { saveRun, computeCosts, computeHumanEquivalent, nowIso, uuidv4 } = require('./lib/run-tracker');
const config = require('../../config/costs.example.json');

// Create run
const run = {
  id: uuidv4(),
  name: 'My Task',
  start_time: nowIso(),
  agents: [],
  resources: { tokens_in: 0, tokens_out: 0, cpu_seconds: 0, gpu_seconds: 0 }
};

// Execute your orchestration
// ... add agents, track resources ...

// Finalize
run.end_time = nowIso();
run.duration_ms = new Date(run.end_time) - new Date(run.start_time);
run.costs = computeCosts({ ...run.resources, duration_ms: run.duration_ms }, config);
run.human_equivalent = computeHumanEquivalent(run, config);

// Save
saveRun(run);
```

## Configuration

Edit `../../config/costs.example.json` to customize cost calculations:

```json
{
  "api_cost_per_1k_tokens_usd": 0.02,
  "cpu_cost_per_hour_usd": 0.10,
  "gpu_cost_per_hour_usd": 1.50,
  "avg_cpu_power_watts": 50,
  "avg_gpu_power_watts": 200,
  "water_intensity_l_per_kwh": 0.5,
  "human_hourly_rate_usd": 60,
  "baseline_hours_per_unit": 2
}
```

## Environment Variables

```bash
# API server port (default: 8001)
RUNS_API_PORT=8001
```

## View in Dashboard

After starting the dashboard:

```bash
cd ../dashboard
npm run dev
```

Navigate to `http://localhost:5173/runs` to view all runs in the UI.

## Testing

```bash
# Test the core module
node lib/test-run-tracker.js

# Test with example orchestration
node lib/example-orchestration.js

# Test API endpoints
curl http://localhost:8001/api/runs
```

## Documentation

See [ORCHESTRATION_RUN_TRACKING.md](../../docs/ORCHESTRATION_RUN_TRACKING.md) for comprehensive documentation.
