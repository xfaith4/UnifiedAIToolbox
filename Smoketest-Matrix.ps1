<#
.SYNOPSIS
    Smoke test matrix for Unified AI Toolbox.
.DESCRIPTION
    Performs lightweight structural checks and (optionally) endpoint verification against already-running services.
.PARAMETER Quick
    Skip dependency/build-related checks.
.PARAMETER SkipIntegration
    Skip endpoint verification (scripts/verify-launch.py).
.EXAMPLE
    .\Smoketest-Matrix.ps1
.EXAMPLE
    .\Smoketest-Matrix.ps1 -Quick
.EXAMPLE
    .\Smoketest-Matrix.ps1 -SkipIntegration
#>

[CmdletBinding()]
param(
    [switch]$Quick,
    [switch]$SkipIntegration
)

$ErrorActionPreference = 'Continue'
$repoRoot = $PSScriptRoot
$pass = 0
$warn = 0
$fail = 0

function Write-Result {
    param(
        [string]$Name,
        [ValidateSet('PASS', 'WARN', 'FAIL')][string]$Status,
        [string]$Message = ''
    )
    switch ($Status) {
        'PASS' { $script:pass++; Write-Host "✅ [PASS] $Name" -ForegroundColor Green }
        'WARN' { $script:warn++; Write-Host "⚠️  [WARN] $Name - $Message" -ForegroundColor Yellow }
        'FAIL' { $script:fail++; Write-Host "❌ [FAIL] $Name - $Message" -ForegroundColor Red }
    }
}

function Test-PathExists {
    param([string]$Path, [string]$Name)
    if (Test-Path (Join-Path $repoRoot $Path)) { Write-Result $Name 'PASS' } else { Write-Result $Name 'FAIL' "Missing: $Path" }
}

Write-Host "`n=== Unified AI Toolbox - Smoke Test Matrix ===`n" -ForegroundColor Cyan

Write-Host "[STRUCTURAL]" -ForegroundColor Cyan
Test-PathExists 'apps/dashboard/package.json' 'dashboard present'
Test-PathExists 'apps/unifiedtoolbox.webapp/package.json' 'web portal present'
Test-PathExists 'apps/UnifiedPromptApp/services/prompt-api/app.py' 'prompt-api present'
Test-PathExists 'Orchestration/MilestoneController.ps1' 'orchestrator dispatcher present'
Test-PathExists 'Start-Toolbox.ps1' 'Start-Toolbox entry point present'
Test-PathExists 'launch.sh' 'launch.sh entry point present'

if (-not $Quick) {
    Write-Host "`n[PREREQS]" -ForegroundColor Cyan
    if (Get-Command node -ErrorAction SilentlyContinue) { Write-Result 'node available' 'PASS' } else { Write-Result 'node available' 'WARN' 'Node.js not found (required for dashboard/web portal)' }
    if (Get-Command npm -ErrorAction SilentlyContinue) { Write-Result 'npm available' 'PASS' } else { Write-Result 'npm available' 'WARN' 'npm not found' }
    if (Get-Command python -ErrorAction SilentlyContinue -or Get-Command python3 -ErrorAction SilentlyContinue) { Write-Result 'python available' 'PASS' } else { Write-Result 'python available' 'WARN' 'Python not found (required for prompt-api/verify script)' }
    if (Get-Command pwsh -ErrorAction SilentlyContinue) { Write-Result 'pwsh available' 'PASS' } else { Write-Result 'pwsh available' 'WARN' 'PowerShell 7 not found (recommended for tooling)' }
}

if (-not $Quick -and -not $SkipIntegration) {
    Write-Host "`n[INTEGRATION]" -ForegroundColor Cyan

    $apiPort = if ($env:API_PORT) { [int]$env:API_PORT } else { 8000 }
    $frontendPort = if ($env:FRONTEND_PORT) { [int]$env:FRONTEND_PORT } else { 5173 }
    $webPort = if ($env:WEB_PORT) { [int]$env:WEB_PORT } else { 3000 }

    $verify = Join-Path $repoRoot 'scripts' 'verify-launch.py'
    if (-not (Test-Path $verify)) {
        Write-Result 'verify-launch.py' 'FAIL' 'Missing scripts/verify-launch.py'
    } else {
        try {
            $pythonExe = if (Get-Command python3 -ErrorAction SilentlyContinue) { 'python3' } else { 'python' }
            & $pythonExe $verify --api-port $apiPort --frontend-port $frontendPort --web-port $webPort | Out-Host
            Write-Result 'endpoint verification' 'PASS'
        } catch {
            Write-Result 'endpoint verification' 'WARN' 'Verification failed (are services running?)'
        }
    }
}
elseif (-not $SkipIntegration) {
    Write-Host "`n[INTEGRATION]" -ForegroundColor Cyan
    Write-Host "Skipped (use without -Quick to enable)." -ForegroundColor Yellow
}

Write-Host "`n[SUMMARY]" -ForegroundColor Cyan
Write-Host "Passed: $pass  Warnings: $warn  Failed: $fail"

if ($fail -gt 0) { exit 1 }
if ($warn -gt 0) { exit 2 }
exit 0

