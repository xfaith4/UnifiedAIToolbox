# Orchestration Run Tracking

## Overview

The Orchestration Run Tracking system provides comprehensive visibility into AI orchestration executions, capturing detailed metrics about cost, performance, environmental impact, and human-equivalent comparisons.

## Features

- **Cost Analysis**: Track API, compute, and storage costs
- **Resource Monitoring**: Monitor tokens, CPU/GPU usage, memory, and API calls
- **Environmental Impact**: Calculate energy consumption and water usage
- **Human Equivalence**: Compare machine cost/time to human professional equivalents
- **Agent Timeline**: View detailed breakdown of agent execution
- **File-based Storage**: Simple JSON storage with fast index for listing
- **REST API**: Full CRUD operations for programmatic access
- **Web Dashboard**: Modern UI for viewing and analyzing runs

## Architecture

```
UnifiedAIToolbox/
├── config/
│   └── costs.example.json          # Cost configuration
├── apps/
│   ├── orchestration-bridge/
│   │   ├── lib/
│   │   │   ├── run-tracker.js      # Core tracking module
│   │   │   └── api-server.js       # REST API server
│   │   └── runs/                   # Storage directory
│   │       ├── index.json          # Fast summary index
│   │       └── *.json              # Individual run files
│   └── dashboard/
│       └── src/
│           ├── pages/
│           │   ├── RunsPage.tsx    # Runs listing
│           │   └── RunDetailPage.tsx # Run details
│           ├── services/
│           │   └── runsService.ts  # API client
│           └── types/
│               └── runs.ts         # TypeScript types
```

## Configuration

### Cost Configuration

Edit `config/costs.example.json` to customize cost calculations:

```json
{
  "api_cost_per_1k_tokens_usd": 0.02,
  "cpu_cost_per_hour_usd": 0.10,
  "gpu_cost_per_hour_usd": 1.50,
  "avg_cpu_power_watts": 50,
  "avg_gpu_power_watts": 200,
  "water_intensity_l_per_kwh": 0.5,
  "human_hourly_rate_usd": 60,
  "baseline_hours_per_unit": 2,
  "storage_cost_per_gb_month_usd": 0.023
}
```

### Environment Variables

Set in `.env` file:

```env
# Run tracking API port
RUNS_API_PORT=8001

# For dashboard to connect to API
VITE_RUNS_API_URL=http://localhost:8001
```

## Usage

### Starting the API Server

```bash
# Navigate to orchestration bridge
cd apps/orchestration-bridge

# Install dependencies
npm install

# Start the API server
node lib/api-server.js
```

The API will be available at `http://localhost:8001`

### Recording a Run (Programmatic)

```javascript
const { saveRun, computeCosts, computeHumanEquivalent, nowIso, uuidv4 } = require('./lib/run-tracker');
const config = require('../../config/costs.example.json');

// Create run object
const run = {
  id: uuidv4(),
  name: 'My Orchestration Task',
  start_time: nowIso(),
  agents: [],
  resources: {
    tokens_in: 1000,
    tokens_out: 2000,
    cpu_seconds: 120,
    gpu_seconds: 0,
    api_calls: 3
  }
};

// Later, when run completes
run.end_time = nowIso();
run.duration_ms = new Date(run.end_time) - new Date(run.start_time);

// Compute costs
run.costs = computeCosts({
  ...run.resources,
  duration_ms: run.duration_ms
}, config);

// Compute human equivalent
run.human_equivalent = computeHumanEquivalent(run, config);

// Save run
saveRun(run);
```

### Using the REST API

#### Create/Update a Run

```bash
curl -X POST http://localhost:8001/api/runs \
  -H "Content-Type: application/json" \
  -d '{
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "name": "Test Run",
    "start_time": "2025-12-05T10:00:00Z",
    "end_time": "2025-12-05T10:05:00Z",
    "duration_ms": 300000,
    "resources": {
      "tokens_in": 1000,
      "tokens_out": 2000,
      "cpu_seconds": 300,
      "gpu_seconds": 0
    }
  }'
```

#### List Runs

```bash
# List all runs
curl http://localhost:8001/api/runs

# Filter by status
curl http://localhost:8001/api/runs?status=success

# Limit results
curl http://localhost:8001/api/runs?limit=10
```

#### Get Run Details

```bash
curl http://localhost:8001/api/runs/123e4567-e89b-12d3-a456-426614174000
```

#### Download Run JSON

```bash
curl http://localhost:8001/api/runs/123e4567-e89b-12d3-a456-426614174000/download
```

### Viewing in Dashboard

1. Start the dashboard:
   ```bash
   cd apps/dashboard
   npm run dev
   ```

2. Navigate to `http://localhost:5173/runs`

3. Click on any run to view details

## Run Data Schema

### Run Object

```typescript
{
  id: string;                    // Unique UUID
  name: string;                  // Human-readable name
  task_description?: string;     // Optional description
  start_time: string;            // ISO 8601 timestamp
  end_time: string;              // ISO 8601 timestamp
  duration_ms: number;           // Duration in milliseconds
  orchestrator_version?: string; // Version/git ref
  
  agents: [                      // Array of agents
    {
      agent_id: string;
      name: string;
      role: string;
      start_time: string;
      end_time: string;
      duration_ms: number;
      steps: [                   // Agent steps
        {
          step_id: string;
          action: string;
          input_summary: string;
          output_summary: string;
          tokens_in: number;
          tokens_out: number;
          api_call_metadata?: object;
        }
      ]
    }
  ],
  
  resources: {                   // Resource usage
    tokens_in: number;
    tokens_out: number;
    cpu_seconds: number;
    gpu_seconds: number;
    memory_peak_mb?: number;
    api_calls?: number;
    storage_gb?: number;
  },
  
  costs: {                       // Calculated costs
    api_cost_usd: number;
    compute_cost_usd: number;
    storage_cost_usd: number;
    total_usd: number;
    energy_kwh: number;
    water_liters: number;
  },
  
  human_equivalent?: {           // Human comparison
    estimated_hours_if_human: number;
    estimated_cost_if_human: number;
    professionals_count_equivalent: number;
    time_saved_hours: number;
  },
  
  summary?: {                    // Result summary
    success: boolean;
    outcome: string;
    errors?: string[];
  },
  
  tags?: string[];               // Optional tags
  artifacts?: string[];          // Output file paths
}
```

## Cost Calculation Formulas

### API Cost
```
api_cost_usd = (tokens_in + tokens_out) / 1000 * api_cost_per_1k_tokens_usd
```

### Compute Cost
```
compute_cost_usd = (cpu_seconds / 3600) * cpu_cost_per_hour_usd 
                 + (gpu_seconds / 3600) * gpu_cost_per_hour_usd
```

### Energy Consumption
```
energy_kwh = (avg_cpu_power_watts + avg_gpu_power_watts) 
           * duration_seconds / 3600000
```

### Water Usage
```
water_liters = energy_kwh * water_intensity_l_per_kwh
```

### Human Equivalent Time
```
estimated_hours_if_human = max(baseline_hours_per_unit, duration_hours * 10)
```

### Human Equivalent Cost
```
estimated_cost_if_human = estimated_hours_if_human * human_hourly_rate_usd
```

## Testing

Run the test script to verify the module works:

```bash
cd apps/orchestration-bridge
node lib/test-run-tracker.js
```

This creates a sample run and verifies:
- Run saving to file system
- Index creation/update
- Cost calculations
- Loading runs by ID
- Listing runs

## Best Practices

1. **Capture tokens accurately**: Instrument API clients to return token counts
2. **Track agent boundaries**: Record start/end times for each agent
3. **Add context**: Include task descriptions and tags for filtering
4. **Monitor costs**: Review runs regularly to optimize spending
5. **Baseline calibration**: Adjust human_hourly_rate and baseline_hours for your use case
6. **Storage management**: Archive old runs periodically (index keeps only 1000 entries)

## Integration Examples

### PowerShell Orchestration

```powershell
# Start tracking
$runId = New-Guid
$startTime = Get-Date -Format "o"

# Your orchestration logic here
Invoke-MyOrchestration

# End tracking and save
$endTime = Get-Date -Format "o"
$duration = (Get-Date $endTime) - (Get-Date $startTime)

$body = @{
    id = $runId
    name = "My PowerShell Orchestration"
    start_time = $startTime
    end_time = $endTime
    duration_ms = $duration.TotalMilliseconds
    resources = @{
        tokens_in = 1000
        tokens_out = 2000
        cpu_seconds = 120
    }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:8001/api/runs" `
                  -Method POST `
                  -Body $body `
                  -ContentType "application/json"
```

### Python Integration

```python
import requests
import uuid
from datetime import datetime

# Start run
run_id = str(uuid.uuid4())
start_time = datetime.utcnow().isoformat() + 'Z'

# Your orchestration
# ...

# End run
end_time = datetime.utcnow().isoformat() + 'Z'
duration_ms = int((datetime.fromisoformat(end_time[:-1]) - 
                   datetime.fromisoformat(start_time[:-1])).total_seconds() * 1000)

run_data = {
    'id': run_id,
    'name': 'Python Orchestration',
    'start_time': start_time,
    'end_time': end_time,
    'duration_ms': duration_ms,
    'resources': {
        'tokens_in': 1000,
        'tokens_out': 2000,
        'cpu_seconds': 120
    }
}

response = requests.post('http://localhost:8001/api/runs', json=run_data)
print(f"Run saved: {response.json()}")
```

## Troubleshooting

### API Server Won't Start

**Issue**: Port already in use

**Solution**: 
```bash
# Check what's using port 8001
lsof -i :8001

# Kill the process or use a different port
RUNS_API_PORT=8002 node lib/api-server.js
```

### Dashboard Can't Connect to API

**Issue**: CORS or connection errors

**Solution**:
1. Ensure API server is running: `curl http://localhost:8001/api/runs`
2. Check `.env` has correct `VITE_RUNS_API_URL`
3. Restart dashboard after changing env vars

### Runs Not Appearing in Dashboard

**Issue**: Empty runs list

**Solution**:
1. Check runs directory exists: `ls apps/orchestration-bridge/runs/`
2. Verify index.json: `cat apps/orchestration-bridge/runs/index.json`
3. Check browser console for errors
4. Verify API responds: `curl http://localhost:8001/api/runs`

## Future Enhancements

- [ ] SQLite backend for better querying and aggregation
- [ ] Real-time streaming updates via WebSockets
- [ ] Cost comparison charts and trends
- [ ] Export to CSV/PDF reports
- [ ] Cost alerting and budgets
- [ ] Multi-run comparison view
- [ ] Integration with CI/CD pipelines
- [ ] Automated cost optimization suggestions

## References

- [Cost Configuration](../config/costs.example.json)
- [Run Tracker Module](../apps/orchestration-bridge/lib/run-tracker.js)
- [API Server](../apps/orchestration-bridge/lib/api-server.js)
- [Runs UI](../apps/dashboard/src/pages/RunsPage.tsx)
