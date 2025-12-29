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
    [string]$LogLevel = "Info",

    [Parameter(Mandatory = $false)]
    [switch]$EnforceContracts

    ,
    [Parameter(Mandatory = $false)]
    [string]$LearningPatternsPath

    ,
    [Parameter(Mandatory = $false)]
    [int]$LearningTopN = 10

    ,
    [Parameter(Mandatory = $false)]
    [int]$LearningMaxRuns = 200

    ,
    [Parameter(Mandatory = $false)]
    [switch]$DisableLearning
)

### BEGIN: OutputDirDefaults
# If the caller did NOT explicitly pass -OutputDir, default it to a stable
# RunArtifacts folder rooted at the orchestration script directory.
if (-not $PSBoundParameters.ContainsKey('OutputDir')) {
    $OutputDir = Join-Path -Path $PSScriptRoot -ChildPath 'RunArtifacts'
}

# Ensure the output directory exists so the inner orchestrator can safely
# write logs, summaries, and raw LLM responses under it.
if (-not (Test-Path -Path $OutputDir -PathType Container)) {
    $null = New-Item -Path $OutputDir -ItemType Directory -Force
}
### END: OutputDirDefaults

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
    -LogLevel $LogLevel `
    -EnforceContracts:$EnforceContracts `
    -LearningPatternsPath $LearningPatternsPath `
    -LearningTopN $LearningTopN `
    -LearningMaxRuns $LearningMaxRuns `
    -DisableLearning:$DisableLearning

# Preserve exit code for the caller (Python / uvicorn side)
exit $LASTEXITCODE
### END FILE: Orchestration\MilestoneController.ps1
