# Quality & Outcome Tracking

The Unified AI Toolbox now includes comprehensive quality and outcome tracking for orchestration runs, enabling you to measure success rates, quality scores, and cost efficiency across different strategies and models.

## Overview

Quality tracking adds a new dimension to cost monitoring by capturing:
- **Success/Failure Status**: Whether each run completed successfully
- **Quality Scores**: Numeric ratings (0.0 to 1.0) for output quality
- **Human Ratings**: Manual quality assessments with notes
- **Automated Test Results**: Programmatic quality validation
- **Manual Fix Requirements**: Tracking when human intervention was needed
- **Strategy Attribution**: Linking quality to the approach used

This enables you to answer questions like:
- Which strategies produce the highest quality results?
- What's the cost per successful run vs per failed run?
- Which models deliver the best quality-to-cost ratio?
- How often do runs require manual fixes?

## API Endpoints

### Submit Human Quality Rating

**POST** `/metrics/quality/runs/{run_id}/rating`

Submit a human quality rating for a completed run.

**Request Body:**
```json
{
  "success": true,
  "quality_score": 0.85,
  "strategy": "multi-agent",
  "notes": "Great output quality, minimal edits needed",
  "needs_manual_fix": false
}
```

**Fields:**
- `success` (boolean, required): Whether the run was successful
- `quality_score` (float, optional): Quality score from 0.0 to 1.0
- `strategy` (string, optional): Strategy used (e.g., "multi-agent", "single-shot")
- `notes` (string, optional): Human-readable notes about quality
- `needs_manual_fix` (boolean, default: false): Whether manual intervention was needed

**Response:**
```json
{
  "status": "success",
  "message": "Quality rating recorded for run abc123"
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/metrics/quality/runs/abc123/rating \
  -H "Content-Type: application/json" \
  -d '{
    "success": true,
    "quality_score": 0.85,
    "strategy": "multi-agent",
    "notes": "Excellent results"
  }'
```

---

### Record Automated Test Results

**POST** `/metrics/quality/runs/{run_id}/automated`

Record automated test results for a run.

**Request Body:**
```json
{
  "success": true,
  "test_score": 0.92,
  "strategy": "test-suite",
  "time_to_result_ms": 45000
}
```

**Fields:**
- `success` (boolean, required): Whether the test passed
- `test_score` (float, optional): Test score from 0.0 to 1.0
- `strategy` (string, optional): Strategy used
- `time_to_result_ms` (integer, optional): Time taken in milliseconds

**Response:**
```json
{
  "status": "success",
  "message": "Automated test result recorded for run abc123"
}
```

**Example:**
```bash
curl -X POST http://localhost:8000/metrics/quality/runs/abc123/automated \
  -H "Content-Type: application/json" \
  -d '{
    "success": true,
    "test_score": 0.92,
    "time_to_result_ms": 45000
  }'
```

---

### Get Quality Metrics for a Run

**GET** `/metrics/quality/runs/{run_id}`

Retrieve quality metrics for a specific run.

**Response:**
```json
{
  "run_id": "abc123",
  "strategy": "multi-agent",
  "success": true,
  "quality_score": 0.85,
  "notes": "Great output quality",
  "time_to_result_ms": 45000,
  "needs_manual_fix": false,
  "rating_source": "manual",
  "automated_test_passed": null,
  "automated_test_score": null,
  "created_at": "2025-12-06T10:30:00Z",
  "updated_at": "2025-12-06T10:30:00Z"
}
```

**Example:**
```bash
curl http://localhost:8000/metrics/quality/runs/abc123
```

---

### Get Quality Summary

**GET** `/metrics/quality/summary`

Get summary statistics for quality metrics across all runs.

**Query Parameters:**
- `strategy` (string, optional): Filter by strategy name
- `min_quality_score` (float, optional): Minimum quality score (0.0 to 1.0)
- `success_only` (boolean, default: false): Only include successful runs

**Response:**
```json
{
  "total_runs": 150,
  "successful_runs": 125,
  "success_rate": 0.8333,
  "avg_quality_score": 0.78,
  "runs_needing_manual_fix": 15,
  "avg_time_to_result_ms": 42000,
  "by_strategy": [
    {
      "strategy": "multi-agent",
      "total_runs": 80,
      "successful_runs": 72,
      "success_rate": 0.9,
      "avg_quality_score": 0.85,
      "runs_needing_manual_fix": 5
    },
    {
      "strategy": "single-shot",
      "total_runs": 70,
      "successful_runs": 53,
      "success_rate": 0.7571,
      "avg_quality_score": 0.70,
      "runs_needing_manual_fix": 10
    }
  ],
  "by_model": [
    {
      "model": "gpt-4o",
      "total_runs": 100,
      "successful_runs": 92,
      "success_rate": 0.92,
      "avg_quality_score": 0.82
    },
    {
      "model": "gpt-4o-mini",
      "total_runs": 50,
      "successful_runs": 33,
      "success_rate": 0.66,
      "avg_quality_score": 0.71
    }
  ]
}
```

**Example:**
```bash
# Get overall summary
curl http://localhost:8000/metrics/quality/summary

# Filter by strategy
curl "http://localhost:8000/metrics/quality/summary?strategy=multi-agent"

# Only successful runs with quality >= 0.8
curl "http://localhost:8000/metrics/quality/summary?success_only=true&min_quality_score=0.8"
```

---

### Get Cost-Quality Efficiency

**GET** `/metrics/quality/efficiency`

Calculate cost efficiency metrics based on quality outcomes.

**Query Parameters:**
- `quality_threshold` (float, default: 0.7): Minimum score for "high-quality" runs

**Response:**
```json
{
  "total_cost_usd": 15.342,
  "total_runs": 150,
  "successful_runs": 125,
  "high_quality_runs": 95,
  "quality_threshold": 0.7,
  "cost_per_run": 0.1023,
  "cost_per_successful_run": 0.1227,
  "cost_per_high_quality_run": 0.1615,
  "quality_adjusted_cost_index": 24.56,
  "avg_quality_score": 0.78
}
```

**Metrics Explained:**
- **cost_per_run**: Total cost divided by all runs
- **cost_per_successful_run**: Cost of successful runs divided by number of successful runs
- **cost_per_high_quality_run**: Cost of high-quality runs (score >= threshold) divided by count
- **quality_adjusted_cost_index**: Total cost / (avg_quality × success_rate) — lower is better

**Example:**
```bash
# Default threshold (0.7)
curl http://localhost:8000/metrics/quality/efficiency

# Custom threshold
curl "http://localhost:8000/metrics/quality/efficiency?quality_threshold=0.8"
```

---

### Get Runs with Quality Data

**GET** `/metrics/quality/runs`

Get paginated list of runs with both cost and quality metrics.

**Query Parameters:**
- `page` (integer, default: 1): Page number
- `per_page` (integer, default: 20, max: 100): Items per page
- `strategy` (string, optional): Filter by strategy
- `min_quality` (float, optional): Minimum quality score
- `success_only` (boolean, default: false): Only successful runs

**Response:**
```json
{
  "runs": [
    {
      "run_id": "abc123",
      "run_goal": "Generate documentation",
      "strategy": "multi-agent",
      "success": true,
      "quality_score": 0.85,
      "needs_manual_fix": false,
      "time_to_result_ms": 45000,
      "total_cost_usd": 0.0234,
      "total_kwh": 0.0012,
      "total_water_liters": 0.045,
      "cost_efficiency": 0.0275,
      "created_at": "2025-12-06T10:30:00Z"
    }
  ],
  "total_count": 150,
  "page": 1,
  "per_page": 20
}
```

**Note:** `cost_efficiency` is calculated as `cost / quality_score` — lower values indicate better efficiency.

**Example:**
```bash
# Get first page
curl http://localhost:8000/metrics/quality/runs

# Filter by strategy and quality
curl "http://localhost:8000/metrics/quality/runs?strategy=multi-agent&min_quality=0.8"

# Successful runs only
curl "http://localhost:8000/metrics/quality/runs?success_only=true"
```

---

## Extended Cost Metrics

The existing `/metrics/cost/runs` endpoint now automatically includes quality data when available:

**GET** `/metrics/cost/runs`

Returns run metrics with optional quality fields:
```json
{
  "runs": [
    {
      "run_id": "abc123",
      "total_cost_usd": 0.0234,
      "total_tokens": 15000,
      // ... other cost fields ...
      
      // Quality fields (when available)
      "quality_success": true,
      "quality_score": 0.85,
      "strategy": "multi-agent",
      "needs_manual_fix": false,
      "cost_efficiency": 0.0275
    }
  ],
  "total_count": 100,
  "page": 1,
  "per_page": 20
}
```

The `/metrics/cost/summary` endpoint also now includes quality-based cost metrics:
```json
{
  // ... existing fields ...
  "cost_per_successful_run": 0.1227,
  "cost_per_high_quality_run": 0.1615,
  "quality_adjusted_cost_index": 24.56
}
```

---

## Database Schema

The quality tracking system uses a dedicated table:

```sql
CREATE TABLE run_quality_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT UNIQUE NOT NULL,
    strategy TEXT,
    success INTEGER NOT NULL DEFAULT 0,
    quality_score REAL,
    notes TEXT,
    time_to_result_ms INTEGER,
    needs_manual_fix INTEGER NOT NULL DEFAULT 0,
    rating_source TEXT,
    automated_test_passed INTEGER,
    automated_test_score REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES orchestrator_runs(id)
);
```

The table is automatically created when the API starts via database migrations.

---

## Usage Patterns

### 1. Human Quality Rating Workflow

After a run completes, a human reviewer can submit a quality rating:

```python
import requests

def rate_run_quality(run_id, success, quality_score, notes=""):
    """Submit quality rating for a run."""
    response = requests.post(
        f"http://localhost:8000/metrics/quality/runs/{run_id}/rating",
        json={
            "success": success,
            "quality_score": quality_score,
            "notes": notes,
            "needs_manual_fix": False
        }
    )
    return response.json()

# Rate a successful run
rate_run_quality("abc123", True, 0.85, "Excellent output")
```

### 2. Automated Test Integration

Integrate quality tracking into your test suite:

```python
def run_test_and_track_quality(run_id):
    """Run tests and track quality automatically."""
    start_time = time.time()
    
    # Run your tests
    test_results = run_test_suite()
    
    elapsed_ms = int((time.time() - start_time) * 1000)
    
    # Record quality metrics
    requests.post(
        f"http://localhost:8000/metrics/quality/runs/{run_id}/automated",
        json={
            "success": test_results.passed,
            "test_score": test_results.score / 100,
            "strategy": "test-suite",
            "time_to_result_ms": elapsed_ms
        }
    )
```

### 3. Quality-Based Reporting

Generate reports comparing strategies:

```python
def compare_strategies():
    """Compare quality and cost across strategies."""
    summary = requests.get("http://localhost:8000/metrics/quality/summary").json()
    
    print("Strategy Performance:")
    for strategy in summary["by_strategy"]:
        print(f"\n{strategy['strategy']}:")
        print(f"  Success Rate: {strategy['success_rate']:.1%}")
        print(f"  Avg Quality: {strategy['avg_quality_score']:.2f}")
        print(f"  Manual Fixes: {strategy['runs_needing_manual_fix']}")
```

### 4. Cost-Quality Analysis

Analyze cost efficiency:

```python
def analyze_cost_efficiency(threshold=0.7):
    """Analyze cost efficiency based on quality."""
    efficiency = requests.get(
        f"http://localhost:8000/metrics/quality/efficiency?quality_threshold={threshold}"
    ).json()
    
    print(f"Cost Efficiency (quality >= {threshold}):")
    print(f"  Cost per run: ${efficiency['cost_per_run']:.4f}")
    print(f"  Cost per success: ${efficiency['cost_per_successful_run']:.4f}")
    print(f"  Cost per high-quality: ${efficiency['cost_per_high_quality_run']:.4f}")
    print(f"  Quality-adjusted index: {efficiency['quality_adjusted_cost_index']:.2f}")
```

---

## Dashboard Integration

The web dashboard includes comprehensive quality tracking features:

### Quality Metrics Page

Access via **Costs** page → **Quality** tab

Features:
- **Summary Cards**: Success rate, average quality, manual fixes needed, average time
- **Cost Efficiency**: Cost per success, cost per high-quality run, quality-adjusted index
- **Charts**:
  - Success rate by strategy (bar chart)
  - Average quality by strategy (bar chart)
  - Cost vs quality scatter plot (recent runs)
  - Success rate by model (grouped bar chart)
- **Recent Runs Table**: Shows run status, quality scores, and efficiency metrics

### Quality Rating Form

Available on the **Run Detail** page for each orchestration run.

Features:
- Success/failure toggle buttons
- Quality score slider (0-100%)
- Strategy dropdown
- Notes text area
- Manual fix checkbox
- Instant submission with feedback

---

## Best Practices

### 1. Consistent Quality Scoring

Establish a consistent scale for quality scores:
- **0.9-1.0**: Excellent — production-ready, minimal or no edits
- **0.7-0.9**: Good — usable with minor edits
- **0.5-0.7**: Fair — needs significant revision
- **0.0-0.5**: Poor — not usable or major issues

### 2. Regular Rating

Rate runs consistently to build meaningful data:
- Rate high-value or representative runs manually
- Use automated tests for routine validation
- Track trends over time to measure improvements

### 3. Strategy Attribution

Always specify the strategy used:
- Helps identify which approaches work best
- Enables strategy-specific optimization
- Facilitates A/B testing different approaches

### 4. Notes for Context

Use the notes field to capture:
- Specific issues or strengths
- Edge cases encountered
- Reasons for manual fixes
- Suggestions for improvement

### 5. Quality Thresholds

Define quality thresholds for your use case:
- Set minimum acceptable quality (e.g., 0.7)
- Track percentage of runs meeting threshold
- Use threshold in cost-efficiency calculations
- Adjust strategies that consistently fall below threshold

---

## Integration Examples

### PowerShell Integration

```powershell
function Submit-RunQuality {
    param(
        [string]$RunId,
        [bool]$Success,
        [double]$QualityScore,
        [string]$Notes = ""
    )
    
    $body = @{
        success = $Success
        quality_score = $QualityScore
        notes = $Notes
    } | ConvertTo-Json
    
    Invoke-RestMethod `
        -Uri "http://localhost:8000/metrics/quality/runs/$RunId/rating" `
        -Method Post `
        -Body $body `
        -ContentType "application/json"
}

# Usage
Submit-RunQuality -RunId "abc123" -Success $true -QualityScore 0.85 -Notes "Great results"
```

### Python Integration

```python
from typing import Optional
import requests

class QualityTracker:
    def __init__(self, api_url: str = "http://localhost:8000"):
        self.api_url = api_url
    
    def rate_run(
        self,
        run_id: str,
        success: bool,
        quality_score: Optional[float] = None,
        strategy: Optional[str] = None,
        notes: Optional[str] = None
    ):
        """Submit quality rating for a run."""
        return requests.post(
            f"{self.api_url}/metrics/quality/runs/{run_id}/rating",
            json={
                "success": success,
                "quality_score": quality_score,
                "strategy": strategy,
                "notes": notes
            }
        ).json()
    
    def get_efficiency(self, threshold: float = 0.7):
        """Get cost-quality efficiency metrics."""
        return requests.get(
            f"{self.api_url}/metrics/quality/efficiency",
            params={"quality_threshold": threshold}
        ).json()

# Usage
tracker = QualityTracker()
tracker.rate_run("abc123", success=True, quality_score=0.85)
```

---

## Troubleshooting

### Quality metrics not appearing

1. Ensure migrations have been applied:
   ```bash
   # Check if table exists
   sqlite3 workbench.db "SELECT name FROM sqlite_master WHERE type='table' AND name='run_quality_metrics';"
   ```

2. Verify API is using correct database path:
   ```bash
   # Check in logs for database path
   grep "DB_PATH" logs/api.log
   ```

### Cost-quality efficiency returns null

- Requires both cost and quality data
- Need at least one run with both metrics recorded
- Check if runs have associated quality ratings

### Dashboard shows "No quality data available"

1. Submit at least one quality rating
2. Check API endpoint directly:
   ```bash
   curl http://localhost:8000/metrics/quality/summary
   ```
3. Verify API base URL in dashboard config

---

## See Also

- [Orchestration Run Tracking](./ORCHESTRATION_RUN_TRACKING.md) - Cost and environmental metrics
- [API Reference](./help/api-reference.md) - Complete API documentation
- [Dashboard Guide](./help/dashboard-guide.md) - Using the web interface
