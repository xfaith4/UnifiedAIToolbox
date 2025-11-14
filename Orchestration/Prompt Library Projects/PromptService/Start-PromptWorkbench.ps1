### BEGIN FILE: Start-PromptWorkbench.ps1
<#
.SYNOPSIS
  Bootstrap the AI Prompt Workbench:
  - Creates a Python venv
  - Installs deps
  - Starts FastAPI backend (port 8000)
  - Starts Streamlit UI (port 8501)

.NOTES
  Perfect for local dev. Edit as needed for service installs.
#>

[CmdletBinding()]
param(
  [string]$PythonExe = "python",
  [string]$PortApi   = "8000",
  [string]$PortUi    = "8501",
  [string]$Model     = "gpt-4o-mini"
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
$apiCmd = "$py `"$PSScriptRoot\app.py`""
Start-Process -FilePath $py -ArgumentList "`"$PSScriptRoot\app.py`"" -WindowStyle Hidden

Start-Sleep -Seconds 2

# --- Run UI ------------------------------------------------------------------
$uiCmd = "$py -m streamlit run `"$PSScriptRoot\streamlit_app.py`" --server.port $PortUi"
Start-Process -FilePath $py -ArgumentList "-m streamlit run `"$PSScriptRoot\streamlit_app.py`" --server.port $PortUi"

Write-Host "Backend: http://localhost:$PortApi" -ForegroundColor Green
Write-Host "UI:      http://localhost:$PortUi"   -ForegroundColor Green
### END FILE
