# Telemetry Stats API Documentation

## Endpoint
`GET /api/telemetry/stats`

## Purpose
Provides aggregated telemetry statistics for the dashboard, querying orchestration cost metrics, run aggregates, and quality tracking data.

## Query Parameters
- `days` (integer, required): Number of days to analyze. Valid range: 1-90. Default: 7

## Response Schema
```json
{
  "total_events": <integer>,
  "period_days": <integer>,
  "start_date": "<ISO 8601 timestamp>",
  "end_date": "<ISO 8601 timestamp>",
  "by_event_type": {
    "<event_type>": <count>
  },
  "by_source": {
    "<source>": <count>
  },
  "by_day": {
    "<YYYY-MM-DD>": <count>
  }
}
```

## Implementation Details

### Database Tables Queried
1. **orchestration_cost_metrics** (migration 4)
   - Tracks per-call cost, tokens, energy, and water usage
   - Aggregated for daily breakdown

2. **orchestration_run_aggregates** (migration 5)
   - Summarizes completed orchestration runs
   - Provides total cost and run counts

3. **run_quality_metrics** (migration 6)
   - Tracks success/failure status and quality scores
   - Distinguishes successful vs failed runs

### Fallback Behavior
If database tables are empty, the endpoint falls back to reading JSONL telemetry files from `artifacts/telemetry/` directory.

### Error Handling
- Returns safe defaults (zeros, empty objects) instead of raising errors
- Logs detailed error information for debugging
- Never exposes internal errors to clients (returns 200 with empty data)

### Edge Cases Handled
- Empty database (no data): Returns zeros and empty dictionaries
- Missing tables: Gracefully skips unavailable tables
- None values: Converted to zeros
- Decimal types: Converted to float/int for JSON serialization
- DateTime objects: Converted to ISO 8601 strings

## Example Usage

### Request
```bash
curl http://localhost:8000/api/telemetry/stats?days=7
```

### Response (with data)
```json
{
  "total_events": 8,
  "period_days": 7,
  "start_date": "2025-11-29T13:57:43.702048Z",
  "end_date": "2025-12-06T13:57:43.702048Z",
  "by_event_type": {
    "OrchestrationRun.Completed": 3,
    "OrchestrationRun.TotalCost": 0.18,
    "QualityMetrics.Total": 4,
    "QualityMetrics.Successful": 2,
    "QualityMetrics.Failed": 2
  },
  "by_source": {},
  "by_day": {
    "2025-12-06": 5
  }
}
```

### Response (no data)
```json
{
  "total_events": 0,
  "period_days": 7,
  "start_date": "2025-11-29T13:57:43.702048Z",
  "end_date": "2025-12-06T13:57:43.702048Z",
  "by_event_type": {},
  "by_source": {},
  "by_day": {}
}
```

## Frontend Integration
The dashboard's `TelemetryPage.tsx` component consumes this endpoint and displays:
- Summary cards (total events, repo analyses, AI summaries)
- Charts (events by type, events by source, daily volume)
- Detailed tables

The TypeScript interface:
```typescript
interface TelemetryStats {
  total_events: number
  period_days: number
  start_date: string
  end_date: string
  by_event_type: Record<string, number>
  by_source: Record<string, number>
  by_day: Record<string, number>
}
```

## Testing
Comprehensive test suite in `tests/test_telemetry_stats.py` covers:
- Empty database scenario
- Cost metrics data
- Quality metrics data
- Run aggregates data
- Parameter validation
- JSON type safety
- Error handling

Run tests:
```bash
python -m pytest tests/test_telemetry_stats.py -v
```

## Security
- Parameterized SQL queries prevent injection attacks
- Input validation ensures `days` parameter is within safe range
- No sensitive data exposure in error messages
- CodeQL scan: 0 alerts

## Performance Considerations
- Database queries use indexes on timestamp/created_at columns
- Response includes only aggregated data (not raw events)
- Falls back to JSONL reading only if database is empty
- Typical response time: <100ms

## Maintenance Notes
- If migrations 4-6 schema changes, update queries accordingly
- Keep TypeScript interface in sync with Python response model
- Monitor query performance as data grows
- Consider adding caching if response times increase
