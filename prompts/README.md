# Prompts Directory

This directory contains the versioned prompt library for PromptOps.

## Structure

```
prompts/
├── agent-library.active.json    # Currently active agent library
├── versions/                     # Immutable version history
│   ├── 20240115_120000_a1b2c3.json
│   └── ...
├── candidates/                   # Pending candidates awaiting approval
│   ├── candidate_20240115_150000.json
│   └── ...
├── changelog.md                  # Human-readable version history
└── evals/                        # Evaluation test cases
    └── cases.json
```

## Files

### agent-library.active.json

The currently active agent library used by the orchestrator. This file is atomically updated when a new version is activated.

### versions/

Immutable snapshots of the agent library. Each version file contains:
- Version metadata (timestamp, hash, description, creator)
- Complete agent library snapshot

Version filenames: `YYYYMMDD_HHMMSS_<short_hash>.json`

### candidates/

Proposed agent library updates awaiting approval. Created by `Run-PromptOpsReview.ps1 -CreateCandidate`.

Each candidate contains:
- Proposed library changes
- Gate validation results
- Risk assessment
- Decision (auto_apply, pending_approval, rejected)

### changelog.md

Human-readable history of library changes. Auto-updated when versions are created.

### evals/

Evaluation test cases for validating agent library changes.

`cases.json` contains test cases with:
- User goals
- Expected outcomes
- Context/constraints

## Usage

See [PromptOps Guide](../docs/PROMPTOPS.md) for complete documentation.

### Quick Start

```powershell
# Review most recent run and create candidate
.\scripts\Run-PromptOpsReview.ps1 -CreateCandidate

# Approve candidate
.\scripts\Approve-PromptCandidate.ps1 -CandidatePath "prompts/candidates/candidate_*.json"
```

### Python API

```python
from prompt_versioning import PromptRegistry

# Initialize registry
registry = PromptRegistry(Path("./prompts"))

# Load active library
active = registry.load_active_library()

# List versions
versions = registry.list_versions()

# Activate a version
registry.activate_version("20240115_120000_abc123")
```

## Security

- **Secret Redaction**: All logs automatically redact API keys, tokens, passwords
- **Immutable Versions**: Version files are never modified after creation
- **Backup on Activation**: Current active library is backed up before replacement

## Best Practices

1. **Always review changes**: Inspect patch plans before approval
2. **Test candidates**: Run evals before activating
3. **Document versions**: Use descriptive version descriptions
4. **Keep eval cases updated**: Add new test cases as orchestrator capabilities grow
5. **Monitor changelog**: Track what changes and why

## Troubleshooting

### No active library found

If `agent-library.active.json` doesn't exist, copy your current agent library:

```bash
cp Orchestration/agents/agent-library.json prompts/agent-library.active.json
```

### Patch application fails

Check that patches target correct agent IDs and use valid JSON Pointer paths.

### Gates failing

Review gate results to understand failures:
- **JSON schema validity**: Ensure library has valid structure
- **Output format**: Add "OUTPUT JSON ONLY" constraint to agents with io_contract
- **Schema drift**: Review prompts to ensure they don't request undefined output keys

---

For detailed documentation, see [PromptOps Guide](../docs/PROMPTOPS.md).
