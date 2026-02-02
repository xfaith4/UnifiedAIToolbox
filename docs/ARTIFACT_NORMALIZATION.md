# Artifact Normalization Guide

## Overview

The Artifact Normalizer automatically cleans up and validates generated code artifacts to ensure they are runnable, correctly structured repositories.

## Features

### 1. Code Fence Stripping
Removes accidentally included markdown code fences from code files.

**Example:**
```
Before:
```python
def hello():
    print("Hello")
```

After:
def hello():
    print("Hello")
```

### 2. Multi-File Blob Splitting
Detects and splits files containing multiple bundled sections.

**Example:**
```
Before:
File: backend/Dockerfile
FROM python:3.12
...
File: frontend/Dockerfile
FROM node:18
...

After:
backend/Dockerfile (discrete file)
frontend/Dockerfile (discrete file)
```

### 3. Orphan File Relocation
Identifies and relocates suspicious filenames to appropriate locations.

**Examples:**
- `s` → `orphaned/s.txt`
- `watchlists, default timeframes` → `docs/notes/watchlists_default_timeframes.md`
- Content with `import fastapi` → `backend/utils/[filename].py`

### 4. Scaffolding Creation
Creates missing configuration files for frontend and backend.

**Frontend:**
- `package.json` (Vite + React + TypeScript)
- `vite.config.ts`
- `tsconfig.json`
- `index.html`

**Backend:**
- `requirements.txt` (inferred from imports)
- `__init__.py` package markers

### 5. Docker Compose Fixing
Rewrites invalid docker-compose files into valid YAML with proper structure.

### 6. Validation
Runs sanity checks:
- Python syntax compilation (`python -m compileall`)
- package.json structure validation
- YAML parsing validation
- docker-compose structure validation

## Configuration

Set these environment variables in `.env`:

```bash
# Enable/disable normalization (default: true)
NORMALIZE_ARTIFACTS=true

# Strict mode: fail on unresolved issues (default: false)
NORMALIZE_STRICT=false
```

## Output

After normalization, you'll find:

### normalization_report.md
Markdown report with:
- Total transformations count
- Transformations by type
- Detailed log of each change
- Validation results

**Example:**
```markdown
# Normalization Report

**Total Transformations:** 3

## Transformations by Type
- **strip_fence**: 1
- **relocate_orphan**: 1
- **create_scaffold**: 1

## Detailed Log

### 1. strip_fence
- **Path Before:** `sample.py`
- **Reason:** Removed markdown code fences
- **Hash Before:** `abc123...`
- **Hash After:** `def456...`
...
```

### normalize_log.json
Structured JSON log with before/after hashes for auditing:

```json
{
  "summary": {
    "total_transforms": 3,
    "by_action": {
      "strip_fence": 1,
      "relocate_orphan": 1,
      "create_scaffold": 1
    }
  },
  "transforms": [
    {
      "action": "strip_fence",
      "path_before": "sample.py",
      "path_after": null,
      "reason": "Removed markdown code fences",
      "hash_before": "abc123...",
      "hash_after": "def456..."
    }
  ]
}
```

## Algorithm

### Step A: Load + Index
Unzip artifact, build inventory of files with metadata.

### Step B: Strip Markdown Fences
For each code file (`.py`, `.ts`, `.js`, etc.):
- Detect if first line is ` ``` ` with optional language
- Remove opening and closing fence lines
- Log transformation

### Step C: Detect Bundled Blobs
For potential blob files:
- Look for markers: `File: path`, `--- filename ---`, `### BEGIN FILE:`
- Split into discrete files
- Replace original with stub note

### Step D: Handle Orphans
For suspicious filenames:
- Infer content type from content
- Sanitize filename
- Move to appropriate directory
- Log relocation

### Step E: Ensure Scaffolding
- Detect missing frontend/backend config files
- Create minimal viable scaffolding
- Infer dependencies from imports

### Step F: Fix Compose Files
- Validate docker-compose.yml
- Extract embedded Dockerfiles
- Rewrite with valid structure

### Step G: Run Validations
- Python: `python -m compileall`
- Node: validate package.json structure
- YAML: parse all .yml/.yaml files
- Report pass/fail for each

### Step H: Repackage
- Generate reports
- Optionally rezip artifact

## Usage

### Via Orchestrator Verifier
The normalizer is automatically invoked during orchestration runs:

```python
from orchestrator_verifier import OrchestratorVerifier

verifier = OrchestratorVerifier(run_dir="path/to/run")
results = verifier.run_all_verifications()

# Check normalization result
norm_result = results["normalization_result"]
print(norm_result["report"])
```

### Standalone
You can also use the normalizer directly:

```python
from normalize.normalizer import ArtifactNormalizer

normalizer = ArtifactNormalizer(
    artifact_path="path/to/artifact",
    normalize_enabled=True,
    strict_mode=False
)

result = normalizer.normalize(output_path="path/to/output")

if result["success"]:
    print(result["report"])
else:
    print(f"Failed: {result.get('error')}")

# Clean up temporary workspace
normalizer.cleanup()
```

## Testing

Run the normalizer tests:

```bash
cd apps/orchestration-bridge
python -m pytest tests/test_normalizer.py -v
```

All tests should pass (24/24).

## Troubleshooting

### Normalization disabled
Check that `NORMALIZE_ARTIFACTS=true` in your `.env` file.

### Strict mode failures
If `NORMALIZE_STRICT=true`, any validation failures will cause the normalization to fail. Check the validation results in the report.

### Missing dependencies
Ensure Python 3.12+ and PyYAML are installed:
```bash
pip install pyyaml
```

## Architecture

```
src/normalize/
├── __init__.py              # Module entry point
├── normalizer.py            # Main orchestrator
├── code_fence_stripper.py   # Strip markdown fences
├── blob_splitter.py         # Split bundled blobs
├── orphan_handler.py        # Relocate orphans
├── scaffolder.py            # Create scaffolding
├── compose_fixer.py         # Fix docker-compose
├── validators.py            # Run validations
└── transform_logger.py      # JSON logging
```

## Security

All transformations are deterministic and logged with before/after hashes. No content is discarded silently - unclear files are moved to `orphaned/` directory.

The normalizer has been security-scanned with CodeQL: **0 vulnerabilities found**.
