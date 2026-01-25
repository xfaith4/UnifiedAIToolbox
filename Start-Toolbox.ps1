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
param()

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

Write-Host "🚀 UnifiedAIToolbox Launcher" -ForegroundColor Cyan
Write-Host ""

# Check for .env file
$envFile = Join-Path $ProjectRoot ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "⚠️  .env file not found. Creating from template..." -ForegroundColor Yellow
    Copy-Item (Join-Path $ProjectRoot ".env.example") $envFile
    Write-Host "📝 Please edit .env and add your OPENAI_API_KEY" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to continue after editing .env"
}

# Load environment variables
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^([^#][^=]+)=(.*)$') {
        [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
    }
}

# Check for OpenAI API key
if ([string]::IsNullOrEmpty($env:OPENAI_API_KEY) -or $env:OPENAI_API_KEY -eq "sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx") {
    Write-Host "❌ Error: OPENAI_API_KEY not set in .env" -ForegroundColor Red
    Write-Host "   Please edit .env and add your OpenAI API key" -ForegroundColor Red
    exit 1
}

$ApiPort = if ($env:API_PORT) { $env:API_PORT } else { "8000" }
$WebPort = if ($env:WEB_PORT) { $env:WEB_PORT } else { "3000" }

Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
Write-Host ""

# Create and activate virtual environment
$venvPath = Join-Path $ProjectRoot ".venv"
if (-not (Test-Path $venvPath)) {
    Write-Host "  → Creating Python virtual environment..." -ForegroundColor Gray
    # Create venv without pip to avoid ensurepip hang on Windows
    python -m venv --without-pip $venvPath
    
    # Install pip using get-pip.py (more reliable on Windows)
    Write-Host "  → Installing pip..." -ForegroundColor Gray
    $venvPython = Join-Path $venvPath "Scripts\python.exe"
    $getPipUrl = "https://bootstrap.pypa.io/get-pip.py"
    $getPipPath = Join-Path $env:TEMP "get-pip.py"
    try {
        Invoke-WebRequest -Uri $getPipUrl -OutFile $getPipPath -UseBasicParsing
        & $venvPython $getPipPath --quiet
        Remove-Item $getPipPath -ErrorAction SilentlyContinue
    } catch {
        Write-Host "  ⚠️  Warning: Could not download get-pip.py, trying ensurepip..." -ForegroundColor Yellow
        & $venvPython -m ensurepip --upgrade
    }
}

# Activate virtual environment
$activateScript = Join-Path $venvPath "Scripts\Activate.ps1"
& $activateScript

# Install Python dependencies
Write-Host "  → Installing Python packages..." -ForegroundColor Gray
pip install -q -r (Join-Path $ProjectRoot "requirements.txt")

# Install Node dependencies
Write-Host "  → Installing Node packages..." -ForegroundColor Gray
$webappPath = Join-Path $ProjectRoot "apps\unifiedtoolbox.webapp"
Push-Location $webappPath
if (-not (Test-Path "node_modules")) {
    npm install --silent --no-audit --no-fund
}
Pop-Location

Write-Host ""
Write-Host "🎯 Starting services..." -ForegroundColor Cyan
Write-Host ""

# Create logs directory
$logsDir = Join-Path $ProjectRoot "logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir | Out-Null
}

# Start API in background
Write-Host "  → Starting API (port $ApiPort)..." -ForegroundColor Gray
$apiPath = Join-Path $ProjectRoot "apps\UnifiedPromptApp\services\prompt-api"
$apiLog = Join-Path $logsDir "api.log"
$env:PYTHONPATH = "$ProjectRoot;$env:PYTHONPATH"
$apiJob = Start-Job -ScriptBlock {
    param($apiPath, $apiLog, $venvPath)
    & "$venvPath\Scripts\Activate.ps1"
    Set-Location $apiPath
    python app.py *> $apiLog
} -ArgumentList $apiPath, $apiLog, $venvPath

Start-Sleep -Seconds 3

# Start Web Portal in background
Write-Host "  → Starting Web Portal (port $WebPort)..." -ForegroundColor Gray
$webLog = Join-Path $logsDir "webapp.log"
$env:NEXT_PUBLIC_API_BASE = "http://localhost:$ApiPort"
$env:PORT = $WebPort
$webJob = Start-Job -ScriptBlock {
    param($webappPath, $webLog, $port)
    Set-Location $webappPath
    $env:PORT = $port
    npm run dev *> $webLog
} -ArgumentList $webappPath, $webLog, $WebPort

Start-Sleep -Seconds 5

Write-Host ""
Write-Host "✅ UnifiedAIToolbox is running!" -ForegroundColor Green
Write-Host ""
Write-Host "  🌐 Web Portal:  http://localhost:$WebPort" -ForegroundColor Cyan
Write-Host "  🔧 API Docs:    http://localhost:$ApiPort/docs" -ForegroundColor Cyan
Write-Host "  💊 Health:      http://localhost:$ApiPort/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "  📋 Logs:        Get-Content logs\*.log -Tail 50" -ForegroundColor Gray
Write-Host ""
Write-Host "Press Ctrl+C to stop all services." -ForegroundColor Yellow
Write-Host ""

# Keep script running
try {
    while ($true) {
        Start-Sleep -Seconds 1
        
        # Check if jobs are still running
        if ($apiJob.State -ne "Running" -or $webJob.State -ne "Running") {
            Write-Host "⚠️  A service stopped unexpectedly. Check logs for details." -ForegroundColor Yellow
            break
        }
    }
} finally {
    Write-Host ""
    Write-Host "🛑 Stopping services..." -ForegroundColor Yellow
    Stop-Job $apiJob, $webJob -ErrorAction SilentlyContinue
    Remove-Job $apiJob, $webJob -Force -ErrorAction SilentlyContinue
}
