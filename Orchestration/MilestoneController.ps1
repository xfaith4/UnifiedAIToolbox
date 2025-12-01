### BEGIN FILE: Orchestration\MilestoneController.ps1
[CmdletBinding()]
param(
    # Forward any arguments from the caller into the inner script
    [Parameter(ValueFromRemainingArguments = $true)]
    [object[]]$ArgsFromCaller
)

# Resolve repo root and inner orchestrator path
$repoRoot = Split-Path -Parent $PSScriptRoot

$innerScript = Join-Path -Path $PSScriptRoot -ChildPath 'AI-Orchestration\Scripts\MilestoneController.ps1'

if (-not (Test-Path -LiteralPath $innerScript)) {
    Write-Error "Inner orchestrator script not found at '$innerScript'."
    exit 1
}

Write-Verbose "Dispatching to inner orchestrator: $innerScript"

# Invoke the real orchestrator with any original arguments
& $innerScript @ArgsFromCaller

# Preserve exit code for the caller (Python / uvicorn side)
exit $LASTEXITCODE
### END FILE: Orchestration\MilestoneController.ps1
