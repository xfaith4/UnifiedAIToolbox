<#
.SYNOPSIS
    Unified entry point for the Unified AI Toolbox.

.DESCRIPTION
    This script provides an interactive menu to launch different components of the
    Unified AI Toolbox, including the API, Dashboard, Web Portal, and orchestration.
    
    It consolidates functionality from multiple legacy launch scripts into a single,
    user-friendly interface.

.PARAMETER NonInteractive
    Skip the interactive menu and launch all services.

.EXAMPLE
    .\Start-Toolbox.ps1
    # Shows interactive menu

.EXAMPLE
    .\Start-Toolbox.ps1 -NonInteractive
    # Launches all services without prompting

.NOTES
    This script supersedes: Launch.ps1, Start-WebUI.ps1, Run-Prompt.ps1
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [switch]$NonInteractive
)

$ErrorActionPreference = "Stop"
$Script:ProjectRoot = $PSScriptRoot

# Color-coded status messages
function Write-Status {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message,
        [Parameter(Mandatory = $false)]
        [ValidateSet("Info", "Success", "Warning", "Error", "Debug")]
        [string]$Level = "Info"
    )
    
    $timestamp = Get-Date -Format "HH:mm:ss"
    $color = switch ($Level) {
        "Success" { "Green" }
        "Warning" { "Yellow" }
        "Error" { "Red" }
        "Debug" { "Gray" }
        default { "Cyan" }
    }
    
    Write-Host "[$timestamp] " -NoNewline -ForegroundColor Gray
    Write-Host $Message -ForegroundColor $color
}

# Check if a service is running on a port
function Test-PortInUse {
    param([int]$Port)
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        $listener.Stop()
        return $false
    }
    catch {
        return $true
    }
}

# Clean up stale Next.js lock files
function Clear-NextLockFile {
    param([string]$ProjectPath)
    
    $lockFile = Join-Path $ProjectPath ".next\dev\lock"
    
    if (Test-Path $lockFile) {
        try {
            Remove-Item -Path $lockFile -Force -ErrorAction Stop
            Write-Status "🧹 Removed stale Next.js lock file" -Level "Info"
            return $true
        }
        catch {
            Write-Status "⚠️  Could not remove lock file: $_" -Level "Warning"
            return $false
        }
    }
    return $true
}

# Display the main menu
function Show-Menu {
    Clear-Host
    Write-Host "`n╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║          🚀 Unified AI Toolbox - Launch Portal           ║" -ForegroundColor Cyan
    Write-Host "╚════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan
    
    # Check service status
    $apiRunning = Test-PortInUse -Port 8000
    $dashboardRunning = Test-PortInUse -Port 5173
    $webRunning = Test-PortInUse -Port 3000
    
    Write-Host "  Current Status:" -ForegroundColor White
    Write-Host "    API (8000):       " -NoNewline
    Write-Host $(if ($apiRunning) { "🟢 Running" } else { "⚫ Stopped" }) -ForegroundColor $(if ($apiRunning) { "Green" } else { "Gray" })
    Write-Host "    Dashboard (5173): " -NoNewline
    Write-Host $(if ($dashboardRunning) { "🟢 Running" } else { "⚫ Stopped" }) -ForegroundColor $(if ($dashboardRunning) { "Green" } else { "Gray" })
    Write-Host "    Web Portal (3000):" -NoNewline
    Write-Host $(if ($webRunning) { "🟢 Running" } else { "⚫ Stopped" }) -ForegroundColor $(if ($webRunning) { "Green" } else { "Gray" })
    
    Write-Host "`n  Launch Options:" -ForegroundColor White
    Write-Host "    1. 🌐 Launch Full Stack (API + Dashboard + Web Portal)" -ForegroundColor Yellow
    Write-Host "    2. 🔌 Launch API Only" -ForegroundColor Yellow
    Write-Host "    3. 📊 Launch Dashboard Only" -ForegroundColor Yellow
    Write-Host "    4. 🌍 Launch Web Portal Only" -ForegroundColor Yellow
    Write-Host "    5. 🎯 Open HTML Launch Portal" -ForegroundColor Yellow
    Write-Host "    6. 🤖 Run Orchestration" -ForegroundColor Yellow
    Write-Host "    7. 🐳 Launch with Docker" -ForegroundColor Yellow
    Write-Host "    8. ❌ Exit" -ForegroundColor Red
    
    Write-Host "`n  Select an option (1-8): " -NoNewline -ForegroundColor White
}

# Launch the FastAPI backend
function Start-API {
    Write-Status "🚀 Starting FastAPI Backend..." -Level "Info"
    
    $apiDir = Join-Path $ProjectRoot "apps\UnifiedPromptApp\services\prompt-api"
    if (-not (Test-Path $apiDir)) {
        Write-Status "❌ API directory not found at: $apiDir" -Level "Error"
        return $null
    }
    
    try {
        Push-Location $apiDir
        
        # Create virtual environment if needed
        $venvDir = Join-Path $apiDir ".venv"
        if (-not (Test-Path $venvDir)) {
            Write-Status "Creating Python virtual environment..." -Level "Info"
            python -m venv $venvDir
        }
        
        # Activate and install dependencies
        $activateScript = Join-Path $venvDir "Scripts\Activate.ps1"
        if (Test-Path $activateScript) {
            & $activateScript
            pip install -q -r requirements.txt
        }
        
        # Set environment variables
        $env:ORCHESTRATOR_PS1 = "MilestoneController.ps1"
        $env:POF_PS1 = $env:ORCHESTRATOR_PS1
        $env:PROMPT_API_PORT = 8000
        
        # Start the server
        $process = Start-Process -NoNewWindow -PassThru -FilePath "python" `
            -ArgumentList "-m", "uvicorn", "app:app", "--reload", "--host", "0.0.0.0", "--port", "8000" `
            -WorkingDirectory $apiDir
        
        Start-Sleep -Seconds 3
        
        if (Test-PortInUse -Port 8000) {
            Write-Status "✅ API running at http://localhost:8000" -Level "Success"
            Write-Status "   📖 API Docs: http://localhost:8000/docs" -Level "Info"
            return $process
        }
        else {
            Write-Status "⚠️  API may still be starting..." -Level "Warning"
            return $process
        }
    }
    catch {
        Write-Status "❌ Error starting API: $_" -Level "Error"
        return $null
    }
    finally {
        Pop-Location
    }
}

# Launch the Vite dashboard
function Start-Dashboard {
    Write-Status "🚀 Starting Vite Dashboard..." -Level "Info"
    
    $dashboardDir = Join-Path $ProjectRoot "apps\unifiedtoolbox.webapp"
    if (-not (Test-Path $dashboardDir)) {
        Write-Status "❌ Dashboard directory not found at: $dashboardDir" -Level "Error"
        return $null
    }
    
    try {
        Push-Location $dashboardDir
        
        # Install dependencies if needed
        if (-not (Test-Path "node_modules")) {
            Write-Status "Installing dependencies..." -Level "Info"
            npm install --silent
        }
        
        # Set environment variables
        $env:VITE_PORT = 5173
        $env:VITE_API_URL = "http://localhost:8000"
        $env:VITE_API_BASE = "http://localhost:8000"
        
        # Start the dev server
        $comspec = $env:ComSpec
        $process = Start-Process -FilePath $comspec `
            -ArgumentList "/c", "npm run dev -- -p 5173" `
            -WorkingDirectory $dashboardDir -NoNewWindow -PassThru
        
        Start-Sleep -Seconds 3
        Write-Status "✅ Dashboard starting at http://localhost:5173" -Level "Success"
        
        return $process
    }
    catch {
        Write-Status "❌ Error starting dashboard: $_" -Level "Error"
        return $null
    }
    finally {
        Pop-Location
    }
}

# Launch the Next.js web portal
function Start-WebPortal {
    Write-Status "🚀 Starting Next.js Web Portal..." -Level "Info"
    
    $webDir = Join-Path $ProjectRoot "apps\unifiedtoolbox.webapp"
    if (-not (Test-Path $webDir)) {
        Write-Status "❌ Web portal directory not found at: $webDir" -Level "Error"
        return $null
    }
    
    try {
        Push-Location $webDir
        
        # Clean up any stale lock files
        Clear-NextLockFile -ProjectPath $webDir | Out-Null
        
        # Install dependencies if needed
        if (-not (Test-Path "node_modules")) {
            Write-Status "Installing dependencies..." -Level "Info"
            npm install --silent
        }
        
        # Set environment variables
        $env:NEXT_PUBLIC_API_BASE = "http://localhost:8000"
        $env:PORT = 3000
        
        # Start the dev server
        $comspec = $env:ComSpec
        $process = Start-Process -FilePath $comspec `
            -ArgumentList "/c", "npm run dev -- --hostname 0.0.0.0 --port 3000" `
            -WorkingDirectory $webDir -NoNewWindow -PassThru
        
        Start-Sleep -Seconds 3
        Write-Status "✅ Web Portal starting at http://localhost:3000" -Level "Success"
        
        return $process
    }
    catch {
        Write-Status "❌ Error starting web portal: $_" -Level "Error"
        return $null
    }
    finally {
        Pop-Location
    }
}

# Open the HTML launch portal
function Open-HTMLPortal {
    $portalFile = Join-Path $ProjectRoot "launch-portal.html"
    if (Test-Path $portalFile) {
        Write-Status "🎯 Opening HTML Launch Portal..." -Level "Info"
        Start-Process $portalFile
        Write-Status "✅ Portal opened in default browser" -Level "Success"
    }
    else {
        Write-Status "❌ HTML portal not found at: $portalFile" -Level "Error"
    }
}

# Run orchestration
function Start-Orchestration {
    Write-Status "🤖 Starting Orchestration..." -Level "Info"
    
    $orchestrationScript = Join-Path $ProjectRoot "Orchestration\MilestoneController.ps1"
    if (-not (Test-Path $orchestrationScript)) {
        Write-Status "❌ Orchestration script not found at: $orchestrationScript" -Level "Error"
        return
    }
    
    $goal = Read-Host "Enter orchestration goal (or press Enter for default)"
    if ([string]::IsNullOrWhiteSpace($goal)) {
        $goal = "Run a complete analysis of the current project state"
    }
    
    $outputDir = Join-Path $ProjectRoot "apps\orchestration-bridge\runs"
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
    
    $arguments = @(
        "-NoLogo"
        "-NoProfile"
        "-ExecutionPolicy", "Bypass"
        "-File", "`"$orchestrationScript`""
        "-Goal", "`"$goal`""
        "-Model", "gpt-4o-mini"
        "-OutputDir", "`"$outputDir`""
        "-LogLevel", "Info"
    )
    
    Start-Process -FilePath "pwsh.exe" -ArgumentList $arguments -Wait -NoNewWindow
    Write-Status "✅ Orchestration completed" -Level "Success"
}

# Launch with Docker
function Start-Docker {
    Write-Status "🐳 Launching with Docker Compose..." -Level "Info"
    
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Status "❌ Docker is not installed or not in PATH" -Level "Error"
        return
    }
    
    try {
        docker compose up -d
        Write-Status "✅ Docker services started" -Level "Success"
        Write-Status "   Use 'docker compose logs -f' to view logs" -Level "Info"
        Write-Status "   Use 'docker compose down' to stop services" -Level "Info"
    }
    catch {
        Write-Status "❌ Error starting Docker: $_" -Level "Error"
    }
}

# Main execution
try {
    if ($NonInteractive) {
        Write-Host "`n=== 🚀 Unified AI Toolbox - Non-Interactive Launch ===`n" -ForegroundColor Cyan
        $apiProcess = Start-API
        $dashboardProcess = Start-Dashboard
        $webProcess = Start-WebPortal
        
        Write-Host "`n=== ✅ All Services Started ===`n" -ForegroundColor Green
        Write-Host "Press Ctrl+C to stop all services..." -ForegroundColor Yellow
        
        while ($true) {
            Start-Sleep -Seconds 60
        }
    }
    else {
        $runningProcesses = @()
        
        while ($true) {
            Show-Menu
            $choice = Read-Host
            
            switch ($choice) {
                "1" {
                    Write-Host ""
                    $apiProcess = Start-API
                    if ($apiProcess) { $runningProcesses += $apiProcess }
                    
                    $dashboardProcess = Start-Dashboard
                    if ($dashboardProcess) { $runningProcesses += $dashboardProcess }
                    
                    $webProcess = Start-WebPortal
                    if ($webProcess) { $runningProcesses += $webProcess }
                    
                    Write-Host "`n✅ All services started! Press any key to return to menu..." -ForegroundColor Green
                    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
                }
                "2" {
                    Write-Host ""
                    $apiProcess = Start-API
                    if ($apiProcess) { $runningProcesses += $apiProcess }
                    Write-Host "`nPress any key to return to menu..." -ForegroundColor Gray
                    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
                }
                "3" {
                    Write-Host ""
                    $dashboardProcess = Start-Dashboard
                    if ($dashboardProcess) { $runningProcesses += $dashboardProcess }
                    Write-Host "`nPress any key to return to menu..." -ForegroundColor Gray
                    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
                }
                "4" {
                    Write-Host ""
                    $webProcess = Start-WebPortal
                    if ($webProcess) { $runningProcesses += $webProcess }
                    Write-Host "`nPress any key to return to menu..." -ForegroundColor Gray
                    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
                }
                "5" {
                    Write-Host ""
                    Open-HTMLPortal
                    Write-Host "`nPress any key to return to menu..." -ForegroundColor Gray
                    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
                }
                "6" {
                    Write-Host ""
                    Start-Orchestration
                    Write-Host "`nPress any key to return to menu..." -ForegroundColor Gray
                    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
                }
                "7" {
                    Write-Host ""
                    Start-Docker
                    Write-Host "`nPress any key to return to menu..." -ForegroundColor Gray
                    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
                }
                "8" {
                    Write-Host "`n👋 Exiting... Stopping any running services..." -ForegroundColor Yellow
                    foreach ($proc in $runningProcesses) {
                        if ($proc -and -not $proc.HasExited) {
                            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                        }
                    }
                    Write-Host "✅ Goodbye!`n" -ForegroundColor Green
                    exit 0
                }
                default {
                    Write-Host "`n❌ Invalid choice. Please select 1-8." -ForegroundColor Red
                    Start-Sleep -Seconds 2
                }
            }
        }
    }
}
catch {
    Write-Status "❌ Error: $_" -Level "Error"
    Write-Status $_.ScriptStackTrace -Level "Error"
    exit 1
}
finally {
    # Cleanup on Ctrl+C
    if ($runningProcesses) {
        Write-Host "`n🛑 Stopping services..." -ForegroundColor Yellow
        foreach ($proc in $runningProcesses) {
            if ($proc -and -not $proc.HasExited) {
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            }
        }
        Write-Status "All services stopped." -Level "Success"
    }
}
