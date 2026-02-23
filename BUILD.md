# BUILD.md — UnifiedAIToolbox

Complete setup, build, test, and run instructions for the UnifiedAIToolbox monorepo.

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Python | 3.10+ | Prompt API (FastAPI backend) |
| Node.js | 18+ | Unified Web App (Next.js) |
| npm | 8+ | Web app package management |
| PowerShell | 7.4+ | Prompt index build scripts |

---

## Repository Layout

```
UnifiedAIToolbox/
├── apps/
│   ├── unifiedtoolbox.webapp/          # Next.js web portal
│   └── UnifiedPromptApp/
│       └── services/
│           └── prompt-api/             # FastAPI Python backend
├── apps/orchestration-bridge/          # Python orchestration bridge
├── modules/                            # PowerShell modules
├── scripts/                            # Build and utility scripts
├── tests/                              # Root-level PowerShell tests
└── data/                               # SQLite prompt database
```

---

## 1. Python Prompt API

### Setup

```bash
cd apps/UnifiedPromptApp/services/prompt-api

# Create and activate virtual environment (recommended)
python -m venv .venv
source .venv/bin/activate          # Linux/macOS
# .venv\Scripts\Activate.ps1       # Windows PowerShell

# Install all dependencies
pip install -r requirements.txt

# Install the package in editable mode (required for tests)
pip install -e .[dev]
```

### Run

```bash
cd apps/UnifiedPromptApp/services/prompt-api
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

API docs available at: <http://localhost:8000/docs>

### Test

```bash
cd apps/UnifiedPromptApp/services/prompt-api
pytest
```

Expected: all tests pass (2 known pre-existing failures unrelated to core functionality).

### Lint

```bash
cd apps/UnifiedPromptApp/services/prompt-api
flake8 . --count --select=E9,F63,F7,F82 --show-source --statistics
```

---

## 2. Unified Web App (Next.js)

### Setup

```bash
cd apps/unifiedtoolbox.webapp

# Install dependencies from lockfile (clean install)
npm ci
```

> **Note:** Run `npm ci` from within `apps/unifiedtoolbox.webapp`, **not** from the repo root.
> The webapp is intentionally excluded from the root npm workspace to allow standalone install.

### Environment

```bash
# Copy example env file
cp .env.local.example .env.local

# Edit .env.local and set:
# NEXT_PUBLIC_API_BASE=http://localhost:8000
```

### Run (Development)

```bash
cd apps/unifiedtoolbox.webapp
npm run dev
```

Web portal available at: <http://localhost:3000>

### Build (Production)

```bash
cd apps/unifiedtoolbox.webapp
npm run build
```

### Test

```bash
cd apps/unifiedtoolbox.webapp
npm run test
```

### Lint

```bash
cd apps/unifiedtoolbox.webapp
npm run lint
```

### Typecheck

```bash
cd apps/unifiedtoolbox.webapp
npm run typecheck
```

---

## 3. PowerShell Prompt Index

### Prerequisites

```powershell
Set-PSRepository PSGallery -InstallationPolicy Trusted
Install-Module Pester -Scope CurrentUser -Force -MinimumVersion 5.5.0
Install-Module PSScriptAnalyzer -Scope CurrentUser -Force
Install-Module powershell-yaml -Scope CurrentUser -Force
```

### Build Prompt Index

```powershell
./scripts/Build-Index.ps1
```

Generates: `data/prompts.db`

### Test (PowerShell)

```powershell
$env:PSModulePath = "$PWD/modules" + [IO.Path]::PathSeparator + $env:PSModulePath
Invoke-Pester -Path tests -CI -Output Detailed
```

---

## 4. Full Launch (Development)

```bash
# Linux/macOS
./launch.sh

# Windows PowerShell
.\Start-Toolbox.ps1
```

This starts both the Python API (port 8000) and the Next.js web app (port 3000).

---

## CI Verification Commands

These commands mirror what the CI pipelines execute:

```bash
# 1. Python API tests
cd apps/UnifiedPromptApp/services/prompt-api
pip install -r requirements.txt && pip install -e .[dev]
pytest

# 2. Next.js webapp
cd apps/unifiedtoolbox.webapp
npm ci
npm run lint
npm run test
npm run build

# 3. PowerShell lint (requires PSScriptAnalyzer)
Invoke-ScriptAnalyzer -Path modules -Recurse -Severity Warning -EnableExit
```

---

## Export / Release

To produce a deployable bundle:

```bash
# Build the Next.js app
cd apps/unifiedtoolbox.webapp && npm run build

# The built output is in apps/unifiedtoolbox.webapp/.next/
# Start in production mode:
npm run start
```

---

## Acceptance Checks

| Check | Command | Expected |
|-------|---------|----------|
| Python API tests pass | `pytest` | Exit 0 |
| Next.js installs cleanly | `npm ci` | Exit 0 |
| Next.js builds | `npm run build` | Exit 0 |
| Next.js tests pass | `npm run test` | Exit 0 |
| App starts | `./launch.sh` | Ports 3000+8000 up |
| API health | `curl http://localhost:8000/health` | 200 OK |
