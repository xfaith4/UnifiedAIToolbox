# PromptOps: Closed-Loop Prompt Improvement System

## Overview

PromptOps is a closed-loop system for treating prompts as code with deterministic tracking, automatic improvement, and gated deployment. It increases the probability that orchestrators produce coherent, runnable applications by learning from run traces and proposing validated improvements to agent instructions.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Orchestration Run                          │
│  (User Goal → Agent Library → Steps → Artifacts → Verification)│
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ├─ Run Trace Recorder (always on, fail-open)
                         │  └─ ./artifacts/runs/<run_id>/
                         │     ├─ run.json
                         │     ├─ steps.jsonl
                         │     ├─ decisions.jsonl
                         │     ├─ conflicts.jsonl
                         │     ├─ stack_lock.json
                         │     ├─ artifacts.json
                         │     └─ verification.json
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Post-Run Reviewer (automatic)                 │
│  Analyzes: schema failures, stack drift, verification failures  │
│  Outputs: PromptPatchPlan.json with evidence-linked patches     │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Gated Auto-Apply (CI-style)                 │
│  Gates: JSON schema, OUTPUT JSON constraint, schema drift, evals│
│  Decision: auto_apply (low risk) | pending_approval | rejected  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ├─ auto_apply (low risk, gates pass)
                         │  └─ Update ./prompts/agent-library.active.json
                         │
                         └─ pending_approval (medium/high risk)
                            └─ Requires manual: Approve-PromptCandidate
```

## Core Principles

1. **Prompts as Code**: Versioned, testable, revertible
2. **Fail-Open**: Logging never crashes orchestration
3. **Secret Redaction**: Never write tokens/keys to disk
4. **Structured Patches**: No freeform rewrites; changes are JSON Patch operations
5. **Evidence-Based**: Every proposed change links to run artifacts
6. **Risk-Aware**: Auto-apply only safe, validated changes

## Components

### A. Run Trace Recorder

**Location**: `apps/UnifiedPromptApp/services/prompt-api/orchestrator_logger.py`

**Purpose**: Capture deterministic traces of every orchestration run

**Artifacts Created** (in `./artifacts/runs/<run_id>/`):

- `run.json` - Run metadata, goal, context, definition of done
- `steps.jsonl` - Agent call trace (inputs, outputs, validation results)
- `decisions.jsonl` - Architectural decisions with rationale and alternatives
- `conflicts.jsonl` - Conflicts between artifacts and resolutions
- `stack_lock.json` - Locked technology stack (frontend, backend, db)
- `artifacts.json` - Manifest of generated files with checksums
- `verification.json` - Build/test/lint results

**Features**:
- Automatic secret redaction (API keys, tokens, passwords)
- Fail-open semantics (logging errors never crash orchestration)
- JSONL for append-only event streams
- Stable SHA-256 hashing for prompts and files

### B. Stack Lock & Validator

**Location**: `apps/UnifiedPromptApp/services/prompt-api/stack_validator.py`

**Purpose**: Prevent incoherent technology stack combinations

**How It Works**:
1. Early in run, create `stack_lock.json` with frontend/backend/db choices
2. Every generated artifact is validated against the lock
3. Violations (e.g., Vue file when React is locked) are recorded as conflicts
4. Critical violations trigger bounded retry with hard constraint message

**Example Violations**:
- `.vue` files when frontend is React/Next.js
- Flask/Django code when backend is Node.js
- `yarn.lock` when package manager is npm (warning, not critical)

### C. Prompt Registry & Versioning

**Location**: `apps/UnifiedPromptApp/services/prompt-api/prompt_versioning.py`

**Structure**:
```
prompts/
├── agent-library.active.json     # Currently active library
├── versions/
│   ├── 20240115_120000_a1b2c3d4.json
│   ├── 20240115_140000_e5f6g7h8.json
│   └── ...
├── candidates/
│   └── candidate_20240115_150000.json
├── changelog.md                   # Human-readable history
└── evals/
    └── cases.json                 # Evaluation test cases
```

**Features**:
- Immutable version snapshots with metadata
- Stable hashing (ignores timestamps, focuses on content)
- JSON Patch operations for structured changes
- Changelog automation
- Atomic activation (backup old active before replacing)

### D. Post-Run Reviewer

**Location**: `apps/UnifiedPromptApp/services/prompt-api/prompt_reviewer.py`

**Purpose**: Automatically analyze runs and propose improvements

**Analysis**:
- Schema validation failures → add/clarify "OUTPUT JSON ONLY" constraint
- Stack drift → strengthen stack constraint messaging
- Non-JSON output → add output format constraint
- Verification failures → adjust relevant agent prompts

**Output**: `PromptPatchPlan.json` with:
```json
{
  "run_diagnosis": {
    "root_causes": [
      {
        "type": "schema_validation_failure",
        "evidence": ["step_001", "step_003"],
        "impact": "2 steps failed schema validation"
      }
    ],
    "metrics": {
      "schema_failures": 2,
      "verification_failed": false,
      "stack_drift": false
    }
  },
  "patches": [
    {
      "target": {"agent_id": "Engineer", "field": "constraints"},
      "change_type": "edit",
      "patch": [
        {
          "op": "add",
          "path": "/-",
          "value": "OUTPUT JSON ONLY. Your response must be valid JSON matching the output_schema."
        }
      ],
      "reason": "Schema validation failed 2 times",
      "risk": "low",
      "tests_required": ["schema_validation", "output_format"]
    }
  ]
}
```

### E. Gated Auto-Apply

**Location**: `apps/UnifiedPromptApp/services/prompt-api/prompt_gates.py`

**Purpose**: CI-style validation before activating changes

**Gates**:

1. **JSON Schema Validity** - Library structure is valid
2. **Output Format Constraint** - Agents with `io_contract` have "OUTPUT JSON ONLY"
3. **Schema Drift Detection** - Prompt doesn't request keys not in `output_schema` (heuristic)
4. **Eval Suite** - Run test cases (v1: placeholder; future: full orchestrator simulation)

**Decision Logic**:

| Risk Level | Gates Pass | Action              |
|------------|-----------|---------------------|
| low        | ✅        | `auto_apply`        |
| low        | ❌        | `rejected`          |
| medium     | ✅        | `pending_approval`  |
| medium     | ❌        | `rejected`          |
| high       | ✅ or ❌  | `pending_approval`  |

## Usage

### 1. Run Orchestration (with logging)

Orchestration runs automatically create trace artifacts. The existing `orchestrator_logger.py` is already integrated.

Example integration:
```python
from orchestrator_logger import OrchestratorLogger
from stack_validator import StackValidator

# Initialize logger
logger = OrchestratorLogger(artifacts_root=Path("./artifacts"))

# Log run start
logger.log_run_metadata(
    orchestrator_version="1.5.0",
    prompt_library_hash="abc123...",
    user_goal="Build a task management API",
    context_payload={"language": "Python"},
    definition_of_done=["API created", "Tests pass"]
)

# Create stack lock early
validator = StackValidator(logger.run_dir)
validator.create_stack_lock(
    run_id=logger.run_id,
    frontend="React",
    backend="Python/FastAPI",
    db="PostgreSQL",
    package_manager="npm"
)

# Log each agent step
logger.log_step(
    step_id="step_001",
    agent_id="Engineer",
    model="gpt-4o",
    prompt_text=agent_prompt,
    input_payload=input_data,
    raw_output=output,
    timing_ms=1234.5
)

# Log decisions
logger.log_decision(
    decision_id="dec_001",
    decision_type="stack_choice",
    chosen="Python/FastAPI",
    rationale="Fast, modern, good for APIs",
    confidence=0.9,
    reversible=True,
    validation_plan="Check compatibility",
    alternatives=["Node.js/Express", "Go"]
)

# Validate artifacts against stack lock
is_valid, violations = validator.validate_artifact(Path("generated/app.py"))
if not is_valid:
    # Log conflict
    logger.log_conflict(
        conflict_id="conf_001",
        artifacts_involved=["app.py", "stack_lock.json"],
        conflict_summary=validator.get_violation_summary(violations),
        resolution="Retry with constraint",
        reason="Stack violation detected",
        followup_action="Regenerate with stack constraint message"
    )
```

### 2. Post-Run Review

After orchestration completes:

```powershell
# Review most recent run
.\scripts\Run-PromptOpsReview.ps1

# Review specific run
.\scripts\Run-PromptOpsReview.ps1 -RunId "20240115_120000_abc123"

# Review and create candidate
.\scripts\Run-PromptOpsReview.ps1 -CreateCandidate

# Review, create candidate, and auto-apply if safe
.\scripts\Run-PromptOpsReview.ps1 -CreateCandidate -AutoApply
```

**Output**:
- Analysis printed to console
- `PromptPatchPlan.json` saved to run directory
- (If `-CreateCandidate`) candidate saved to `prompts/candidates/`
- (If `-AutoApply` and approved) active library updated automatically

### 3. Manual Approval

For medium/high risk changes:

```powershell
.\scripts\Approve-PromptCandidate.ps1 -CandidatePath "prompts/candidates/candidate_20240115_150000.json"

# Skip confirmation
.\scripts\Approve-PromptCandidate.ps1 -CandidatePath $path -Force
```

**What It Does**:
1. Loads candidate library
2. Creates immutable version snapshot
3. Updates `agent-library.active.json`
4. Adds changelog entry
5. Archives candidate (renames to `.approved.json`)

### 4. Version Management

```python
from prompt_versioning import PromptRegistry

registry = PromptRegistry(Path("./prompts"))

# Load active library
active = registry.load_active_library()

# Get active hash
hash = registry.get_active_hash()

# List all versions
versions = registry.list_versions()
for v in versions:
    print(f"{v['version_id']}: {v['description']}")

# Load specific version
lib = registry.load_version("20240115_120000_abc123")

# Rollback to previous version
registry.activate_version("20240115_100000_xyz789")
```

## Configuration

### Eval Cases

Edit `prompts/evals/cases.json` to add test cases:

```json
{
  "cases": [
    {
      "case_id": "case_001_simple_api",
      "goal": "Build a REST API for managing tasks",
      "expected_outcomes": [
        "API endpoints created",
        "CRUD operations work",
        "Valid response formats"
      ],
      "context": {
        "preferred_language": "Python"
      }
    }
  ]
}
```

### Stack Lock Defaults

Set stack preferences in orchestrator configuration or early in the run based on user goal analysis.

### Risk Thresholds

Adjust risk assessment logic in `prompt_reviewer.py` `_generate_patches()` method:
- Schema failures: typically `low` risk
- Stack constraint additions: `medium` risk
- Prompt restructuring: `high` risk

## Testing

Run the test suite:

```bash
# All PromptOps tests
cd apps/UnifiedPromptApp/services/prompt-api
python -m pytest tests/test_stack_validator.py -v
python -m pytest tests/test_prompt_versioning.py -v
python -m pytest tests/test_prompt_gates.py -v

# Existing orchestrator logger tests
python -m pytest tests/test_orchestrator_logger.py -v
```

## Monitoring

### Check Run Traces

```powershell
# List recent runs
Get-ChildItem ./artifacts/runs | Sort-Object Name -Descending | Select-Object -First 5

# View run summary
Get-Content ./artifacts/runs/20240115_120000_abc123/run.json | ConvertFrom-Json

# Count schema failures in steps
Get-Content ./artifacts/runs/20240115_120000_abc123/steps.jsonl | ConvertFrom-Json | Where-Object { -not $_.schema_validation.passed } | Measure-Object
```

### Review Changelog

```bash
cat prompts/changelog.md
```

### Check Active Library Version

```python
from prompt_versioning import PromptRegistry
registry = PromptRegistry(Path("./prompts"))
print(f"Active hash: {registry.get_active_hash()}")
```

## Troubleshooting

### Logging Errors

If logging fails, check `logger.get_logging_errors()`:

```python
if logger.has_logging_errors():
    for error in logger.get_logging_errors():
        print(f"Logging error: {error}")
```

Logging is fail-open, so orchestration continues even if logging fails.

### Gates Failing

Review gate results:

```python
decision, gate_results, eval_results = gates.validate_candidate(candidate, "low")

for gate in gate_results:
    if not gate.passed:
        print(f"FAILED: {gate.gate_name}")
        print(f"  {gate.details}")
```

Common issues:
- **JSON schema validity**: Check library structure has `agents` list with `id` fields
- **Output format**: Add "OUTPUT JSON ONLY" to `constraints` for agents with `io_contract`
- **Schema drift**: Review prompt to ensure it doesn't request keys not in `output_schema`

### Patch Application Errors

If patches fail to apply:

```python
success, result, errors = registry.apply_patch(library, patch)
if not success:
    for error in errors:
        print(f"Patch error: {error}")
```

Check that JSON pointer paths in patch operations match library structure.

## Security

### Secret Redaction

All logs automatically redact:
- API keys (`api_key: ...`)
- Tokens (`token: ...`, `Authorization: Bearer ...`)
- Passwords (`password: ...`)
- Client secrets (`client_secret: ...`)
- AWS credentials (`aws_secret_access_key: ...`)

Custom patterns can be added to `SECRET_PATTERNS` in `orchestrator_logger.py`.

### Manual Review

Always review candidates before approval, especially:
- **High risk** changes
- Changes to **security-critical** agents (auth, data validation)
- Changes proposing **new constraints** that might limit functionality

## Future Enhancements

- **Live Eval Execution**: Run full orchestrator simulations for eval cases
- **A/B Testing**: Deploy candidate to subset of runs and compare metrics
- **Regression Detection**: Track quality metrics across versions
- **Automatic Rollback**: Revert if new version performs worse
- **Multi-Agent Diff**: Visual diff of agent library changes
- **Prompt Telemetry**: Track which prompts are used most, which fail most

## Reference

### File Locations

- **Orchestrator Logger**: `apps/UnifiedPromptApp/services/prompt-api/orchestrator_logger.py`
- **Stack Validator**: `apps/UnifiedPromptApp/services/prompt-api/stack_validator.py`
- **Prompt Versioning**: `apps/UnifiedPromptApp/services/prompt-api/prompt_versioning.py`
- **Prompt Reviewer**: `apps/UnifiedPromptApp/services/prompt-api/prompt_reviewer.py`
- **Prompt Gates**: `apps/UnifiedPromptApp/services/prompt-api/prompt_gates.py`
- **Review CLI**: `scripts/Run-PromptOpsReview.ps1`
- **Approval CLI**: `scripts/Approve-PromptCandidate.ps1`
- **Tests**: `apps/UnifiedPromptApp/services/prompt-api/tests/test_*.py`

### Schemas

- **RunMetadata**: `orchestrator_schemas.py`
- **StepEvent**: `orchestrator_schemas.py`
- **Decision**: `orchestrator_schemas.py`
- **Conflict**: `orchestrator_schemas.py`
- **StackLock**: `stack_validator.py`
- **PromptPatch**: `prompt_versioning.py`
- **PromptPatchPlan**: `prompt_reviewer.py`
- **GateDecision**: `prompt_gates.py`

---

**For questions or issues**, see [GitHub Issues](https://github.com/xfaith4/UnifiedAIToolbox/issues) or the main [README.md](../README.md).
