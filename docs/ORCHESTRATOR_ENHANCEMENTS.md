# AI Orchestrator Enhancements

This document describes the recent enhancements made to the AI Orchestrator to support better learning, feedback, and cost tracking.

## Overview

Based on the AI Orchestrator vision document, we've implemented foundational features that support the orchestrator's learning loop and comprehensive cost tracking. These enhancements focus on "low-hanging fruit" that provide immediate value while laying groundwork for future capabilities.

## 1. Enhanced Agent Library

### Baseline Agents Implemented

All six baseline agents from the orchestration specification are now available as YAML definitions:

#### Supervisor (`supervisor.yaml`)
- **Role**: Scores quality, issues corrective guidance, promotes durable insights to global memory
- **Capabilities**: quality-assessment, feedback-generation, memory-management
- **Key Responsibilities**:
  - Assess overall orchestration quality (0-10 score)
  - Score individual agent contributions
  - Provide corrective guidance for improvements
  - Extract learnable patterns from successful runs
  - Generate structured feedback for learning loop

#### Researcher (`researcher.yaml`)
- **Role**: Gathers sources, derives facts, proposes options
- **Capabilities**: web-search, summarize, cite
- **Focus**: Thorough analysis with 3+ distinct approaches per goal

#### Engineer (`engineer.yaml`)
- **Role**: Produces code, configurations, and artifacts
- **Capabilities**: code-generation, testing, tool-integration, implementation
- **Focus**: Detailed technical specifications with working code examples

#### Critic (`critic.yaml`)
- **Role**: Reviews for defects, risks, and adherence to specs
- **Capabilities**: code-review, quality-assurance, security-analysis, best-practices
- **Focus**: Constructive evaluation with specific improvement suggestions

#### Synthesizer (`synthesizer.yaml`)
- **Role**: Merges variants, resolves contradictions, prepares consumable outputs
- **Capabilities**: integration, conflict-resolution, summarization, documentation
- **Focus**: Cohesive implementation roadmaps with clear phases

#### Commissioner (`commissioner.yaml`)
- **Role**: Assesses real-world value, cost/latency, recommends go/no-go
- **Capabilities**: business-assessment, cost-analysis, value-evaluation, decision-making
- **Focus**: Pragmatic ROI evaluation with numerical value scores

### Agent Library Updates

- **Agents2.json**: Updated with metadata, YAML file references, and capability descriptions
- **Consistent Schema**: All agents follow the same YAML structure with:
  - ID, name, role, description
  - Capabilities list
  - I/O contracts (input/output schemas)
  - Routing hints (preferred models, token limits)
  - Comprehensive prompts

## 2. Run Feedback & Learning Infrastructure

### Database Schema Enhancements

New tables added via migration system:

#### `run_feedback` Table
Stores Supervisor quality assessments for each orchestration run:
- `run_id`: Link to orchestration run
- `quality_score`: Overall quality (0-10)
- `feedback_json`: Array of specific feedback items
- `insights_json`: Learnable patterns identified
- `agent_scores_json`: Per-agent performance scores
- `created_at`: Timestamp

#### `learning_patterns` Table
Stores extracted patterns from successful runs:
- `pattern_type`: Category (e.g., "agent-combination", "prompt-strategy")
- `pattern_data`: JSON with pattern details
- `source_run_ids`: Runs that contributed this pattern
- `quality_score`: Associated quality metric
- `usage_count`: How many times pattern has been reused
- `success_rate`: Effectiveness percentage
- `created_at`, `last_used_at`: Timestamps

#### `orchestrator_runs` Table
Comprehensive metadata for each run:
- `id`, `goal`, `agents_json`, `run_mode`, `model`
- `status`, timing fields (`requested_at`, `started_at`, `completed_at`)
- `total_tokens`, `total_cost`: Aggregated metrics
- `output_summary`, `metadata_json`: Run results

#### Enhanced `audit` Table
- Added `run_id` column for cost attribution
- Links individual API calls to orchestration runs
- Enables precise per-run cost calculation

### Migration System

**File**: `Orchestration/UnifiedPromptApp/services/prompt-api/migrations.py`

- Tracks schema version in `schema_migrations` table
- Applies migrations incrementally
- Safe handling of missing tables
- Integrated into app startup (`init_db()`)

## 3. Feedback & Learning API Endpoints

### Submit Run Feedback
```
POST /orchestrate/run/{run_id}/feedback
```

**Request Body**:
```json
{
  "run_id": "run_123",
  "quality_score": 8.5,
  "feedback": [
    "Researcher provided comprehensive analysis",
    "Engineer's implementation was thorough but could optimize for performance"
  ],
  "insights": [
    "Combining Researcher + Engineer produces better specifications",
    "Critical reviews catch 80% of issues before deployment"
  ],
  "agent_scores": {
    "Researcher": 9.0,
    "Engineer": 8.0,
    "Critic": 8.5
  }
}
```

**Response**: Confirmation with feedback ID

**Use Case**: Supervisor agent submits assessment after run completion

### Get Run Feedback
```
GET /orchestrate/run/{run_id}/feedback
```

**Response**: All feedback entries for the specified run

**Use Case**: Review historical feedback for a specific orchestration

### Get Recent Feedback
```
GET /orchestrate/feedback/recent?limit=20
```

**Response**: Recent feedback across all runs (default 10, max 100)

**Use Case**: Dashboard display of recent quality trends

### Get Learning Patterns
```
GET /orchestrate/learning/patterns?pattern_type=agent-combination&limit=20
```

**Query Parameters**:
- `pattern_type` (optional): Filter by pattern category
- `limit`: Number of patterns to return (default 20, max 100)

**Response**: Array of learned patterns sorted by quality score and usage count

**Use Case**: Query best practices for agent selection or prompt strategies

## 4. Enhanced Cost Tracking

### Per-Run Cost Attribution

**New Endpoint**:
```
GET /admin/costs/by-run?run_id=run_123
```

**Query Parameters**:
- `run_id` (optional): Specific run ID
- `start_date`, `end_date`: Date range filters

**Response**:
```json
{
  "runs": [
    {
      "run_id": "run_123",
      "model": "gpt-4o-mini",
      "call_count": 15,
      "total_prompt_tokens": 5000,
      "total_completion_tokens": 3000,
      "total_tokens": 8000,
      "cost": 1.23,
      "first_call": "2025-12-02T10:00:00Z",
      "last_call": "2025-12-02T10:15:00Z"
    }
  ],
  "total_cost": 1.23,
  "run_count": 1
}
```

**Enhanced `CostTracker` Class**:
- New `get_cost_by_run()` method
- Aggregates costs per run ID
- Groups by model for detailed breakdown
- Handles missing `run_id` column gracefully

## 5. Integration Points

### For Orchestration Runs

When executing orchestration runs, populate `run_id` in audit logs:

```python
# In your orchestration code
run_id = "unique_run_identifier"

# When making AI API calls
audit_entry = {
    "template_id": prompt_id,
    "model": model_name,
    "run_id": run_id,  # <- Link to orchestration run
    # ... other fields
}
```

### For Supervisor Agent

After run completion, the Supervisor should:

1. **Assess Quality**: Evaluate run outputs and agent contributions
2. **Generate Feedback**: Create structured feedback with scores
3. **Submit via API**:
   ```python
   import requests
   
   feedback = {
       "run_id": run_id,
       "quality_score": 8.5,
       "feedback": ["Item 1", "Item 2"],
       "insights": ["Pattern 1", "Pattern 2"],
       "agent_scores": {"Researcher": 9.0, "Engineer": 8.0}
   }
   
   response = requests.post(
       f"{API_BASE}/orchestrate/run/{run_id}/feedback",
       json=feedback
   )
   ```

### For Learning Loop

Periodically query learning patterns to inform:

- **Agent Selection**: Which agents work best together?
- **Prompt Strategy**: Which prompt structures yield better results?
- **Cost Optimization**: Which model/agent combinations are most cost-effective?

```python
patterns = requests.get(
    f"{API_BASE}/orchestrate/learning/patterns?pattern_type=agent-combination"
).json()

# Use patterns to influence orchestration decisions
for pattern in patterns["patterns"]:
    if pattern["success_rate"] > 0.8:
        # Apply this successful pattern
        apply_pattern(pattern["pattern_data"])
```

## 6. Future Enhancements

These foundational features enable:

### Near-Term (Next Sprint)
- **UI Dashboard**: Display feedback and learning trends
- **Automatic Pattern Extraction**: Analyze feedback to discover patterns
- **Cost-Quality Correlation**: Identify optimal cost/quality tradeoffs
- **Agent Performance Metrics**: Track and visualize agent effectiveness over time

### Medium-Term
- **Adaptive Agent Selection**: Use learning patterns to auto-select agents
- **A/B Testing Framework**: Compare different agent combinations
- **Budget-Aware Orchestration**: Select strategies based on cost constraints
- **Feedback-Driven Prompt Refinement**: Auto-improve prompts based on outcomes

### Long-Term (From AI Orchestrator.docx)
- **Vector Memory Integration**: Semantic search across historical runs
- **DAG Execution Model**: Parallel agent execution with dependencies
- **Tool Bus**: Auto-generate and register tools
- **Multimodal Pipelines**: Handle audio, video, images in orchestration

## 7. Testing

### Test Migration System
```bash
cd Orchestration/UnifiedPromptApp/services/prompt-api
python3 migrations.py
```

### Test Feedback API
```bash
# Start the API server
python3 app.py

# Submit feedback (requires valid run_id)
curl -X POST http://localhost:8000/orchestrate/run/test_run_123/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "run_id": "test_run_123",
    "quality_score": 8.5,
    "feedback": ["Good analysis"],
    "insights": ["Pattern discovered"],
    "agent_scores": {"Researcher": 9.0}
  }'

# Get feedback
curl http://localhost:8000/orchestrate/run/test_run_123/feedback

# Get recent feedback
curl http://localhost:8000/orchestrate/feedback/recent?limit=5
```

### Test Cost Tracking
```bash
# Get costs by run (requires admin token)
curl http://localhost:8000/admin/costs/by-run?run_id=test_run_123 \
  -H "X-Admin-Token: your_admin_token"
```

## 8. Configuration

### Environment Variables

Existing configuration continues to work. New features use existing database:

```env
# Existing
PROMPT_API_DB_PATH=./workbench.db
PROMPT_API_ADMIN_TOKEN=your_secure_token

# No new environment variables required
```

### Database Location

All new tables are created in the same SQLite database:
- Development: `Orchestration/UnifiedPromptApp/services/prompt-api/workbench.db`
- Docker: Volume-mounted database location

## 9. Documentation References

- **AI Orchestrator Vision**: `project files/AI Orchestrator.docx` - Complete specification
- **Current Architecture**: `project files/Ai Orchestrator – Readme + Architecture + Delivery Checklist.docx`
- **Project Roadmap**: `docs/PROJECT_ROADMAP.md`
- **Agent Library**: `data/agents/*.yaml` - Individual agent definitions

## Summary

These enhancements provide the foundational infrastructure for:

✅ **Quality Assessment**: Supervisor agent can score and provide feedback  
✅ **Learning Loop**: Extract and query successful patterns  
✅ **Cost Attribution**: Track costs per orchestration run  
✅ **Agent Library**: Complete set of baseline agents  
✅ **Extensible Schema**: Migration system for future enhancements

All features are backward-compatible and designed to support the orchestrator's evolution toward the full vision outlined in the AI Orchestrator specification.
