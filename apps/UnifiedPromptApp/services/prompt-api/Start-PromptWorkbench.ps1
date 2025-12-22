### BEGIN FILE: Start-PromptWorkbench.ps1
<#
.SYNOPSIS
  Bootstrap the AI Prompt Workbench:
  - Creates a Python venv
  - Installs deps
  - Starts FastAPI backend (port 8000)
  - Waits for backend to be ready via health check
  - Starts Streamlit UI (port 8501)

.NOTES
  Perfect for local dev. Edit as needed for service installs.
#>

[CmdletBinding()]
param(
  [string]$PythonExe = "python",
  [string]$PortApi   = "8000",
  [string]$PortUi    = "8501",
  [string]$Model     = "gpt-4o-mini",
  [int]$MaxHealthCheckAttempts = 10,
  [int]$HealthCheckDelaySeconds = 2,
  [switch]$FailOnBackendNotReady
)

# --- Guardrails --------------------------------------------------------------
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# --- Env setup ---------------------------------------------------------------
if (-not (Get-Command $PythonExe -ErrorAction SilentlyContinue)) {
    throw "Python not found. Install Python 3.10+ and re-run."
}

if (-not $env:OPENAI_API_KEY) {
    Write-Host "OPENAI_API_KEY not found in env vars." -ForegroundColor Yellow
    $key = Read-Host -AsSecureString "Enter your OPENAI_API_KEY"
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($key)
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    $env:OPENAI_API_KEY = $plain
}

$env:OPENAI_MODEL = $Model
$env:WORKBENCH_API = "http://localhost:$PortApi"

# --- Venv --------------------------------------------------------------------
$venvPath = Join-Path -Path $PSScriptRoot -ChildPath ".venv"
if (-not (Test-Path $venvPath)) {
    & $PythonExe -m venv $venvPath
}

$pip = Join-Path $venvPath "Scripts\pip.exe"
$py  = Join-Path $venvPath "Scripts\python.exe"

& $pip install --upgrade pip > $null
& $pip install fastapi uvicorn pydantic requests pyyaml streamlit > $null

# --- Run backend -------------------------------------------------------------
Write-Host "Starting backend service..." -ForegroundColor Cyan
$backendProcess = Start-Process -FilePath $py -ArgumentList "`"$PSScriptRoot\app.py`"" -WindowStyle Hidden -PassThru

# --- Wait for backend to be ready --------------------------------------------
Write-Host "Waiting for backend to be ready..." -ForegroundColor Cyan
$attempts = 0
$backendReady = $false
$healthUrl = "http://localhost:$PortApi/health"

while ($attempts -lt $MaxHealthCheckAttempts) {
    $attempts++
    try {
        $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
        if ($response.StatusCode -eq 200) {
            # Verify response content contains expected health check data
            $content = $response.Content | ConvertFrom-Json
            if ($content.ok -eq $true) {
                $backendReady = $true
                Write-Host "✅ Backend is ready (attempt $attempts/$MaxHealthCheckAttempts)" -ForegroundColor Green
                break
            }
        }
    } catch {
        Write-Host "⏳ Backend not ready yet (attempt $attempts/$MaxHealthCheckAttempts)..." -ForegroundColor Yellow
        Start-Sleep -Seconds $HealthCheckDelaySeconds
    }
}

if (-not $backendReady) {
    Write-Host "⚠️  Backend not ready after $MaxHealthCheckAttempts attempts." -ForegroundColor Red
    Write-Host "    Please check the backend logs for errors." -ForegroundColor Red
    Write-Host "    You can try accessing $healthUrl manually to diagnose." -ForegroundColor Yellow
    
    if ($FailOnBackendNotReady) {
        throw "Backend failed to start. Aborting UI launch."
    }
    Write-Host "    Continuing with UI launch anyway (use -FailOnBackendNotReady to abort)..." -ForegroundColor Yellow
}

# --- Run UI ------------------------------------------------------------------
Start-Process -FilePath $py -ArgumentList "-m streamlit run `"$PSScriptRoot\streamlit_app.py`" --server.port $PortUi"

Write-Host "Backend: http://localhost:$PortApi" -ForegroundColor Green
Write-Host "UI:      http://localhost:$PortUi"   -ForegroundColor Green
### END FILE
