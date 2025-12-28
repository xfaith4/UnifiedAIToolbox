# Launch the Unified AI Toolbox Animated Demo
# This script starts a simple HTTP server and opens the demo in your browser

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DemoFile = "demo-animated.html"
$Port = 8765

Write-Host "🚀 Launching Unified AI Toolbox Animated Demo..." -ForegroundColor Cyan
Write-Host ""

# Check if the demo file exists

$DemoPath = Join-Path $ScriptDir $DemoFile
if (-not (Test-Path $DemoPath)) {
    Write-Host "❌ Error: $DemoFile not found in $ScriptDir" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Demo file found" -ForegroundColor Green

# Check if port is already in use
$PortInUse = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($PortInUse) {
    Write-Host "⚠️  Port $Port is already in use" -ForegroundColor Yellow
    Write-Host "   Opening demo in existing server..." -ForegroundColor Yellow

    $DemoUrl = "http://localhost:$Port/$DemoFile"
    Start-Process $DemoUrl

    exit 0
}

# Start HTTP server
Write-Host "🌐 Starting HTTP server on port $Port..." -ForegroundColor Cyan

# Try to find Python
$PythonCmd = $null
if (Get-Command python3 -ErrorAction SilentlyContinue) {
    $PythonCmd = "python3"
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $PythonCmd = "python"
}

if ($null -eq $PythonCmd) {
    Write-Host "❌ Error: Python not found. Please install Python or use another HTTP server." -ForegroundColor Red
    exit 1
}

Write-Host "   Using $PythonCmd HTTP server" -ForegroundColor Gray

# Start the server
Push-Location $ScriptDir
$ServerJob = Start-Job -ScriptBlock {
    param($PythonCmd, $Port)
    & $PythonCmd -m http.server $Port --bind 127.0.0.1
} -ArgumentList $PythonCmd, $Port
Pop-Location

Write-Host "✓ Server started (Job ID: $($ServerJob.Id))" -ForegroundColor Green
Write-Host ""

# Wait for server to start
Start-Sleep -Seconds 2

# Open in browser
$DemoUrl = "http://localhost:$Port/$DemoFile"
Write-Host "🎬 Opening demo at $DemoUrl" -ForegroundColor Cyan
Write-Host ""

try {
    Start-Process $DemoUrl
} catch {
    Write-Host "⚠️  Could not automatically open browser" -ForegroundColor Yellow
    Write-Host "   Please open $DemoUrl manually" -ForegroundColor Yellow
}

Write-Host "✨ Demo is now running!" -ForegroundColor Green
Write-Host ""
Write-Host "📖 To view the demo, navigate to: $DemoUrl" -ForegroundColor White
Write-Host "🛑 To stop the server, press Ctrl+C" -ForegroundColor White
Write-Host ""

# Keep script running
try {
    while ($true) {
        Start-Sleep -Seconds 1

        # Check if job is still running
        if ($ServerJob.State -ne "Running") {
            Write-Host "⚠️  Server stopped unexpectedly" -ForegroundColor Yellow
            break
        }
    }
} finally {
    Write-Host ""
    Write-Host "🛑 Stopping server..." -ForegroundColor Yellow
    Stop-Job -Job $ServerJob -ErrorAction SilentlyContinue
    Remove-Job -Job $ServerJob -Force -ErrorAction SilentlyContinue
    Write-Host "✓ Server stopped" -ForegroundColor Green
}
