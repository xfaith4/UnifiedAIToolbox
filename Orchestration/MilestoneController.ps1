### BEGIN FILE: Orchestration\MilestoneController.ps1
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$Goal,

    [Parameter(Mandatory = $false)]
    [string]$GoalFile,

    [Parameter(Mandatory = $false)]
    [string]$Model = "gpt-4o-mini",

    [Parameter(Mandatory = $false)]
    [string]$OutputDir = ".",

    [Parameter(Mandatory = $false)]
    [switch]$DryRun,

    [Parameter(Mandatory = $false)]
    [string]$LogLevel = "Info"
)

# Resolve repo root and inner orchestrator path
$innerScript = Join-Path -Path $PSScriptRoot -ChildPath 'scripts\MilestoneController.ps1'

if (-not (Test-Path -LiteralPath $innerScript)) {
    Write-Error "Inner orchestrator script not found at '$innerScript'."
    exit 1
}

Write-Verbose "Dispatching to inner orchestrator: $innerScript"

# invoke the inner script with explicit arguments
& $innerScript -Goal $Goal `
    -GoalFile $GoalFile `
    -Model $Model `
    -OutputDir $OutputDir `
    -DryRun:$DryRun `
    -LogLevel $LogLevel

# Preserve exit code for the caller (Python / uvicorn side)
exit $LASTEXITCODE
### END FILE: Orchestration\MilestoneController.ps1
