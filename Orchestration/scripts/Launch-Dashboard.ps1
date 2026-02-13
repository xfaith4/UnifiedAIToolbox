### BEGIN FILE: scripts/Launch-Dashboard.ps1
param([Parameter(Mandatory)][string]$BaseDir)
$BaseDir = (Resolve-Path $BaseDir).Path
if (-not (Test-Path $BaseDir)) {
    throw "Base directory not found: $BaseDir"
}
$indexPath = Join-Path $BaseDir "demo-orchestration-sim.html"
if (-not (Test-Path $indexPath)) {
    Write-Warning "Dashboard file not found: $indexPath"
    return
}

Write-Host "🌍 Opening Milestone Dashboard..." -ForegroundColor Yellow
Write-Host "📂 $indexPath"

try {
    Start-Process $indexPath
} catch {
    Write-Warning "Unable to auto-launch browser. Please open manually."
}
### END FILE: scripts/Launch-Dashboard.ps1
