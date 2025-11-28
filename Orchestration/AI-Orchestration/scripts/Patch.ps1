# Repo Sanity Check (run from /scripts)
# Ensures goals/logs exist, seeds empty files, and rewrites JSON for the dashboard.

# Resolve paths relative to repo root
$RepoRoot = Split-Path $PSScriptRoot -Parent
$GoalsDir = Join-Path $RepoRoot 'Goals'
$RunsDir  = Join-Path $RepoRoot 'runs'
$DashJson = Join-Path $RepoRoot 'MilestoneDashboard/public/data/Milestone_Log.json'
$CsvPath  = Join-Path $RepoRoot 'Milestone_Log.csv'

# 1) Ensure Goals/CurrentGoal.txt exists
$CurrentGoal = Join-Path $GoalsDir 'CurrentGoal.txt'
if (-not (Test-Path $CurrentGoal)) {
    New-Item -ItemType Directory -Force -Path $GoalsDir | Out-Null
    @"
Milestone Objective: Verify the orchestration framework end-to-end.

Action Plan:
- Run the POF orchestrator successfully.
- Log Commissioner feedback and Value Score.
- Generate cost and duration telemetry.
- Populate MilestoneDashboard/public/data/Milestone_Log.json.

✅ Success Criteria:
- Controller completes without error.
- Commissioner provides a valid Value Score.
- Dashboard JSON updated and viewable.
"@ | Out-File $CurrentGoal -Encoding UTF8
    Write-Host "Seeded Goals\CurrentGoal.txt" -ForegroundColor Cyan
}

# 2) Ensure CSV exists with header
if (-not (Test-Path $CsvPath) -or (Get-Item $CsvPath).Length -eq 0) {
    $hdr = 'Timestamp,Goal,Score,Tokens,Duration,Outcome,RunFolder,Synthesis,Cost'
    $hdr | Out-File $CsvPath -Encoding UTF8
    Write-Host "Seeded Milestone_Log.csv (header only)" -ForegroundColor Cyan
}

# 3) Ensure Dashboard JSON exists, derive from CSV (even if just header)
New-Item -ItemType Directory -Force -Path (Split-Path $DashJson) | Out-Null
try {
    $rows = Import-Csv $CsvPath
    ($rows | ConvertTo-Json -Depth 4) | Out-File $DashJson -Encoding UTF8
    if (-not $rows) { '[]' | Out-File $DashJson -Encoding UTF8 }
    Write-Host "Refreshed $DashJson" -ForegroundColor Green
} catch {
    '[]' | Out-File $DashJson -Encoding UTF8
    Write-Host "Created empty $DashJson" -ForegroundColor Yellow
}

# 4) Print key paths for verification
Write-Host "`nRepo root: $RepoRoot"
Write-Host "Goal: $CurrentGoal"
Write-Host "CSV : $CsvPath ($(Get-Item $CsvPath).Length) bytes)"
Write-Host "JSON: $DashJson ($(Get-Item $DashJson).Length) bytes)"
