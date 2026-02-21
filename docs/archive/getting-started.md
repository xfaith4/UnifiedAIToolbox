# Getting Started

Purpose: Get the Unified AI Toolbox running locally (or in demo mode) with the minimum required steps.

## Prerequisites
- Node.js 18+
- Python 3.12+
- PowerShell 7+ (recommended on Windows)
- Docker (optional, for containerized launch)

## Quick start

### Option A: Launch portal (fastest)
1. Open `launch-portal.html` in your browser.
2. Use the portal to pick and run a launch command.

### Option B: One-command launch
```bash
# Linux/Mac/WSL/Git Bash
./launch.sh
```

```powershell
# Windows PowerShell
.\Start-Toolbox.ps1
```

## Manual start (dev mode)

### Prompt API (FastAPI)
```powershell
cd apps\UnifiedPromptApp\services\prompt-api
.\.venv\Scripts\python.exe -m uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

Health check:
```powershell
Invoke-WebRequest http://localhost:8000/health | Select-Object -ExpandProperty StatusCode
```

### Web portal (Next.js)
```powershell
cd apps\unifiedtoolbox.webapp
npm run dev -- --hostname 0.0.0.0 --port 3000
```

Open:
- `http://localhost:3000`

### Dashboard (optional)
```bash
cd apps/dashboard
npm run dev
```

Open:
- `http://localhost:5173`

## Demo mode

Demo assets run without API keys and showcase the orchestration experience:

- `demo-orchestration-sim.html` — a full orchestration simulation (multi-agent run)
- `demo-animated.html` — animated overview of features and workflow

Open a demo:
```bash
start demo-orchestration-sim.html
```

If you prefer a local server:
```bash
python3 -m http.server 8080
```

Then open:
- `http://localhost:8080/demo-orchestration-sim.html`
- `http://localhost:8080/demo-animated.html`

## Configuration

Optional environment variables:
```bash
OPENAI_API_KEY=your-key-here
OPENAI_MODEL=gpt-4o-mini
```

## Notes
- `Start-Toolbox.ps1 -Mode <X> -NoWait` currently stops started processes due to a cleanup block. For automation or simulations, use the manual commands above.

## Stop services
- Stop any service with `Ctrl+C` in its terminal.

## Quality gate
```powershell
pwsh -NoProfile -ExecutionPolicy Bypass ./tools/Run-QualityGate.ps1
```

## Troubleshooting
- **Port already in use**: re-run with custom ports (e.g., `./launch.sh --api-port 8100 --frontend-port 5180`).
- **Dependencies fail**: delete `node_modules` and re-run the launcher.
- **API not reachable**: verify `http://localhost:8000/health`.

## Related docs
- [Architecture](architecture.md)
- [Orchestration](orchestration.md)
- [Integrations](integrations.md)
