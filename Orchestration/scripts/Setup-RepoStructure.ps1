### BEGIN FILE: Setup-RepoStructure.ps1
<#
.SYNOPSIS
  Initializes the AI-Orchestration repo structure.
.DESCRIPTION
  Ensures required folders exist, creates placeholder files,
  and updates JSON path references for local development.
#>

$Root = Split-Path $PSScriptRoot -Parent

$Paths = @(
    "$Root\Goals",
    "$Root\runs",
    "$Root\Goals\archive",
    "$Root\MilestoneDashboard\public\data",
    "$Root\MilestoneDashboard\src",
    "$Root\.github\workflows"
)

foreach ($Path in $Paths) {
    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Path $Path -Force | Out-Null
        Write-Host "📁 Created: $Path" -ForegroundColor Cyan
    }
}

# Create placeholder goal
$GoalFile = "$Root\Goals\CurrentGoal.txt"
if (-not (Test-Path $GoalFile)) {
@"
Milestone Objective: Initialize AI-Orchestration environment.

Action Plan:
- Verify POF.ps1 orchestrator is operational.
- Ensure MilestoneController logs data to MilestoneDashboard/public/data/Milestone_Log.json.
- Confirm dashboard visualization loads via npm run dev.

✅ Success Criteria:
- Successful first orchestration run.
- Dashboard JSON populated.
- Cost tracking and Commissioner Score logged.
"@ | Out-File $GoalFile -Encoding UTF8
    Write-Host "🧭 Created sample goal: $GoalFile"
}

# Create placeholder JSON
$JsonFile = "$Root\MilestoneDashboard\public\data\Milestone_Log.json"
if (-not (Test-Path $JsonFile)) {
    "[]" | Out-File $JsonFile -Encoding UTF8
    Write-Host "🪣 Created placeholder Milestone_Log.json"
}

# Create sample GH workflow if missing
$Workflow = "$Root\.github\workflows\build-dashboard.yml"
if (-not (Test-Path $Workflow)) {
@"
name: Build Dashboard
on:
  push:
    branches: [ main ]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Build Dashboard
        run: |
          cd MilestoneDashboard
          npm ci
          npm run build
"@ | Out-File $Workflow -Encoding UTF8
    Write-Host "🧱 Created sample GitHub workflow: $Workflow"
}

Write-Host "`n✅ Repo structure verified and ready." -ForegroundColor Green
### END FILE: Setup-RepoStructure.ps1
