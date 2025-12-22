### BEGIN: Test-UnifiedAIToolboxHealth.ps1
[CmdletBinding()]
param(
    # Root of the Unified AI Toolbox repo
    [Parameter()]
    [string]$RepoRoot = "G:\Development\20_Staging\AI-Toolbox\UnifiedAIToolbox",

    # Optional: run a light smoketest script if present
    [switch]$RunSmoketest
)

# Resolve and validate repo root
$RepoRoot = (Resolve-Path -LiteralPath $RepoRoot).ProviderPath
if (-not (Test-Path -LiteralPath $RepoRoot)) {
    throw "RepoRoot '$($RepoRoot)' does not exist. Update the -RepoRoot parameter."
}

Write-Host "Running health check for repo:" -NoNewline
Write-Host " $RepoRoot" -ForegroundColor Cyan

# Helper function to emit a simple status object for each check
function New-HealthCheckResult {
    param(
        [string]$Name,
        [string]$Status,
        [string]$Details
    )

    [PSCustomObject]@{
        Name    = $Name
        Status  = $Status  # OK | WARN | FAIL
        Details = $Details
    }
}

$results = @()

# --- Check 1: Key active app roots still exist ---

$expectedAppRoots = @(
    "apps\dashboard",
    "apps\unifiedtoolbox.webapp",
    "apps\desktop",
    "apps\OrchestrationDesktop",
    "apps\OrchestrationDesktopLauncher",
    "apps\PromptRefiner",
    "apps\orchestration-bridge"
)

foreach ($rel in $expectedAppRoots) {
    $full = Join-Path -Path $RepoRoot -ChildPath $rel
    if (Test-Path -LiteralPath $full) {
        $results += New-HealthCheckResult -Name "App: $rel" -Status "OK" -Details "Path exists."
    }
    else {
        $results += New-HealthCheckResult -Name "App: $rel" -Status "WARN" -Details "Missing path: $full"
    }
}

# --- Check 2: Core orchestration bits ---

$corePaths = @(
    "Orchestration\engine",
    "Orchestration\scripts",
    "Orchestration\milestone-dashboard",
    "Orchestration\engine\codex-multiagent-swarm",
    "Orchestration\engine\GeminiAIOrchestrator",
    "apps\UnifiedPromptApp"
)

foreach ($rel in $corePaths) {
    $full = Join-Path -Path $RepoRoot -ChildPath $rel
    if (Test-Path -LiteralPath $full) {
        $results += New-HealthCheckResult -Name "Core: $rel" -Status "OK" -Details "Path exists."
    }
    else {
        $results += New-HealthCheckResult -Name "Core: $rel" -Status "FAIL" -Details "Missing path: $full"
    }
}

# --- Check 3: Archive structure and manifest ---

$archiveRoot      = Join-Path -Path $RepoRoot -ChildPath "archive\2025-12-RepoCleanup"
$archiveManifest  = Join-Path -Path $archiveRoot -ChildPath "ARCHIVE_MANIFEST.md"

if (Test-Path -LiteralPath $archiveRoot) {
    $results += New-HealthCheckResult -Name "Archive root" -Status "OK" -Details $archiveRoot
}
else {
    $results += New-HealthCheckResult -Name "Archive root" -Status "FAIL" -Details "Expected archive root not found."
}

if (Test-Path -LiteralPath $archiveManifest) {
    # A tiny sanity check: manifest is not empty
    $lines = Get-Content -LiteralPath $archiveManifest -ErrorAction SilentlyContinue
    if ($lines.Count -gt 5) {
        $results += New-HealthCheckResult -Name "Archive manifest" -Status "OK" -Details "Manifest exists with $($lines.Count) lines."
    }
    else {
        $results += New-HealthCheckResult -Name "Archive manifest" -Status "WARN" -Details "Manifest exists but looks suspiciously small."
    }
}
else {
    $results += New-HealthCheckResult -Name "Archive manifest" -Status "FAIL" -Details "ARCHIVE_MANIFEST.md not found under archive root."
}

# --- Check 4: No stray client_secret*.json still tracked ---

# This only checks the working tree. If something is still on disk, you'll see it here.
$secretCandidates = Get-ChildItem -LiteralPath $RepoRoot -Recurse -Filter 'client_secret*.json' -ErrorAction SilentlyContinue

if ($secretCandidates) {
    foreach ($item in $secretCandidates) {
        $results += New-HealthCheckResult -Name "Secret file" -Status "WARN" -Details "Found client_secret JSON: $($item.FullName)"
    }
}
else {
    $results += New-HealthCheckResult -Name "Secret files" -Status "OK" -Details "No client_secret*.json files detected in working tree."
}

# --- Check 5: Root launch scripts ---

$launchScripts = @(
    "Launch.ps1",
    "launch.sh",
    "Launch-Portal.bat",
    "launch-portal.html",
    "Run-Prompt.ps1",
    "Smoketest.ps1",
    "Start-WebUI.ps1"
)

foreach ($rel in $launchScripts) {
    $full = Join-Path -Path $RepoRoot -ChildPath $rel
    if (Test-Path -LiteralPath $full) {
        $results += New-HealthCheckResult -Name "Launcher: $rel" -Status "OK" -Details "Path exists."
    }
    else {
        $results += New-HealthCheckResult -Name "Launcher: $rel" -Status "WARN" -Details "Missing launcher: $full"
    }
}

# --- Optional: run smoketest ---

if ($RunSmoketest) {
    $smokePath = Join-Path -Path $RepoRoot -ChildPath "Smoketest.ps1"

    if (Test-Path -LiteralPath $smokePath) {
        Write-Host ""
        Write-Host "Running Smoketest.ps1..." -ForegroundColor Yellow
        try {
            # Run the smoketest in the repo root so relative paths work
            Push-Location $RepoRoot
            & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File $smokePath
            if ($LASTEXITCODE -eq 0) {
                $results += New-HealthCheckResult -Name "Smoketest.ps1" -Status "OK" -Details "Smoketest exited with code 0."
            }
            else {
                $results += New-HealthCheckResult -Name "Smoketest.ps1" -Status "WARN" -Details "Smoketest exited with code $LASTEXITCODE."
            }
        }
        catch {
            $results += New-HealthCheckResult -Name "Smoketest.ps1" -Status "FAIL" -Details "Error running smoketest: $($_.Exception.Message)"
        }
        finally {
            Pop-Location
        }
    }
    else {
        $results += New-HealthCheckResult -Name "Smoketest.ps1" -Status "WARN" -Details "Smoketest.ps1 not found at repo root."
    }
}

# --- Output ---

Write-Host ""
Write-Host "===== Unified AI Toolbox Repo Health =====" -ForegroundColor Green
$results | Sort-Object Name | Format-Table -AutoSize

# Also return the objects to the pipeline so you can filter/persist as needed
$results
### END: Test-UnifiedAIToolboxHealth.ps1
