<#
.SYNOPSIS
    Post-run review and patch generation for PromptOps.

.DESCRIPTION
    Analyzes an orchestration run and generates a structured patch plan.
    
    Reads run artifacts from ./artifacts/runs/<run_id>/ and produces:
    - PromptPatchPlan.json with diagnosis and proposed patches
    - Optional: Candidate library if --CreateCandidate is specified
    
.PARAMETER RunId
    Run ID to review. If not specified, reviews the most recent run.

.PARAMETER CreateCandidate
    If set, creates a candidate library by applying patches.

.PARAMETER AutoApply
    If set, attempts to auto-apply low-risk changes that pass all gates.

.EXAMPLE
    .\Run-PromptOpsReview.ps1
    Reviews the most recent run.

.EXAMPLE
    .\Run-PromptOpsReview.ps1 -RunId "20240115_120000_abc123" -CreateCandidate
    Reviews specific run and creates a candidate library.

.EXAMPLE
    .\Run-PromptOpsReview.ps1 -AutoApply
    Reviews most recent run and auto-applies if safe.
#>

[CmdletBinding()]
param(
    [Parameter(Position=0)]
    [string]$RunId,
    
    [switch]$CreateCandidate,
    
    [switch]$AutoApply
)

$ErrorActionPreference = "Stop"

# Paths
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ApiDir = Join-Path $RepoRoot "apps/UnifiedPromptApp/services/prompt-api"
$ArtifactsRoot = Join-Path $RepoRoot "artifacts"
$RunsDir = Join-Path $ArtifactsRoot "runs"
$PromptsDir = Join-Path $RepoRoot "prompts"
$CandidatesDir = Join-Path $PromptsDir "candidates"

# Ensure Python is available
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "Python not found. Please install Python 3.12+ and ensure it's in your PATH."
    exit 1
}

# Find run to review
if (-not $RunId) {
    Write-Host "No RunId specified. Finding most recent run..." -ForegroundColor Cyan
    
    if (-not (Test-Path $RunsDir)) {
        Write-Error "No runs directory found at: $RunsDir"
        exit 1
    }
    
    $runs = Get-ChildItem -Path $RunsDir -Directory | Sort-Object Name -Descending
    if ($runs.Count -eq 0) {
        Write-Error "No runs found in: $RunsDir"
        exit 1
    }
    
    $RunId = $runs[0].Name
    Write-Host "  Selected run: $RunId" -ForegroundColor Green
}

$runDir = Join-Path $RunsDir $RunId

if (-not (Test-Path $runDir)) {
    Write-Error "Run directory not found: $runDir"
    exit 1
}

Write-Host ""
Write-Host "===== PromptOps Post-Run Review =====" -ForegroundColor Magenta
Write-Host "Run ID: $RunId" -ForegroundColor Yellow
Write-Host ""

# Create Python script to run the review
$pythonScript = @"
import sys
import json
from pathlib import Path

# Add API directory to path
sys.path.insert(0, r'$ApiDir')

from prompt_reviewer import PromptReviewer
from prompt_versioning import PromptRegistry, PromptPatch, PatchOperation
from prompt_gates import PromptGates

# Review the run
run_dir = Path(r'$runDir')
reviewer = PromptReviewer(run_dir)

print('Analyzing run...')
plan = reviewer.review_run()

# Save patch plan
plan_path = run_dir / 'PromptPatchPlan.json'
reviewer.save_patch_plan(plan, plan_path)

print(f'Saved patch plan to: {plan_path}')
print('')
print('=== Diagnosis ===')
print(f'Root Causes: {len(plan.run_diagnosis.root_causes)}')
for cause in plan.run_diagnosis.root_causes:
    print(f'  - {cause.type}: {cause.impact}')
    print(f'    Evidence: {", ".join(cause.evidence[:3])}')

print('')
print(f'Metrics:')
for key, value in plan.run_diagnosis.metrics.items():
    print(f'  - {key}: {value}')

print('')
print(f'=== Proposed Patches ===')
print(f'Total patches: {len(plan.patches)}')
for i, patch in enumerate(plan.patches, 1):
    print(f'{i}. Target: {patch.target}')
    print(f'   Change: {patch.change_type}')
    print(f'   Reason: {patch.reason}')
    print(f'   Risk: {patch.risk}')
    print(f'   Tests: {", ".join(patch.tests_required)}')
    print('')

# Output summary as JSON for PowerShell to parse
summary = {
    'plan_path': str(plan_path),
    'root_causes': len(plan.run_diagnosis.root_causes),
    'patches': len(plan.patches),
    'routing_changes': len(plan.routing_changes),
    'validator_changes': len(plan.validator_changes)
}
print('__SUMMARY_JSON__')
print(json.dumps(summary))
"@

# Run Python review
$tempScript = New-TemporaryFile
$pythonScript | Out-File -FilePath $tempScript.FullName -Encoding UTF8

try {
    $output = python $tempScript.FullName 2>&1 | Out-String
    Write-Host $output
    
    # Parse summary
    if ($output -match '__SUMMARY_JSON__\s*(.*?)$') {
        $summaryJson = $Matches[1].Trim()
        $summary = $summaryJson | ConvertFrom-Json
        
        $planPath = $summary.plan_path
        
        # Create candidate if requested
        if ($CreateCandidate -and $summary.patches -gt 0) {
            Write-Host ""
            Write-Host "===== Creating Candidate Library =====" -ForegroundColor Magenta
            
            $candidateScript = @"
import sys
import json
from pathlib import Path
from datetime import datetime

sys.path.insert(0, r'$ApiDir')

from prompt_reviewer import PromptReviewer, PromptPatchPlan
from prompt_versioning import PromptRegistry
from prompt_gates import PromptGates

# Load patch plan
plan_path = Path(r'$planPath')
with open(plan_path) as f:
    plan_data = json.load(f)
    plan = PromptPatchPlan(**plan_data)

# Load active library
prompts_dir = Path(r'$PromptsDir')
registry = PromptRegistry(prompts_dir)
active_lib = registry.load_active_library()

if not active_lib:
    print('ERROR: No active library found')
    sys.exit(1)

# Apply patches
candidate_lib = active_lib
success_count = 0
errors = []

for patch in plan.patches:
    from prompt_versioning import PromptPatch as PPatch
    ppatch = PPatch(**patch.dict())
    
    success, candidate_lib, patch_errors = registry.apply_patch(candidate_lib, ppatch)
    if success:
        success_count += 1
    else:
        errors.extend(patch_errors)

print(f'Applied {success_count}/{len(plan.patches)} patches')
if errors:
    print('Errors:')
    for err in errors:
        print(f'  - {err}')

# Run through gates
print('')
print('Running validation gates...')
evals_dir = prompts_dir / 'evals'
gates = PromptGates(evals_dir)

# Determine overall risk
risk_level = 'low'
if any(p.risk == 'high' for p in plan.patches):
    risk_level = 'high'
elif any(p.risk == 'medium' for p in plan.patches):
    risk_level = 'medium'

decision, gate_results, eval_results = gates.validate_candidate(candidate_lib, risk_level)

print(f'Gates: {decision.gates_passed}/{decision.gates_total} passed')
for gate in gate_results:
    status = 'PASS' if gate.passed else 'FAIL'
    print(f'  [{status}] {gate.gate_name}: {gate.details}')

print('')
print(f'Decision: {decision.action}')
print(f'Reason: {decision.reason}')

# Save candidate
candidates_dir = Path(r'$CandidatesDir')
candidates_dir.mkdir(parents=True, exist_ok=True)

timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
candidate_filename = f'candidate_{timestamp}.json'
candidate_path = candidates_dir / candidate_filename

with open(candidate_path, 'w') as f:
    json.dump({
        'run_id': plan.run_id,
        'timestamp': plan.timestamp,
        'risk_level': risk_level,
        'decision': decision.dict(),
        'gate_results': [g.dict() for g in gate_results],
        'library': candidate_lib
    }, f, indent=2)

print(f'Saved candidate to: {candidate_path}')

# Output for PowerShell
print('__CANDIDATE_JSON__')
print(json.dumps({
    'candidate_path': str(candidate_path),
    'decision': decision.action,
    'approved': decision.approved
}))
"@
            
            $tempCandidateScript = New-TemporaryFile
            $candidateScript | Out-File -FilePath $tempCandidateScript.FullName -Encoding UTF8
            
            $candidateOutput = python $tempCandidateScript.FullName 2>&1 | Out-String
            Write-Host $candidateOutput
            
            Remove-Item $tempCandidateScript.FullName -Force
            
            # Check if auto-apply
            if ($candidateOutput -match '__CANDIDATE_JSON__\s*(.*?)$') {
                $candidateJson = $Matches[1].Trim()
                $candidateInfo = $candidateJson | ConvertFrom-Json
                
                if ($AutoApply -and $candidateInfo.approved) {
                    Write-Host ""
                    Write-Host "Auto-applying candidate (risk is low and all gates passed)..." -ForegroundColor Green
                    
                    # Call approval script
                    & "$PSScriptRoot\Approve-PromptCandidate.ps1" -CandidatePath $candidateInfo.candidate_path
                } elseif ($candidateInfo.decision -eq "pending_approval") {
                    Write-Host ""
                    Write-Host "Candidate requires manual approval." -ForegroundColor Yellow
                    Write-Host "To approve, run:" -ForegroundColor Yellow
                    Write-Host "  .\Approve-PromptCandidate.ps1 -CandidatePath '$($candidateInfo.candidate_path)'" -ForegroundColor Cyan
                }
            }
        } elseif ($CreateCandidate) {
            Write-Host ""
            Write-Host "No patches to apply." -ForegroundColor Yellow
        }
    }
} finally {
    Remove-Item $tempScript.FullName -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Review complete!" -ForegroundColor Green
