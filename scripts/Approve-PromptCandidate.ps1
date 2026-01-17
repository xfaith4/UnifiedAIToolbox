<#
.SYNOPSIS
    Approve and activate a prompt library candidate.

.DESCRIPTION
    Activates a candidate library by:
    1. Loading the candidate
    2. Creating a versioned snapshot
    3. Updating agent-library.active.json
    4. Adding changelog entry
    
.PARAMETER CandidatePath
    Path to candidate JSON file.

.PARAMETER Force
    Skip confirmation prompt.

.EXAMPLE
    .\Approve-PromptCandidate.ps1 -CandidatePath "./prompts/candidates/candidate_20240115_120000.json"
    
.EXAMPLE
    .\Approve-PromptCandidate.ps1 -CandidatePath $path -Force
    Approve without confirmation.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$CandidatePath,
    
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# Paths
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ApiDir = Join-Path $RepoRoot "apps/UnifiedPromptApp/services/prompt-api"
$PromptsDir = Join-Path $RepoRoot "prompts"

# Ensure Python is available
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Error "Python not found. Please install Python 3.12+ and ensure it's in your PATH."
    exit 1
}

# Validate candidate path
if (-not (Test-Path $CandidatePath)) {
    Write-Error "Candidate file not found: $CandidatePath"
    exit 1
}

Write-Host ""
Write-Host "===== Approve Prompt Library Candidate =====" -ForegroundColor Magenta
Write-Host "Candidate: $CandidatePath" -ForegroundColor Yellow
Write-Host ""

# Load candidate info
$candidate = Get-Content $CandidatePath -Raw | ConvertFrom-Json

Write-Host "Run ID: $($candidate.run_id)"
Write-Host "Risk Level: $($candidate.risk_level)"
Write-Host "Decision: $($candidate.decision.action)"
Write-Host ""

# Show gate results
Write-Host "Gate Results:" -ForegroundColor Cyan
foreach ($gate in $candidate.gate_results) {
    $status = if ($gate.passed) { "[PASS]" } else { "[FAIL]" }
    $color = if ($gate.passed) { "Green" } else { "Red" }
    Write-Host "  $status $($gate.gate_name)" -ForegroundColor $color
    if ($gate.details) {
        Write-Host "    $($gate.details)" -ForegroundColor Gray
    }
}
Write-Host ""

# Confirm if not forced
if (-not $Force) {
    $confirmation = Read-Host "Approve and activate this candidate? (yes/no)"
    if ($confirmation -ne "yes") {
        Write-Host "Approval cancelled." -ForegroundColor Yellow
        exit 0
    }
}

# Create Python script to activate
$pythonScript = @"
import sys
import json
from pathlib import Path

sys.path.insert(0, r'$ApiDir')

from prompt_versioning import PromptRegistry

# Load candidate
candidate_path = Path(r'$CandidatePath')
with open(candidate_path) as f:
    candidate_data = json.load(f)

candidate_lib = candidate_data['library']
run_id = candidate_data['run_id']

# Initialize registry
prompts_dir = Path(r'$PromptsDir')
registry = PromptRegistry(prompts_dir)

# Get current active library for parent version tracking
current_lib = registry.load_active_library()
parent_version = None
if current_lib:
    parent_hash = registry.compute_library_hash(current_lib)[:8]
    # Find parent version by hash
    versions = registry.list_versions()
    for v in versions:
        if v.get('library_hash', '').startswith(parent_hash):
            parent_version = v.get('version_id')
            break

# Create version
description = f'Auto-applied from run {run_id}'
version_id, version_path = registry.create_version(
    candidate_lib,
    description,
    created_by='promptops',
    parent_version=parent_version
)

print(f'Created version: {version_id}')
print(f'Version path: {version_path}')

# Activate version
success = registry.activate_version(version_id)
if not success:
    print('ERROR: Failed to activate version')
    sys.exit(1)

print(f'Activated version {version_id}')

# Add changelog entry
changes = []
if 'decision' in candidate_data and 'reason' in candidate_data['decision']:
    changes.append(candidate_data['decision']['reason'])
changes.append(f'Applied from run {run_id}')

registry.add_changelog_entry(version_id, description, changes)
print('Updated changelog')

print('')
print('=== SUCCESS ===')
print(f'Prompt library updated to version {version_id}')
print(f'Active library hash: {registry.get_active_hash()[:16]}...')

# Output for PowerShell
print('__SUCCESS_JSON__')
print(json.dumps({
    'version_id': version_id,
    'active_hash': registry.get_active_hash()
}))
"@

# Run Python activation
$tempScript = New-TemporaryFile
$pythonScript | Out-File -FilePath $tempScript.FullName -Encoding UTF8

try {
    Write-Host "Activating candidate..." -ForegroundColor Cyan
    $output = python $tempScript.FullName 2>&1 | Out-String
    Write-Host $output
    
    if ($output -match '__SUCCESS_JSON__\s*(.*?)$') {
        $successJson = $Matches[1].Trim()
        $result = $successJson | ConvertFrom-Json
        
        Write-Host ""
        Write-Host "===== ACTIVATED =====" -ForegroundColor Green
        Write-Host "Version: $($result.version_id)" -ForegroundColor Green
        Write-Host "Hash: $($result.active_hash.Substring(0, 16))..." -ForegroundColor Green
        Write-Host ""
        Write-Host "The new prompt library is now active!" -ForegroundColor Green
        
        # Archive the candidate
        $archivePath = [System.IO.Path]::ChangeExtension($CandidatePath, ".approved.json")
        Move-Item -Path $CandidatePath -Destination $archivePath -Force
        Write-Host "Archived candidate to: $archivePath" -ForegroundColor Gray
    } else {
        Write-Error "Failed to parse activation result"
        exit 1
    }
} finally {
    Remove-Item $tempScript.FullName -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "Activation complete!" -ForegroundColor Green
