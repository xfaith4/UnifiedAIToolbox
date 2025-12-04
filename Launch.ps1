<#
.SYNOPSIS
    Launches the Unified AI Toolbox with all necessary services and the web dashboard.

.DESCRIPTION
    This script provides a one-command launch experience for the Unified AI Toolbox:
    - Starts the FastAPI backend
    - Launches the web dashboard
    - Opens the dashboard in the default browser
    - Handles environment setup and prerequisites

.PARAMETER Goal
    The goal for the AI orchestration. If not provided, uses a default goal.

.PARAMETER Model
    The AI model to use (default: gpt-4o-mini).

.PARAMETER LogLevel
    The logging level (Info, Debug, Warning, Error). Default: Info.

.EXAMPLE
    .\Launch.ps1

.EXAMPLE
    .\Launch.ps1 -Goal "Analyze project dependencies" -Model "gpt-4" -LogLevel "Debug"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [string]$Goal = "Run a complete analysis of the current project state",
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("gpt-4o-mini", "gpt-4", "gpt-3.5-turbo")]
    [string]$Model = "gpt-4o-mini",
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("Info", "Debug", "Warning", "Error")]
    [string]$LogLevel = "Info"
)

# Set Error Action to Stop on all commands
$ErrorActionPreference = "Stop"

# Configuration
$Script:ProjectRoot = $PSScriptRoot
$DashboardDir = Join-Path $ProjectRoot "apps\dashboard"
$ApiDir = Join-Path $ProjectRoot "Orchestration\UnifiedPromptApp\services\prompt-api"
$OutputDir = Join-Path $ProjectRoot "apps\orchestration-bridge\runs"
$LogDir = Join-Path $ProjectRoot "logs"

# Create necessary directories
$null = New-Item -ItemType Directory -Force -Path $OutputDir, $LogDir
function Write-Status {
    param(
        [Parameter(Mandatory=$true)]
        [string]$Message,
        [Parameter(Mandatory=$false)]
        [ValidateSet("Info", "Success", "Warning", "Error", "Debug")]
        [string]$Level = "Info"
    )
    
    $timestamp = Get-Date -Format "HH:mm:ss"
    $color = switch ($Level) {
        "Success" { "Green" }
        "Warning" { "Yellow" }
        "Error"   { "Red" }
        "Debug"   { "Gray" }
        default   { "Cyan" }
    }
    
    Write-Host "[$timestamp] " -NoNewline -ForegroundColor Gray
    Write-Host $Message -ForegroundColor $color
}

function Start-Backend {
    Write-Status "🚀 Starting Backend API (FastAPI)..."
    
    # Ensure the API directory exists
    if (-not (Test-Path $ApiDir)) {
        Write-Status "❌ Backend directory not found at: $ApiDir" -Level "Error"
        return $null
    }

    $backendScript = Join-Path $ApiDir "app.py"
    if (-not (Test-Path $backendScript)) {
        Write-Status "❌ Backend script not found at: $backendScript" -Level "Error"
        return $null
    }

    try {
        # Create a virtual environment if it doesn't exist
        $venvDir = Join-Path $ApiDir ".venv"
        if (-not (Test-Path $venvDir)) {
            Write-Status "Creating Python virtual environment..." -Level "Info"
            python -m venv $venvDir
        }

        # Activate the virtual environment and install requirements
        $activateScript = Join-Path $venvDir "Scripts\Activate.ps1"
        if (Test-Path $activateScript) {
            & $activateScript
            pip install -r (Join-Path $ApiDir "requirements.txt") | Out-Null
        }

        # Set environment variables for the backend
        $env:ORCHESTRATOR_PS1 = "MilestoneController.ps1"
        $env:POF_PS1 = $env:ORCHESTRATOR_PS1
        $env:PROMPT_API_PORT = 8000

        # Start the FastAPI server
        Write-Status "Starting FastAPI server..." -Level "Info"
        $backendProcess = Start-Process -NoNewWindow -PassThru -FilePath "python" `
            -ArgumentList "-m uvicorn app:app --reload --host 0.0.0.0 --port 8000" `
            -WorkingDirectory $ApiDir
        
        # Wait for the server to start
        Start-Sleep -Seconds 5
        
        # Verify the server is running
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:8000/health" -UseBasicParsing -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                Write-Status "✅ Backend API is running at http://localhost:8000" -Level "Success"
                Write-Status "   - API Docs: http://localhost:8000/docs" -Level "Info"
                Write-Status "   - Health:   http://localhost:8000/health" -Level "Info"
                return $backendProcess
            }
        } catch {
            Write-Status "⚠️  Could not verify backend API health: $_" -Level "Warning"
            Write-Status "The backend may still be starting up. Trying to continue..." -Level "Warning"
            return $backendProcess
        }
    } catch {
        Write-Status "❌ Error starting backend: $_" -Level "Error"
        return $null
    }
    
    return $backendProcess
}
function Start-Frontend {
    Write-Status "🚀 Starting Frontend Dashboard..."
    
    # Verify Node.js and npm are available
    try {
        $nodeVersion = node --version
        $npmVersion = npm --version
        Write-Status "✅ Using Node.js $nodeVersion and npm $npmVersion" -Level "Success"
    } catch {
        Write-Status "❌ Node.js is not properly installed or not in PATH" -Level "Error"
        Write-Status "Please install Node.js from https://nodejs.org/ and try again" -Level "Error"
        return $null
    }

    if (-not (Test-Path $DashboardDir)) {
        Write-Status "❌ Dashboard directory not found at: $DashboardDir" -Level "Error"
        return $null
    }

    try {
        # Navigate to dashboard directory
        Push-Location $DashboardDir
        
        # Use npx to ensure we're using the project's local Vite
        $viteBin = Join-Path $DashboardDir "node_modules\.bin\vite"
        
        # Check if Vite is installed
        if (-not (Test-Path (Join-Path $DashboardDir "node_modules\vite\package.json"))) {
            Write-Status "Installing Vite and dependencies..." -Level "Info"
            & npm install
            if ($LASTEXITCODE -ne 0) {
                Write-Status "❌ Failed to install dependencies" -Level "Error"
                return $null
            }
        }
        
        # Set environment variables for the frontend
        $env:VITE_PORT = 5173
        $env:VITE_API_URL = "http://localhost:8000"
        $env:VITE_API_BASE = "http://localhost:8000"
        
        # Start the Vite development server using npx
        Write-Status "Starting Vite development server..." -Level "Info"
        $comspec = $env:ComSpec
        $frontendArgs = "/c", "npm run dev -- --host 0.0.0.0 --port 5173"
        $frontendProcess = Start-Process -FilePath $comspec `
            -ArgumentList $frontendArgs `
            -WorkingDirectory $DashboardDir -NoNewWindow -PassThru
        
        # Wait for the server to start
        Start-Sleep -Seconds 5
        
        # Try to open the dashboard in the default browser
        try {
            Start-Process "http://localhost:5173"
            Write-Status "✅ Dashboard should open in your default browser at http://localhost:5173" -Level "Success"
        } catch {
            Write-Status "⚠️  Could not open browser automatically. Please navigate to http://localhost:5173" -Level "Warning"
        }
        
        Pop-Location
        return $frontendProcess
    } catch {
        Write-Status "❌ Error starting frontend: $_" -Level "Error"
        Pop-Location -ErrorAction SilentlyContinue
        return $null
    }
}

function Start-Orchestration {
    param(
        [string]$Goal,
        [string]$Model,
        [string]$LogLevel
    )
    
    Write-Status "🚀 Starting AI Orchestration..."
    
    # Use the root-level dispatcher which routes to the correct inner orchestrator
    $orchestrationScript = Join-Path $ProjectRoot "Orchestration\MilestoneController.ps1"
    if (-not (Test-Path $orchestrationScript)) {
        Write-Status "⚠️  Orchestration script not found at: $orchestrationScript" -Level "Warning"
        return
    }
    
    $outputFile = Join-Path $OutputDir "orchestration_results_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"
    
    $arguments = @(
        "-NoLogo"
        "-NoProfile"
        "-ExecutionPolicy", "Bypass"
        "-File", "`"$orchestrationScript`""
        "-Goal", "`"$Goal`""
        "-Model", $Model
        "-OutputDir", "`"$OutputDir`""
        "-LogLevel", $LogLevel
    )
    
    $processInfo = @{
        FilePath = "pwsh.exe"
        ArgumentList = $arguments
        WorkingDirectory = $ProjectRoot
        NoNewWindow = $false
        Wait = $true
    }
    
    $orchestrationProcess = Start-Process @processInfo -PassThru
    
    if ($orchestrationProcess.ExitCode -eq 0) {
        Write-Status "✅ Orchestration completed successfully!" -Level "Success"
        if (Test-Path $outputFile) {
            Write-Status "📄 Results saved to: $outputFile" -Level "Info"
        }
    } else {
        Write-Status "❌ Orchestration failed with exit code $($orchestrationProcess.ExitCode)" -Level "Error"
    }
}
function Find-Backend {
    Write-Status "🔍 Searching for backend in project..." -Level "Info"
    $possibleFiles = @("app.py", "main.py", "server.py")
    
    foreach ($file in $possibleFiles) {
        Write-Status "Looking for $file..." -Level "Debug"
        $found = Get-ChildItem -Path $ProjectRoot -Filter $file -Recurse -File -ErrorAction SilentlyContinue |
                 Where-Object { $_.FullName -like "*prompt-api*" -or $_.FullName -like "*backend*" -or $_.FullName -like "*api*" }
        
        if ($found) {
            $dir = $found.Directory.FullName
            Write-Status "✅ Found $file at: $($found.FullName)" -Level "Success"
            Write-Status "   Directory: $dir" -Level "Info"
            
            # Check for requirements.txt
            if (Test-Path (Join-Path $dir "requirements.txt")) {
                Write-Status "   Found requirements.txt" -Level "Success"
            }
            
            return $found.FullName
        }
    }
    
    Write-Status "❌ Could not find backend files in the project." -Level "Error"
    return $null
}
# Main execution
try {
    Write-Host "`n=== 🚀 Unified AI Toolbox Launcher ===" -ForegroundColor Cyan
    Write-Host "Starting all services and dashboard...`n" -ForegroundColor White
    
# In the main execution block, update the backend startup section:
$backendProcess = Start-Backend
if (-not $backendProcess) {
    Write-Status "⚠️  Backend API could not be started. Some features may not be available." -Level "Warning"
    Write-Status "You may need to start the backend manually." -Level "Warning"
}

# Continue with frontend and other services
$frontendProcess = Start-Frontend
    
    # Start orchestration
    Start-Orchestration -Goal $Goal -Model $Model -LogLevel $LogLevel
    
    Write-Host "`n=== 🎉 Services Status ===" -ForegroundColor Green
    Write-Status "Backend API:  http://localhost:8000"
    Write-Status "Frontend:     http://localhost:5173"
    Write-Status "API Docs:     http://localhost:8000/docs"
    Write-Status "Logs:         $LogDir"
    
    Write-Host "`n=== 🚀 Ready to Go! ===" -ForegroundColor Green
    Write-Host "The Unified AI Toolbox is now running. Press Ctrl+C to stop all services." -ForegroundColor White
    
    # Keep the script running
    while ($true) {
        Start-Sleep -Seconds 60
    }
    
} catch {
    Write-Status "❌ Error: $_" -Level "Error"
    Write-Status $_.ScriptStackTrace -Level "Error"
    exit 1
} finally {
    # Cleanup on Ctrl+C
    Write-Host "`n🛑 Stopping services..." -ForegroundColor Yellow
    
    if ($backendProcess) {
        Write-Status "Stopping backend API..."
        Stop-Process -Id $backendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    
    if ($frontendProcess) {
        Write-Status "Stopping frontend dashboard..."
        Stop-Process -Id $frontendProcess.Id -Force -ErrorAction SilentlyContinue
    }
    
    Write-Status "All services stopped." -Level "Success"
}
