# Wiring Matrix - Unified AI Toolbox

## Overview

This document serves as the definitive guide to all active components in the Unified AI Toolbox, their build/run commands, and how to launch them.

**Last Updated**: December 2025  
**Repository**: xfaith4/UnifiedAIToolbox

---

## Components Overview

### Web Applications

| Component | Type | Root Path | Entry / Main File | Build Command | Run Command | URL/Port | Notes |
|-----------|------|-----------|-------------------|---------------|-------------|----------|-------|
| **dashboard** | React + Vite + TypeScript | `apps/dashboard` | `src/main.tsx` | `npm run build` | `npm run dev` | http://localhost:5173 | Main monitoring/NOC UI |
| **unifiedtoolbox.webapp** | Next.js + React + TypeScript | `apps/unifiedtoolbox.webapp` | Next.js app router | `npm run build` | `npm run dev` | http://localhost:3000 | Unified web portal |

### Desktop Applications

| Component | Type | Root Path | Entry / Main File | Build Command | Run Command | URL/Port | Notes |
|-----------|------|-----------|-------------------|---------------|-------------|----------|-------|
| **OrchestrationDesktop** | .NET 8 WPF | `apps/OrchestrationDesktop` | `App.xaml.cs` | `dotnet build` | `dotnet run` | Desktop App | Native Windows orchestration UI |
| **OrchestrationDesktopLauncher** | .NET 8 Console | `apps/OrchestrationDesktopLauncher` | `Program.cs` | `dotnet build` | `dotnet run` | Desktop App | Lightweight launcher for desktop app |

### PowerShell Tools

| Component | Type | Root Path | Entry / Main File | Build Command | Run Command | URL/Port | Notes |
|-----------|------|-----------|-------------------|---------------|-------------|----------|-------|
| **PromptRefiner** | PowerShell | `apps/PromptRefiner` | `OpenAI_Refiner.ps1` | N/A | `pwsh -File OpenAI_Refiner.ps1` | CLI | AI-powered prompt refinement |
| **PromptRefiner (GUI)** | PowerShell + WPF | `apps/PromptRefiner` | `OpenAI_Refiner.Wpf.ps1` | N/A | `pwsh -sta -File OpenAI_Refiner.Wpf.ps1` | GUI | WPF UI for prompt refinement |

### Python Services

| Component | Type | Root Path | Entry / Main File | Build Command | Run Command | URL/Port | Notes |
|-----------|------|-----------|-------------------|---------------|-------------|----------|-------|
| **prompt-api** | FastAPI + Python | `Orchestration/.../prompt-api` | `app.py` | `pip install -r requirements.txt` | `uvicorn app:app --host 0.0.0.0 --port 8000` | http://localhost:8000 | REST API for prompts & orchestration |
| **orchestration-bridge** | Python CLI | `apps/orchestration-bridge` | `bridge.py` | N/A | `python bridge.py [cmd]` | CLI | Bridge between prompts and workflows |

### Orchestration Components

| Component | Type | Root Path | Entry / Main File | Build Command | Run Command | URL/Port | Notes |
|-----------|------|-----------|-------------------|---------------|-------------|----------|-------|
| **MilestoneController** | PowerShell | `Orchestration` | `MilestoneController.ps1` | N/A | `pwsh -File MilestoneController.ps1` | CLI | Main orchestration dispatcher |
| **AI-Orchestration** | PowerShell | `Orchestration/AI-Orchestration/scripts` | `MilestoneController.ps1` | N/A | (via dispatcher) | CLI | Core orchestration engine |
| **codex-multiagent-swarm** | PowerShell | `Orchestration/AI-Orchestration/codex-multiagent-swarm` | `Orchestrate-Codex.ps1` | N/A | `pwsh -File Orchestrate-Codex.ps1` | CLI | Multi-agent code review |
| **UnifiedPromptApp** | Mixed (PowerShell + Python) | `Orchestration/UnifiedPromptApp` | Various | N/A | See prompt-api | Mixed | Unified prompt management |

### Supporting Modules

| Component | Type | Root Path | Entry / Main File | Build Command | Run Command | URL/Port | Notes |
|-----------|------|-----------|-------------------|---------------|-------------|----------|-------|
| **PromptLibrary** | PowerShell Module | `modules/PromptLibrary` | `PromptLibrary.psd1` | N/A | `Import-Module` | N/A | Prompt management module |

---

## Quick Start Guide

### "I want to start the main web portal"

```bash
# Option 1: Universal launcher (starts everything)
./launch.sh

# Option 2: PowerShell launcher (Windows)
./Launch.ps1

# Option 3: Just the web UI (React dashboard)
./Start-WebUI.ps1

# Access at:
# - Dashboard: http://localhost:5173
# - Portal: http://localhost:3000
# - API: http://localhost:8000
```

### "I want to run a smoke test"

```powershell
# Quick structural check
./Smoketest-Matrix.ps1 -Quick

# Full component health check
./Smoketest-Matrix.ps1

# Skip integration tests
./Smoketest-Matrix.ps1 -SkipIntegration
```

### "I want to start just the backend API"

```bash
cd Orchestration/UnifiedPromptApp/services/prompt-api

# First time setup
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\Activate.ps1 on Windows
pip install -r requirements.txt

# Run the API
uvicorn app:app --reload --host 0.0.0.0 --port 8000

# Access at: http://localhost:8000
# API docs at: http://localhost:8000/docs
```

### "I want to run the orchestrator"

```powershell
# Run via dispatcher (recommended)
pwsh -File ./Orchestration/MilestoneController.ps1 -Goal "Your goal here"

# Or use the main launch script which includes orchestration
./Launch.ps1 -Goal "Your goal here" -Model "gpt-4"
```

### "I want to refine a prompt"

```powershell
# CLI version
cd apps/PromptRefiner
pwsh -File OpenAI_Refiner.ps1

# GUI version (Windows)
pwsh -NoProfile -sta -File OpenAI_Refiner.Wpf.ps1
```

### "I want to start the desktop orchestration app"

```powershell
cd apps/OrchestrationDesktop
dotnet build
dotnet run

# Or run the compiled executable
./bin/Debug/net8.0-windows/OrchestrationDesktop.exe
```

### "I want to use the prompt library interactively"

```powershell
./Run-Prompt.ps1

# Or with specific prompt ID
./Run-Prompt.ps1 -PromptId "examples.analytics.divisions.performance.summary" -AutoRun
```

---

## Root-Level Launch Scripts Reference

### Launch.ps1
**Purpose**: Full-stack unified launcher  
**Starts**: Backend API + Dashboard + Orchestration  
**Platform**: Windows (PowerShell)  
**Usage**:
```powershell
./Launch.ps1
./Launch.ps1 -Goal "Custom goal" -Model "gpt-4"
```

### launch.sh  
**Purpose**: Universal launcher with verification  
**Starts**: Prompt API + Dashboard + Web Portal  
**Platform**: Linux / macOS / WSL  
**Usage**:
```bash
./launch.sh
./launch.sh --backend-only
./launch.sh --skip-checks
```

### Start-WebUI.ps1
**Purpose**: Launch React/Vite dashboard with port management  
**Starts**: Dashboard only (apps/dashboard)  
**Platform**: Windows (PowerShell)  
**Usage**:
```powershell
./Start-WebUI.ps1
./Start-WebUI.ps1 -Port 5173
./Start-WebUI.ps1 -Port 8080 -Force  # Kill process on port if needed
```

### Launch-Portal.bat
**Purpose**: Open HTML launch portal in browser  
**Starts**: Opens `launch-portal.html`  
**Platform**: Windows  
**Usage**:
```batch
Launch-Portal.bat
```

### Run-Prompt.ps1
**Purpose**: Interactive prompt runner  
**Starts**: Interactive prompt selection and execution  
**Platform**: Cross-platform (PowerShell)  
**Usage**:
```powershell
./Run-Prompt.ps1
./Run-Prompt.ps1 -PromptId "example.prompt" -AutoRun
```

### Smoketest.ps1
**Purpose**: Basic smoke test (legacy)  
**Starts**: N/A - runs tests only  
**Platform**: Cross-platform (PowerShell)  
**Usage**:
```powershell
./Smoketest.ps1
```

### Smoketest-Matrix.ps1
**Purpose**: Comprehensive smoke test matrix  
**Starts**: N/A - runs tests only  
**Platform**: Cross-platform (PowerShell)  
**Usage**:
```powershell
./Smoketest-Matrix.ps1
./Smoketest-Matrix.ps1 -Quick
./Smoketest-Matrix.ps1 -SkipIntegration
```

---

## Port Reference

| Service | Default Port | Configurable Via | Used By |
|---------|--------------|------------------|---------|
| Prompt API | 8000 | `PROMPT_API_PORT`, `API_PORT` | Backend orchestration |
| Dashboard (Vite) | 5173 | `VITE_PORT`, `FRONTEND_PORT` | Web monitoring UI |
| Web Portal (Next.js) | 3000 | `PORT`, `WEB_PORT` | Main web interface |

---

## Prerequisites by Component

### General
- **Node.js 18+** - Required for dashboard and webapp
- **Python 3.12+** - Required for prompt-api and orchestration-bridge
- **PowerShell 7.4+** - Required for orchestration and PowerShell tools
- **.NET 8 SDK** - Required for desktop applications

### Component-Specific

#### dashboard / webapp
```bash
npm install
```

#### prompt-api
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

#### PromptRefiner
```powershell
Install-Module ImportExcel -Scope CurrentUser
$env:OPENAI_API_KEY = "your-api-key"
```

#### OrchestrationDesktop
```powershell
dotnet restore
dotnet build
```

---

## Environment Variables

### Critical Environment Variables

| Variable | Purpose | Required By | Example |
|----------|---------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API authentication | Most AI components | `sk-...` |
| `PROMPT_API_PORT` | Port for prompt API | prompt-api, Launch.ps1 | `8000` |
| `VITE_PORT` | Port for Vite dev server | dashboard | `5173` |
| `VITE_API_URL` | API base URL for frontend | dashboard | `http://localhost:8000` |
| `PORT` | Port for Next.js | webapp | `3000` |
| `NEXT_PUBLIC_API_BASE` | API base URL for Next.js | webapp | `http://localhost:8000` |

### Optional Environment Variables

| Variable | Purpose | Default | Example |
|----------|---------|---------|---------|
| `AI_PROVIDER` | AI provider selection | `openai` | `openai`, `anthropic`, `azure` |
| `OPENAI_MODEL` | Default OpenAI model | `gpt-4o-mini` | `gpt-4`, `gpt-3.5-turbo` |
| `AI_LAUNCH_DIAGNOSTICS` | Enable AI diagnostics | `0` | `1` to enable |
| `AI_LAUNCH_MAX_RETRIES` | Max orchestration retries | `1` | Any integer |

---

## Troubleshooting

### "Port already in use"

```powershell
# For Start-WebUI.ps1, use Force to kill existing process
./Start-WebUI.ps1 -Force

# Or find and kill the process manually
netstat -ano | findstr :5173
taskkill /PID <pid> /F
```

### "Node.js not found"

Install Node.js 18+ from https://nodejs.org/

### "Python not found"

Install Python 3.12+ from https://www.python.org/

### ".NET SDK not found"

Install .NET 8 SDK from https://dotnet.microsoft.com/download

### "Module not found" (PowerShell)

```powershell
# Check if module exists
Test-Path modules/PromptLibrary/PromptLibrary.psd1

# Import manually
Import-Module ./modules/PromptLibrary/PromptLibrary.psd1
```

### "Dependencies not installed"

```bash
# For Node.js apps
cd apps/dashboard
npm install

# For Python services
cd Orchestration/UnifiedPromptApp/services/prompt-api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

## Testing & Validation

### Run Smoke Tests

```powershell
# Full smoke test suite
./Smoketest-Matrix.ps1

# Quick structural checks only
./Smoketest-Matrix.ps1 -Quick

# Skip integration tests
./Smoketest-Matrix.ps1 -SkipIntegration
```

### Verify Deployment

```bash
# After starting services with launch.sh
python scripts/verify-launch.py

# Or manually check endpoints
curl http://localhost:8000/health
curl http://localhost:5173/
curl http://localhost:3000/
```

### Component-Specific Tests

```bash
# Dashboard tests
cd apps/dashboard
npm run test

# Webapp lint
cd apps/unifiedtoolbox.webapp
npm run lint

# .NET build test
cd apps/OrchestrationDesktop
dotnet build --no-restore
```

---

## Development Workflow

### Starting Development

1. **Clone and Setup**:
   ```bash
   git clone https://github.com/xfaith4/UnifiedAIToolbox.git
   cd UnifiedAIToolbox
   ```

2. **Install Dependencies**:
   ```bash
   # Node.js apps
   cd apps/dashboard && npm install && cd ../..
   cd apps/unifiedtoolbox.webapp && npm install && cd ../..
   
   # Python services
   cd Orchestration/UnifiedPromptApp/services/prompt-api
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   cd ../../../../..
   ```

3. **Set Environment Variables**:
   ```bash
   export OPENAI_API_KEY="your-key-here"
   export API_PORT=8000
   export FRONTEND_PORT=5173
   ```

4. **Run Smoke Tests**:
   ```powershell
   ./Smoketest-Matrix.ps1
   ```

5. **Start Services**:
   ```bash
   ./launch.sh
   ```

### Making Changes

1. Make your code changes
2. Test locally with appropriate commands
3. Run smoke tests: `./Smoketest-Matrix.ps1`
4. Commit and push

---

## Architecture Notes

### Component Dependencies

```
┌─────────────────────────────────────────────────────┐
│                    User Interfaces                  │
├─────────────────────────────────────────────────────┤
│  dashboard (5173)  │  webapp (3000)  │  Desktop App │
└──────────┬──────────┴──────────┬──────┴──────────────┘
           │                     │
           └─────────┬───────────┘
                     │
                     ▼
           ┌──────────────────┐
           │  prompt-api      │
           │  (FastAPI:8000)  │
           └─────────┬────────┘
                     │
           ┌─────────┴─────────┐
           │                   │
           ▼                   ▼
    ┌─────────────┐    ┌──────────────┐
    │ Orchestrator│    │PromptLibrary │
    │ (PowerShell)│    │   (Module)   │
    └─────────────┘    └──────────────┘
```

### Launch Script Flow

```
Launch.ps1 / launch.sh
    │
    ├─> Start prompt-api (FastAPI backend)
    │       └─> Binds to port 8000
    │       └─> Connects to MilestoneController.ps1
    │
    ├─> Start dashboard (Vite dev server)
    │       └─> Binds to port 5173
    │       └─> API calls to localhost:8000
    │
    └─> Start webapp (Next.js)
            └─> Binds to port 3000
            └─> API calls to localhost:8000
```

---

## Additional Resources

- **Main README**: `/README.md`
- **Discovery Summary**: `/docs/PHASE1_DISCOVERY_SUMMARY.md`
- **Wiring Plan**: `/docs/PHASE2_WIRING_PLAN.md`
- **Project Roadmap**: `/docs/PROJECT_ROADMAP.md`
- **Orchestrator Docs**: `/docs/ORCHESTRATOR_STATUS.md`

---

**Document Version**: 1.0  
**Last Updated**: December 2025  
**Maintained By**: Repository Contributors
