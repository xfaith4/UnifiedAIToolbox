<#
.SYNOPSIS
    Launches the Unified AI Toolbox with proper environment setup.
#>

# Set Error Action to Stop on all commands
$ErrorActionPreference = "Stop"

# Configuration
$Script:ProjectRoot = $PSScriptRoot
$OrchestrationDir = Join-Path $ProjectRoot "Orchestration\UnifiedPromptApp\services\prompt-api"
$OutputDir = Join-Path $ProjectRoot "apps\orchestration-bridge\runs"
$LogDir = Join-Path $ProjectRoot "logs"

# Create necessary directories
$null = New-Item -ItemType Directory -Force -Path $OutputDir, $LogDir

function Test-IsElevated {
    $identity = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-PowerShellPath {
    [CmdletBinding()]
    param()

    # Check for standalone PowerShell 7 first
    $standalonePaths = @(
        "C:\Program Files\PowerShell\7\pwsh.exe"
        "C:\Program Files (x86)\PowerShell\7\pwsh.exe"
    )

    foreach ($path in $standalonePaths) {
        if (Test-Path $path) {
            Write-Host "✅ Found standalone PowerShell at: $path" -ForegroundColor Green
            return $path
        }
    }

    Write-Host "❌ PowerShell 7+ not found." -ForegroundColor Red
    Write-Host "Please run the fix-pwsh.ps1 script as Administrator to install it properly." -ForegroundColor Yellow
    exit 1
}

function Start-Orchestration {
    [CmdletBinding()]
    param()

    $powerShellPath = Get-PowerShellPath
    $scriptPath = Join-Path $OrchestrationDir "MilestoneController.ps1"
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $logFile = Join-Path $LogDir "orchestration_${timestamp}.log"

    if (-not (Test-Path $scriptPath)) {
        Write-Host "❌ Error: MilestoneController.ps1 not found at $scriptPath" -ForegroundColor Red
        exit 1
    }

    # Create a temporary file for the goal
    $tempGoalFile = [System.IO.Path]::GetTempFileName() + ".txt"
    "Smoke Test" | Out-File -FilePath $tempGoalFile -Encoding utf8

    try {
        $arguments = @(
            "-NoLogo"
            "-NoProfile"
            "-ExecutionPolicy", "Bypass"
            "-File", "`"$scriptPath`""
            "-GoalFile", "`"$tempGoalFile`""
            "-Model", "gpt-4o-mini"
            "-OutputDir", "`"$OutputDir`""
            "-Verbose"
        )

        Write-Host "🚀 Starting orchestration with:" -ForegroundColor Cyan
        Write-Host "  PowerShell: $powerShellPath" -ForegroundColor Cyan
        Write-Host "  Script: $scriptPath" -ForegroundColor Cyan
        Write-Host "  Goal: Smoke Test" -ForegroundColor Cyan
        Write-Host "  Log File: $logFile" -ForegroundColor Cyan

        $process = Start-Process -FilePath $powerShellPath -ArgumentList $arguments -NoNewWindow -PassThru -Wait
        $exitCode = $process.ExitCode
        
        if ($exitCode -ne 0) {
            Write-Host "❌ Orchestration failed with exit code $exitCode" -ForegroundColor Red
            if (Test-Path $logFile) {
                Write-Host "=== Last 20 lines of log ===" -ForegroundColor Yellow
                Get-Content $logFile -Tail 20 | ForEach-Object { Write-Host $_ }
            }
            exit $exitCode
        }

        Write-Host "✅ Orchestration completed successfully!" -ForegroundColor Green
        
        # Find the latest result file
        $latestResult = Get-ChildItem -Path $OutputDir -Filter "orchestration_results_*.json" -ErrorAction SilentlyContinue | 
                        Sort-Object LastWriteTime -Descending | 
                        Select-Object -First 1

        if ($latestResult) {
            Write-Host "📋 Results saved to: $($latestResult.FullName)" -ForegroundColor Cyan
            # Display a summary of the results
            try {
                $results = Get-Content $latestResult.FullName -Raw | ConvertFrom-Json -ErrorAction Stop
                Write-Host "`n=== Orchestration Summary ===" -ForegroundColor Cyan
                Write-Host "Status: $($results.Status)" -ForegroundColor Cyan
                if ($results.Milestones) {
                    Write-Host "Milestones: $($results.Milestones.Count)" -ForegroundColor Cyan
                    $results.Milestones | ForEach-Object {
                        Write-Host "  - $($_.Name): $($_.Status)" -ForegroundColor Cyan
                    }
                }
                Write-Host "Start Time: $($results.StartedAt)" -ForegroundColor Cyan
                Write-Host "End Time: $($results.CompletedAt)" -ForegroundColor Cyan
            } catch {
                Write-Host "  Could not parse results: $_" -ForegroundColor Yellow
            }
        }

    } catch {
        Write-Host "❌ Error running orchestration: $_" -ForegroundColor Red
        Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
        exit 1
    } finally {
        # Clean up the temporary file
        if (Test-Path $tempGoalFile) {
            Remove-Item $tempGoalFile -Force -ErrorAction SilentlyContinue
        }
    }
}

# Main execution
try {
    # Set console encoding to UTF-8
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8

    Write-Host "`n=== Unified AI Toolbox Launcher ===" -ForegroundColor Cyan
    Write-Host "Checking environment..." -ForegroundColor Cyan

    # Check if we have the correct PowerShell version
    $powerShellPath = Get-PowerShellPath

    # Run the orchestration
    Start-Orchestration

} catch {
    Write-Host "`n❌ Fatal error: $_" -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
    exit 1
}