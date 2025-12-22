<#
.SYNOPSIS
    Rebuilds the MilestoneDashboard dependencies and optionally launches the dev server.
.DESCRIPTION
    Wraps the manual instructions from QUICKSTART.md into a single repeatable command.
    The script deletes node_modules and package-lock.json, runs npm install (with
    --legacy-peer-deps by default) and optionally executes `npm run dev`.
.PARAMETER LaunchDashboard
    Start the Vite dev server (`npm run dev`) after dependencies finish installing.
.PARAMETER SkipLegacyPeerDeps
    Do not append --legacy-peer-deps to the npm install command.
#>

[CmdletBinding()]
param(
    [switch]$LaunchDashboard,
    [switch]$SkipLegacyPeerDeps
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$dashboardDir = Join-Path $repoRoot 'MilestoneDashboard'

if (-not (Test-Path $dashboardDir)) {
    throw "MilestoneDashboard folder not found at $dashboardDir"
}

function Remove-ItemIfExists {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [Parameter(Mandatory)] [string]$Label
    )

    if (Test-Path $Path) {
        Write-Host "🧹 Removing $Label ($Path)" -ForegroundColor DarkYellow
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
}

Remove-ItemIfExists -Path (Join-Path $dashboardDir 'node_modules') -Label 'node_modules'
Remove-ItemIfExists -Path (Join-Path $dashboardDir 'package-lock.json') -Label 'package-lock.json'

$npm = Get-Command npm -ErrorAction Stop
$npmCommand = $null
foreach ($candidate in @($npm.Path, $npm.Source, $npm.Definition, $npm.Name)) {
    if (-not [string]::IsNullOrWhiteSpace($candidate)) {
        $npmCommand = $candidate
        break
    }
}
if (-not $npmCommand) {
    $npmCommand = 'npm'
}

$installArgs = @('install')
if (-not $SkipLegacyPeerDeps) {
    $installArgs += '--legacy-peer-deps'
}

Push-Location $dashboardDir
try {
    Write-Host "📦 Running: npm $($installArgs -join ' ')" -ForegroundColor Cyan
    & $npmCommand @installArgs
    if ($LASTEXITCODE -ne 0) {
        throw "npm $($installArgs -join ' ') failed with exit code $LASTEXITCODE"
    }
    Write-Host "✅ Dependencies installed successfully." -ForegroundColor Green

    if ($LaunchDashboard) {
        Write-Host "🚀 Launching npm run dev (Ctrl+C to stop)" -ForegroundColor Cyan
        & $npmCommand 'run' 'dev'
    }
}
finally {
    Pop-Location
}

Write-Host "MilestoneDashboard reset complete." -ForegroundColor Green
