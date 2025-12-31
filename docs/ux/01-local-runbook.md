# Local Runbook (UnifiedAIToolbox UX)

This runbook is optimized for repeatable UX testing + simulations on Windows.

## Prereqs
- Node.js 18+
- Python 3.12+
- PowerShell 7+ recommended

## Start Prompt API (FastAPI)

From repo root:

```powershell
cd apps\UnifiedPromptApp\services\prompt-api

# Use the project venv if present
.\.venv\Scripts\python.exe -m uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

Health check:

```powershell
Invoke-WebRequest http://localhost:8000/health | Select-Object -ExpandProperty StatusCode
```

## Start Web Portal (Next.js)

From repo root:

```powershell
cd apps\unifiedtoolbox.webapp

# API base is read from .env.local by default
npm run dev -- --hostname 0.0.0.0 --port 3000
```

Open:
- http://localhost:3000

## Start via unified launcher (interactive)

```powershell
.\Start-Toolbox.ps1
```

Note: `Start-Toolbox.ps1 -Mode <X> -NoWait` currently stops started processes due to a `finally` cleanup block. For automation/simulations use manual commands above.

## Stop
- Stop either server with Ctrl+C in its terminal.

## Quality Gate
From repo root:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass ./tools/Run-QualityGate.ps1
```
