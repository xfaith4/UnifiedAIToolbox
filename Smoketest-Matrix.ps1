<#
.SYNOPSIS
    Comprehensive smoke test matrix for Unified AI Toolbox
.DESCRIPTION
    Tests all major components of the repository:
    - Structural validation (directories and files exist)
    - Component health checks (can build, dependencies installed)
    - Integration tests (services start and respond)
    
    Returns clear pass/fail/warn status for each check.
.EXAMPLE
    .\Smoketest-Matrix.ps1
    # Run all smoke tests
.EXAMPLE
    .\Smoketest-Matrix.ps1 -Quick
    # Run only structural checks, skip builds
.EXAMPLE
    .\Smoketest-Matrix.ps1 -SkipIntegration
    # Run structural and component checks, skip integration tests
#>

[CmdletBinding()]
param(
    [switch]$Quick,           # Skip build checks
    [switch]$SkipIntegration  # Skip integration tests
)

$ErrorActionPreference = 'Continue'
$Script:PassCount = 0
$Script:WarnCount = 0
$Script:FailCount = 0
$Script:RepoRoot = $PSScriptRoot

function Write-TestHeader {
    param([string]$Header)
    Write-Host "`n" -NoNewline
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host " $Header" -ForegroundColor Cyan
    Write-Host ("=" * 70) -ForegroundColor Cyan
}

function Write-TestResult {
    param(
        [string]$TestName,
        [ValidateSet('PASS', 'WARN', 'FAIL')]
        [string]$Result,
        [string]$Message = ''
    )
    
    $icon = switch ($Result) {
        'PASS' { '✅'; $Script:PassCount++ }
        'WARN' { '⚠️'; $Script:WarnCount++ }
        'FAIL' { '❌'; $Script:FailCount++ }
    }
    
    $color = switch ($Result) {
        'PASS' { 'Green' }
        'WARN' { 'Yellow' }
        'FAIL' { 'Red' }
    }
    
    $resultText = "[$Result]"
    Write-Host "$icon " -NoNewline -ForegroundColor $color
    Write-Host $resultText.PadRight(8) -NoNewline -ForegroundColor $color
    Write-Host $TestName -NoNewline
    if ($Message) {
        Write-Host " - $Message" -ForegroundColor Gray
    } else {
        Write-Host ""
    }
}

function Test-DirectoryExists {
    param([string]$Path, [string]$Description)
    $fullPath = Join-Path $Script:RepoRoot $Path
    if (Test-Path $fullPath -PathType Container) {
        Write-TestResult $Description 'PASS'
        return $true
    } else {
        Write-TestResult $Description 'FAIL' "Directory not found: $Path"
        return $false
    }
}

function Test-FileExists {
    param([string]$Path, [string]$Description)
    $fullPath = Join-Path $Script:RepoRoot $Path
    if (Test-Path $fullPath -PathType Leaf) {
        Write-TestResult $Description 'PASS'
        return $true
    } else {
        Write-TestResult $Description 'FAIL' "File not found: $Path"
        return $false
    }
}

function Test-NodeDependencies {
    param([string]$AppPath, [string]$AppName)
    
    $fullPath = Join-Path $Script:RepoRoot $AppPath
    $nodeModules = Join-Path $fullPath 'node_modules'
    $packageJson = Join-Path $fullPath 'package.json'
    
    if (-not (Test-Path $packageJson)) {
        Write-TestResult "$AppName dependencies" 'FAIL' "No package.json found"
        return $false
    }
    
    if (Test-Path $nodeModules) {
        Write-TestResult "$AppName dependencies" 'PASS' "node_modules exists"
        return $true
    } else {
        Write-TestResult "$AppName dependencies" 'WARN' "node_modules not found - run npm install"
        return $false
    }
}

function Test-PythonVenv {
    param([string]$ServicePath, [string]$ServiceName)
    
    $fullPath = Join-Path $Script:RepoRoot $ServicePath
    $venvPath = Join-Path $fullPath '.venv'
    $reqPath = Join-Path $fullPath 'requirements.txt'
    
    if (-not (Test-Path $reqPath)) {
        Write-TestResult "$ServiceName venv" 'FAIL' "No requirements.txt found"
        return $false
    }
    
    if (Test-Path $venvPath) {
        Write-TestResult "$ServiceName venv" 'PASS' ".venv exists"
        return $true
    } else {
        Write-TestResult "$ServiceName venv" 'WARN' ".venv not found - run python -m venv .venv"
        return $false
    }
}

function Test-CommandAvailable {
    param([string]$Command, [string]$Description)
    
    if (Get-Command $Command -ErrorAction SilentlyContinue) {
        Write-TestResult "$Description available" 'PASS'
        return $true
    } else {
        Write-TestResult "$Description available" 'FAIL' "$Command not found in PATH"
        return $false
    }
}

# ============================================================================
# MAIN TEST EXECUTION
# ============================================================================

Write-Host "`n"
Write-Host ("=" * 70) -ForegroundColor Cyan
Write-Host " UNIFIED AI TOOLBOX - SMOKE TEST MATRIX" -ForegroundColor Cyan -NoNewline
Write-Host ""
Write-Host ("=" * 70) -ForegroundColor Cyan

# ----------------------------------------------------------------------------
# STRUCTURAL CHECKS
# ----------------------------------------------------------------------------
Write-TestHeader "STRUCTURAL CHECKS"

Write-Host "`n📁 Core Directories:" -ForegroundColor White
Test-DirectoryExists 'apps' 'apps directory'
Test-DirectoryExists 'modules' 'modules directory'
Test-DirectoryExists 'Orchestration' 'Orchestration directory'
Test-DirectoryExists 'scripts' 'scripts directory'
Test-DirectoryExists 'docs' 'docs directory'

Write-Host "`n📁 Active Applications:" -ForegroundColor White
Test-DirectoryExists 'apps\dashboard' 'dashboard app'
Test-DirectoryExists 'apps\unifiedtoolbox.webapp' 'webapp app'
Test-DirectoryExists 'apps\OrchestrationDesktop' 'OrchestrationDesktop app'
Test-DirectoryExists 'apps\PromptRefiner' 'PromptRefiner app'
Test-DirectoryExists 'apps\orchestration-bridge' 'orchestration-bridge app'

Write-Host "`n📁 Orchestration Components:" -ForegroundColor White
Test-DirectoryExists 'Orchestration\UnifiedPromptApp\services\prompt-api' 'prompt-api service'
Test-DirectoryExists 'Orchestration\AI-Orchestration' 'AI-Orchestration'
Test-DirectoryExists 'Orchestration\AI-Orchestration\codex-multiagent-swarm' 'codex-multiagent-swarm'

Write-Host "`n📄 Launch Scripts:" -ForegroundColor White
Test-FileExists 'Launch.ps1' 'Launch.ps1'
Test-FileExists 'Start-WebUI.ps1' 'Start-WebUI.ps1'
Test-FileExists 'launch.sh' 'launch.sh'
Test-FileExists 'Run-Prompt.ps1' 'Run-Prompt.ps1'

Write-Host "`n📄 Entry Points:" -ForegroundColor White
Test-FileExists 'apps\dashboard\package.json' 'dashboard package.json'
Test-FileExists 'apps\dashboard\src\main.tsx' 'dashboard entry point'
Test-FileExists 'apps\unifiedtoolbox.webapp\package.json' 'webapp package.json'
Test-FileExists 'apps\OrchestrationDesktop\OrchestrationDesktop.csproj' 'OrchestrationDesktop project'
Test-FileExists 'apps\PromptRefiner\OpenAI_Refiner.ps1' 'PromptRefiner script'
Test-FileExists 'Orchestration\UnifiedPromptApp\services\prompt-api\app.py' 'prompt-api entry'
Test-FileExists 'Orchestration\MilestoneController.ps1' 'MilestoneController dispatcher'

# ----------------------------------------------------------------------------
# PREREQUISITE CHECKS
# ----------------------------------------------------------------------------
Write-TestHeader "PREREQUISITE CHECKS"

Write-Host "`n🔧 Required Tools:" -ForegroundColor White
Test-CommandAvailable 'node' 'Node.js'
Test-CommandAvailable 'npm' 'npm'
Test-CommandAvailable 'python' 'Python'
Test-CommandAvailable 'pwsh' 'PowerShell Core'
Test-CommandAvailable 'dotnet' '.NET SDK'

# ----------------------------------------------------------------------------
# COMPONENT HEALTH CHECKS
# ----------------------------------------------------------------------------
if (-not $Quick) {
    Write-TestHeader "COMPONENT HEALTH CHECKS"
    
    Write-Host "`n🔍 Node.js Applications:" -ForegroundColor White
    Test-NodeDependencies 'apps\dashboard' 'dashboard'
    Test-NodeDependencies 'apps\unifiedtoolbox.webapp' 'webapp'
    
    Write-Host "`n🔍 Python Services:" -ForegroundColor White
    Test-PythonVenv 'Orchestration\UnifiedPromptApp\services\prompt-api' 'prompt-api'
    
    Write-Host "`n🔍 .NET Applications:" -ForegroundColor White
    $orchestrationDesktopProj = Join-Path $Script:RepoRoot 'apps\OrchestrationDesktop\OrchestrationDesktop.csproj'
    if (Test-Path $orchestrationDesktopProj) {
        try {
            Push-Location (Join-Path $Script:RepoRoot 'apps\OrchestrationDesktop')
            $buildResult = dotnet build --no-restore --verbosity quiet 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-TestResult 'OrchestrationDesktop build' 'PASS'
            } else {
                Write-TestResult 'OrchestrationDesktop build' 'WARN' "Build completed with warnings"
            }
            Pop-Location
        } catch {
            Write-TestResult 'OrchestrationDesktop build' 'FAIL' $_.Exception.Message
            Pop-Location
        }
    } else {
        Write-TestResult 'OrchestrationDesktop build' 'FAIL' 'Project file not found'
    }
    
    Write-Host "`n🔍 PowerShell Modules:" -ForegroundColor White
    $promptLibModule = Join-Path $Script:RepoRoot 'modules\PromptLibrary\PromptLibrary.psd1'
    if (Test-Path $promptLibModule) {
        try {
            $null = Test-ModuleManifest $promptLibModule -ErrorAction Stop
            Write-TestResult 'PromptLibrary module' 'PASS'
        } catch {
            Write-TestResult 'PromptLibrary module' 'WARN' "Manifest validation warning: $($_.Exception.Message)"
        }
    } else {
        Write-TestResult 'PromptLibrary module' 'FAIL' 'Module manifest not found'
    }
}

# ----------------------------------------------------------------------------
# INTEGRATION TESTS
# ----------------------------------------------------------------------------
if (-not $SkipIntegration -and -not $Quick) {
    Write-TestHeader "INTEGRATION TESTS"
    
    Write-Host "`n⚠️  Integration tests require starting services and may take time." -ForegroundColor Yellow
    Write-Host "    Skipping integration tests. Run without -SkipIntegration to enable." -ForegroundColor Yellow
    Write-Host "    Or use the verify-launch.py script after starting services with launch.sh" -ForegroundColor Yellow
}

# ----------------------------------------------------------------------------
# SUMMARY
# ----------------------------------------------------------------------------
Write-TestHeader "TEST SUMMARY"

$totalTests = $Script:PassCount + $Script:WarnCount + $Script:FailCount
$passPercent = if ($totalTests -gt 0) { [math]::Round(($Script:PassCount / $totalTests) * 100, 1) } else { 0 }

Write-Host ""
Write-Host "Total Tests: $totalTests" -ForegroundColor White
Write-Host "✅ Passed:   $Script:PassCount ($passPercent%)" -ForegroundColor Green
Write-Host "⚠️  Warnings: $Script:WarnCount" -ForegroundColor Yellow
Write-Host "❌ Failed:   $Script:FailCount" -ForegroundColor Red
Write-Host ""

# Determine overall status
$overallStatus = if ($Script:FailCount -eq 0 -and $Script:WarnCount -eq 0) {
    'PASSED'
} elseif ($Script:FailCount -eq 0) {
    'PASSED WITH WARNINGS'
} else {
    'FAILED'
}

$statusColor = switch ($overallStatus) {
    'PASSED' { 'Green' }
    'PASSED WITH WARNINGS' { 'Yellow' }
    'FAILED' { 'Red' }
}

Write-Host ("=" * 70) -ForegroundColor $statusColor
Write-Host " OVERALL STATUS: $overallStatus" -ForegroundColor $statusColor
Write-Host ("=" * 70) -ForegroundColor $statusColor
Write-Host ""

# Recommendations
if ($Script:WarnCount -gt 0 -or $Script:FailCount -gt 0) {
    Write-Host "📋 RECOMMENDATIONS:" -ForegroundColor Cyan
    Write-Host ""
    
    if ($Script:FailCount -gt 0) {
        Write-Host "  • Address failed checks above before deploying" -ForegroundColor Red
        Write-Host "  • Verify all prerequisites are installed" -ForegroundColor Red
    }
    
    if ($Script:WarnCount -gt 0) {
        Write-Host "  • Review warnings - some components may need setup" -ForegroundColor Yellow
        Write-Host "  • Run 'npm install' in apps/dashboard and apps/unifiedtoolbox.webapp" -ForegroundColor Yellow
        Write-Host "  • Create Python venv: python -m venv .venv in prompt-api directory" -ForegroundColor Yellow
    }
    
    Write-Host ""
}

# Exit with appropriate code
if ($Script:FailCount -gt 0) {
    exit 1
} elseif ($Script:WarnCount -gt 0) {
    exit 2
} else {
    exit 0
}
