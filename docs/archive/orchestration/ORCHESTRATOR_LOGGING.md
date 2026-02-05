# Orchestrator Decision Logging Guide

## Overview

The Unified AI Toolbox includes comprehensive decision logging and verification capabilities for orchestration runs. This system provides deterministic, machine-readable tracing that enables evidence-based evolution of agent prompts and routing while enforcing "runnable by default" quality standards.

## Artifact Location

All orchestration run artifacts are stored under:
```
./artifacts/runs/<run_id>/
```

Each run creates a unique run ID and stores multiple log files in its directory.

## Log Files

### 1. `run.json` - Run Metadata

Contains high-level information about the orchestration run:

```json
{
  "run_id": "20240117_123456_abcd1234",
  "timestamp": "2024-01-17T12:34:56Z",
  "orchestrator_version": "1.5.0",
  "prompt_library_hash": "abc123...",
  "user_goal": "Build a REST API for task management",
  "context_payload": {
    "prompt_id": "api.builder",
    "model": "gpt-4o-mini",
    "run_mode": "default",
    "agents": ["engineer", "reviewer"]
  },
  "definition_of_done": [
    "Complete orchestration execution",
    "Generate artifacts",
    "Log final synthesis"
  ]
}
```

**Key Fields**:
- `run_id`: Unique identifier for this orchestration run
- `timestamp`: ISO-8601 timestamp when run started
- `orchestrator_version`: Version of the orchestration system
- `prompt_library_hash`: SHA-256 hash of prompt library (for reproducibility)
- `user_goal`: Original user request (2-3 sentences)
- `context_payload`: Additional context passed to orchestrator
- `definition_of_done`: Completion criteria

### 2. `steps.jsonl` - Step-Level Event Log

JSONL (JSON Lines) format with one agent execution per line:

```jsonl
{"step_id":"step_001","run_id":"20240117_123456","agent_id":"engineer","model":"gpt-4o-mini","prompt_id":"code.generator","prompt_hash":"def456...","input_payload":{"task":"Create API endpoint"},"raw_output":"Created endpoint at /api/tasks","parsed_output":{"status":"success","files":["api.py"]},"schema_validation":{"passed":true,"errors":[]},"timing_ms":1234.5,"token_usage":{"prompt":100,"completion":50}}
{"step_id":"step_002","run_id":"20240117_123456","agent_id":"reviewer","model":"gpt-4o-mini","prompt_id":"code.review","prompt_hash":"ghi789...","input_payload":{"code":"..."},"raw_output":"Code looks good","parsed_output":{"approved":true},"schema_validation":{"passed":true,"errors":[]},"timing_ms":890.2,"token_usage":{"prompt":150,"completion":30}}
```

**Key Fields**:
- `step_id`: Unique step identifier
- `run_id`: Associated run ID
- `agent_id`: Agent that executed this step
- `model`: Model used (e.g., "gpt-4o-mini")
- `prompt_id`: Prompt identifier (optional)
- `prompt_hash`: SHA-256 hash of prompt (for tracking prompt changes)
- `input_payload`: Exact JSON passed to agent (secrets redacted)
- `raw_output`: Exact text returned by agent (secrets redacted)
- `parsed_output`: Parsed JSON output (null if parse failed)
- `schema_validation`: Validation results (`passed` bool, `errors` array)
- `timing_ms`: Execution time in milliseconds
- `token_usage`: Token counts if available

**Reading JSONL**: Each line is a complete JSON object. Parse line-by-line:

```python
import json

with open("steps.jsonl") as f:
    for line in f:
        step = json.loads(line)
        print(f"Step {step['step_id']}: {step['agent_id']} took {step['timing_ms']}ms")
```

### 3. `decisions.jsonl` - Decision Ledger

Records architectural and strategic decisions:

```jsonl
{"decision_id":"dec_001","run_id":"20240117_123456","step_id":"step_001","type":"stack_choice","chosen":"FastAPI","alternatives":["Flask","Django"],"rationale":"FastAPI offers async support and automatic OpenAPI docs","assumptions":["Python backend required","REST API preferred"],"constraints_referenced":["performance","developer_experience"],"confidence":0.85,"reversible":true,"validation_plan":"Benchmark against Flask"}
{"decision_id":"dec_002","run_id":"20240117_123456","step_id":"step_003","type":"data_store","chosen":"PostgreSQL","alternatives":["MySQL","MongoDB"],"rationale":"Strong ACID guarantees and JSON support","assumptions":["Relational data model"],"constraints_referenced":["data_integrity","scalability"],"confidence":0.9,"reversible":false,"validation_plan":"Load testing with expected data volumes"}
```

**Key Fields**:
- `decision_id`: Unique decision identifier
- `type`: Decision category (e.g., "stack_choice", "auth_strategy", "data_store")
- `chosen`: Selected option
- `alternatives`: Other options considered
- `rationale`: Reasoning behind the decision
- `assumptions`: Underlying assumptions
- `constraints_referenced`: Constraints that influenced decision
- `confidence`: Confidence level (0.0 to 1.0)
- `reversible`: Whether decision can be changed later
- `validation_plan`: How to validate this decision

### 4. `conflicts.jsonl` - Conflict Log

Logs when artifacts disagree (e.g., architecture doc says React but code uses Vue):

```jsonl
{"conflict_id":"conf_001","run_id":"20240117_123456","artifacts_involved":["architecture.md","package.json"],"conflict_summary":"Architecture specifies React but package.json has Vue dependencies","resolution":"Used architecture.md as source of truth, updated code","reason":"Architecture document was explicitly approved","followup_action":"Regenerate frontend code with React"}
```

**Key Fields**:
- `conflict_id`: Unique conflict identifier
- `artifacts_involved`: List of conflicting files/artifacts
- `conflict_summary`: Description of the disagreement
- `resolution`: How conflict was resolved
- `reason`: Justification for resolution approach
- `followup_action`: Required follow-up work

### 5. `artifacts.json` - Artifact Manifest

Catalogs all generated files:

```json
{
  "run_id": "20240117_123456",
  "timestamp": "2024-01-17T12:45:30Z",
  "files": [
    {
      "path": "api/main.py",
      "sha256": "abc123def456...",
      "size_bytes": 2048
    },
    {
      "path": "api/models.py",
      "sha256": "def456ghi789...",
      "size_bytes": 1024
    }
  ],
  "detected_stacks": {
    "frontend": "React",
    "backend": "Python",
    "db": "PostgreSQL"
  },
  "entrypoints_found": [
    "main.py",
    "index.html"
  ],
  "warnings": [
    "No tests found",
    "Missing requirements.txt"
  ]
}
```

**Key Fields**:
- `files`: Array of generated files with checksums
- `detected_stacks`: Best-effort technology detection
- `entrypoints_found`: Discovered entry points
- `warnings`: Issues detected during generation

### 6. `verification.json` - Verification Results (Optional)

Contains build/test/lint results if verification was run:

```json
{
  "run_id": "20240117_123456",
  "timestamp": "2024-01-17T12:50:00Z",
  "lint_result": {
    "passed": true,
    "output": "All checks passed",
    "log_path": "./logs/lint.log"
  },
  "build_result": {
    "passed": true,
    "output": "Build succeeded in 45s",
    "log_path": "./logs/build.log"
  },
  "unit_test_result": {
    "passed": false,
    "output": "2 of 10 tests failed",
    "log_path": "./logs/unit_tests.log"
  },
  "smoke_test_result": null,
  "docker_compose_valid": true,
  "paths_to_full_logs": [
    "./logs/lint.log",
    "./logs/build.log",
    "./logs/unit_tests.log"
  ]
}
```

**Key Fields**:
- `lint_result`, `build_result`, `unit_test_result`, `smoke_test_result`: Each contains `passed` (bool), `output` (short summary), and `log_path` (full log location)
- `docker_compose_valid`: Whether docker-compose config is valid
- `paths_to_full_logs`: Paths to detailed log files

## Secret Redaction

All logs automatically redact common secret patterns:
- API keys (e.g., `api_key: sk_test_...` → `api_key: [REDACTED]`)
- Bearer tokens
- Passwords
- Client secrets
- AWS access keys

**Redacted patterns**:
- `api_key`, `api-key`, `API KEY`
- `token`
- `bearer`
- `password`
- `secret`
- `Authorization: Bearer`
- `client_secret`
- `aws_secret_access_key`

## Usage Examples

### Analyze Step Performance

```python
import json

total_time = 0
step_count = 0

with open("./artifacts/runs/<run_id>/steps.jsonl") as f:
    for line in f:
        step = json.loads(line)
        if step.get("timing_ms"):
            total_time += step["timing_ms"]
            step_count += 1

avg_time = total_time / step_count if step_count > 0 else 0
print(f"Average step time: {avg_time:.2f}ms")
```

### Find Failed Schema Validations

```python
import json

failed_validations = []

with open("./artifacts/runs/<run_id>/steps.jsonl") as f:
    for line in f:
        step = json.loads(line)
        validation = step.get("schema_validation", {})
        if not validation.get("passed", False):
            failed_validations.append({
                "step_id": step["step_id"],
                "agent_id": step["agent_id"],
                "errors": validation.get("errors", [])
            })

for failure in failed_validations:
    print(f"Step {failure['step_id']} ({failure['agent_id']}) failed validation:")
    for error in failure['errors']:
        print(f"  - {error}")
```

### Check Decision Confidence

```python
import json

low_confidence_decisions = []

with open("./artifacts/runs/<run_id>/decisions.jsonl") as f:
    for line in f:
        decision = json.loads(line)
        if decision.get("confidence", 1.0) < 0.7:
            low_confidence_decisions.append({
                "id": decision["decision_id"],
                "type": decision["type"],
                "chosen": decision["chosen"],
                "confidence": decision["confidence"]
            })

if low_confidence_decisions:
    print("Low confidence decisions:")
    for dec in low_confidence_decisions:
        print(f"  - {dec['type']}: {dec['chosen']} (confidence: {dec['confidence']})")
```

### Verify Stack Detection

```python
import json

with open("./artifacts/runs/<run_id>/artifacts.json") as f:
    manifest = json.load(f)
    
stacks = manifest.get("detected_stacks", {})
print("Detected technology stacks:")
print(f"  Frontend: {stacks.get('frontend', 'None')}")
print(f"  Backend: {stacks.get('backend', 'None')}")
print(f"  Database: {stacks.get('db', 'None')}")

warnings = manifest.get("warnings", [])
if warnings:
    print("\nWarnings:")
    for warning in warnings:
        print(f"  - {warning}")
```

## Fail-Open Design

The logging system is designed to **never crash the orchestrator**:

- All logging operations are wrapped in try-except blocks
- Logging failures are recorded as warnings
- Orchestration continues even if logging fails
- The orchestrator can query `orch_logger.has_logging_errors()` to check if any logging failed

This ensures that orchestration runs complete successfully even if there are issues with the logging infrastructure.

## Best Practices

1. **Use run_id for traceability**: Always include run_id when referencing logs
2. **Archive old runs**: Periodically move completed runs to archival storage
3. **Monitor prompt hashes**: Track when prompt changes affect outcomes
4. **Review low-confidence decisions**: Decisions with confidence < 0.7 may need refinement
5. **Check validation failures**: Failed schema validations indicate agent output issues
6. **Analyze timing data**: Identify slow agents that need optimization
7. **Track conflicts**: Frequent conflicts indicate coordination issues between agents

## Integration

The logging system integrates automatically with the orchestration API:

```python
# Logging is automatic when using the orchestrate_run endpoint
response = requests.post("http://localhost:8000/orchestrate/run", json={
    "goal": "Build a task management API",
    "model": "gpt-4o-mini"
})

run_id = response.json()["run_id"]

# Access logs at:
# ./artifacts/runs/{run_id}/run.json
# ./artifacts/runs/{run_id}/steps.jsonl
# etc.
```

## Troubleshooting

### No logs generated

- Check application logs for import errors when the server starts
- Verify that orchestrator_logger.py and orchestrator_schemas.py are in the correct directory
- Ensure all dependencies (pydantic, etc.) are installed
- Check that the artifacts directory has write permissions

### Secrets not redacted

- Verify that your secret follows common patterns (api_key, token, password)
- Custom patterns can be added to `SECRET_PATTERNS` in orchestrator_logger.py

### Missing verification results

- Verification only runs if appropriate config files exist (package.json, pytest.ini, etc.)
- Check that verification commands are installed (npm, pytest, etc.)
- Review verification logs in `./logs/` subdirectory

## See Also

- [Agent Library Documentation](../Orchestration/agents/README.md)
- [Orchestration Pipeline Guide](../Orchestration/README.md)
- [API Documentation](../apps/UnifiedPromptApp/services/prompt-api/README.md)
