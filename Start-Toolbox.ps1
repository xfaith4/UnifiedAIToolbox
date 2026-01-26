<#
.SYNOPSIS
    UnifiedAIToolbox - Simple Launcher for Windows

.DESCRIPTION
    Launches the UnifiedAIToolbox FastAPI backend and Next.js web portal.

.EXAMPLE
    .\Start-Toolbox.ps1
    # Launches all services

.NOTES
    Requires: Python 3.12+, Node.js 18+, PowerShell 7+
#>

[CmdletBinding()]
param(
    [int]$RunSeconds = 0
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

Write-Host "UnifiedAIToolbox Launcher" -ForegroundColor Cyan
Write-Host ""

# Check for .env file
$envFile = Join-Path $ProjectRoot ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "WARNING: .env file not found. Creating from template..." -ForegroundColor Yellow
    Copy-Item (Join-Path $ProjectRoot ".env.example") $envFile
    Write-Host "Please edit .env and add your OPENAI_API_KEY" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to continue after editing .env"
}

# Load environment variables
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^([^#][^=]+)=(.*)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()

        # Support inline comments like: KEY=value  # comment
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        } else {
            $value = ($value -replace '\s+#.*$', '').Trim()
        }

        [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
}

# Check for OpenAI API key
if ([string]::IsNullOrEmpty($env:OPENAI_API_KEY) -or $env:OPENAI_API_KEY -eq "sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx") {
    Write-Host "ERROR: OPENAI_API_KEY not set in .env" -ForegroundColor Red
    Write-Host "   Please edit .env and add your OpenAI API key" -ForegroundColor Red
    exit 1
}

$ApiPort = if ($env:API_PORT) { $env:API_PORT } else { "8000" }
$WebPort = if ($env:WEB_PORT) { $env:WEB_PORT } else { "3000" }

Write-Host "Installing dependencies..." -ForegroundColor Cyan
Write-Host ""

# Create virtual environment (prefer repo-root .venv, fall back to .uaitoolbox/.venv when .venv is locked)
$primaryVenvPath = Join-Path $ProjectRoot ".venv"
$fallbackVenvPath = Join-Path $ProjectRoot ".uaitoolbox\.venv"
$venvPath = $primaryVenvPath

function Test-VenvOk([string]$Path) {
    $venvPythonLocal = Join-Path $Path "Scripts\python.exe"
    $pipExeLocal = Join-Path $Path "Scripts\pip.exe"
    return (Test-Path $Path) -and (Test-Path $venvPythonLocal) -and (Test-Path (Join-Path $Path "pyvenv.cfg")) -and (Test-Path $pipExeLocal)
}

if ((Test-Path $venvPath) -and (-not (Test-VenvOk $venvPath))) {
    Write-Host "  WARNING: Detected an incomplete .venv. Recreating it..." -ForegroundColor Yellow
    try {
        Remove-Item -Recurse -Force $venvPath
    } catch {
        Write-Host "  WARNING: Could not remove $venvPath (it may be in use). Using $fallbackVenvPath instead." -ForegroundColor Yellow
        $venvPath = $fallbackVenvPath
    }
}

if (-not (Test-Path $venvPath)) {
    $venvParent = Split-Path -Parent $venvPath
    if (-not (Test-Path $venvParent)) {
        New-Item -ItemType Directory -Path $venvParent | Out-Null
    }

    Write-Host "  -> Creating Python virtual environment..." -ForegroundColor Gray
    # Create venv without pip to avoid ensurepip hang on Windows
    python -m venv --without-pip $venvPath
    
    # Install pip using get-pip.py (more reliable on Windows)
    Write-Host "  -> Installing pip..." -ForegroundColor Gray
    $venvPython = Join-Path $venvPath "Scripts\python.exe"
    $getPipUrl = "https://bootstrap.pypa.io/get-pip.py"
    $getPipPath = Join-Path $env:TEMP "get-pip.py"
    try {
        Invoke-WebRequest -Uri $getPipUrl -OutFile $getPipPath -UseBasicParsing
        & $venvPython $getPipPath --quiet
        Remove-Item $getPipPath -ErrorAction SilentlyContinue
    } catch {
        Write-Host "  WARNING: Could not download get-pip.py, trying ensurepip..." -ForegroundColor Yellow
        & $venvPython -m ensurepip --upgrade
    }
}

# Refresh paths after potential recreation / fallback
$venvPython = Join-Path $venvPath "Scripts\python.exe"
$pipExe = Join-Path $venvPath "Scripts\pip.exe"
if (-not (Test-Path $venvPython) -or -not (Test-Path $pipExe)) {
    throw "Python virtual environment is missing expected executables. Delete '$venvPath' and rerun Start-Toolbox.ps1."
}

# Install Python dependencies
Write-Host "  -> Installing Python packages..." -ForegroundColor Gray
& $venvPython -m pip install -q -r (Join-Path $ProjectRoot "requirements.txt")

# Install Node dependencies
Write-Host "  -> Installing Node packages..." -ForegroundColor Gray
$webappPath = Join-Path $ProjectRoot "apps\unifiedtoolbox.webapp"
Push-Location $webappPath
if (-not (Test-Path "node_modules")) {
    npm install --silent --no-audit --no-fund
}
Pop-Location

Write-Host ""
Write-Host "Starting services..." -ForegroundColor Cyan
Write-Host ""

# Best-effort cleanup helper (kills child processes like Uvicorn reload + Next.js dev server trees)
function Stop-ProcessTree([int]$Pid) {
    if ($Pid -le 0) { return }
    try { & taskkill.exe /PID $Pid /T /F | Out-Null } catch { }
}

$apiProc = $null
$webProc = $null

try {
# Create logs directory
$logsDir = Join-Path $ProjectRoot "logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir | Out-Null
}

# Start API in background
Write-Host "  -> Starting API (port $ApiPort)..." -ForegroundColor Gray
$apiPath = Join-Path $ProjectRoot "apps\UnifiedPromptApp\services\prompt-api"
$apiOutLog = Join-Path $logsDir "api.log"
$apiErrLog = Join-Path $logsDir "api.err.log"

if ([string]::IsNullOrWhiteSpace($env:PYTHONPATH)) {
    $env:PYTHONPATH = "$ProjectRoot"
} else {
    $env:PYTHONPATH = "$ProjectRoot;$env:PYTHONPATH"
}
$env:PROMPT_API_PORT = "$ApiPort"

$apiProc = Start-Process `
    -FilePath $venvPython `
    -ArgumentList @("app.py") `
    -WorkingDirectory $apiPath `
    -RedirectStandardOutput $apiOutLog `
    -RedirectStandardError $apiErrLog `
    -NoNewWindow `
    -PassThru

Start-Sleep -Seconds 3

# Start Web Portal in background
Write-Host "  -> Starting Web Portal (port $WebPort)..." -ForegroundColor Gray
$webOutLog = Join-Path $logsDir "webapp.log"
$webErrLog = Join-Path $logsDir "webapp.err.log"

$env:PORT = "$WebPort"
$env:NEXT_PUBLIC_API_BASE = "http://localhost:$ApiPort"

$npmPath = (Get-Command npm).Source
$webProc = Start-Process `
    -FilePath $npmPath `
    -ArgumentList @("run", "dev") `
    -WorkingDirectory $webappPath `
    -RedirectStandardOutput $webOutLog `
    -RedirectStandardError $webErrLog `
    -NoNewWindow `
    -PassThru

Start-Sleep -Seconds 5

Write-Host ""
Write-Host "UnifiedAIToolbox is running!" -ForegroundColor Green
Write-Host ""
Write-Host "  Web Portal:  http://localhost:$WebPort" -ForegroundColor Cyan
Write-Host "  API Docs:    http://localhost:$ApiPort/docs" -ForegroundColor Cyan
Write-Host "  Health:      http://localhost:$ApiPort/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Logs:        Get-Content logs\\*.log -Tail 50" -ForegroundColor Gray
Write-Host ""
Write-Host "Press Ctrl+C to stop all services." -ForegroundColor Yellow
Write-Host ""

    # Keep script running
    $startedAt = Get-Date
    while ($true) {
        Start-Sleep -Seconds 1

        if ($RunSeconds -gt 0) {
            $elapsed = (Get-Date) - $startedAt
            if ($elapsed.TotalSeconds -ge $RunSeconds) {
                Write-Host "RunSeconds elapsed; stopping services..." -ForegroundColor Yellow
                break
            }
        }

        if (($null -eq $apiProc) -or ($null -eq $webProc) -or $apiProc.HasExited -or $webProc.HasExited) {
            Write-Host "WARNING: A service stopped unexpectedly. Check logs for details." -ForegroundColor Yellow
            break
        }
    }
} finally {
    Write-Host ""
    Write-Host "Stopping services..." -ForegroundColor Yellow

    if ($null -ne $webProc) { Stop-ProcessTree $webProc.Id }
    if ($null -ne $apiProc) { Stop-ProcessTree $apiProc.Id }
}
