#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Tracks artifact metrics via GitHub API
.DESCRIPTION
    Polls GitHub Actions API for artifact information and emits telemetry events.
    Note: GitHub API does not provide direct download counts, so we track:
    - Artifact creation/publication events
    - Artifact metadata (size, retention, etc.)
    
    Limitations:
    - GitHub API does not expose artifact download counts
    - We can only track when artifacts are created and their metadata
    - For actual download tracking, would need GitHub Enterprise or external proxy
.PARAMETER Owner
    Repository owner
.PARAMETER Repo
    Repository name
.PARAMETER Token
    GitHub API token (optional, uses GITHUB_TOKEN env var if not provided)
.PARAMETER Days
    Number of days to look back (default: 7)
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$Owner = "xfaith4",
    
    [Parameter(Mandatory = $false)]
    [string]$Repo = "UnifiedAIToolbox",
    
    [Parameter(Mandatory = $false)]
    [string]$Token = $env:GITHUB_TOKEN,
    
    [Parameter(Mandatory = $false)]
    [int]$Days = 7
)

# Import Telemetry module
$telemetryModulePath = Join-Path $PSScriptRoot "../../modules/Telemetry/Telemetry.psm1"
if (Test-Path $telemetryModulePath) {
    Import-Module $telemetryModulePath -Force
} else {
    Write-Error "Telemetry module not found at $telemetryModulePath"
    exit 1
}

Write-Host "Tracking artifact metrics for $Owner/$Repo" -ForegroundColor Cyan

# Check if token is available
if (-not $Token) {
    Write-Warning "No GitHub token provided. Set GITHUB_TOKEN environment variable or use -Token parameter."
    Write-Warning "Artifact tracking requires authentication to access GitHub API."
    exit 0
}

# Prepare API headers
$headers = @{
    'Authorization' = "Bearer $Token"
    'Accept' = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
}

# Calculate date filter
$sinceDate = (Get-Date).AddDays(-$Days).ToString("yyyy-MM-ddTHH:mm:ssZ")

try {
    # Get workflow runs from the past N days
    $runsUrl = "https://api.github.com/repos/$Owner/$Repo/actions/runs"
    Write-Verbose "Fetching workflow runs since $sinceDate"
    
    $runs = Invoke-RestMethod -Uri "$runsUrl?per_page=100" -Headers $headers -Method Get
    
    $totalArtifacts = 0
    $totalSize = 0
    $artifactsByWorkflow = @{}
    
    foreach ($run in $runs.workflow_runs) {
        # Skip runs older than our date filter
        $runDate = [DateTime]::Parse($run.created_at)
        if ($runDate -lt (Get-Date).AddDays(-$Days)) {
            continue
        }
        
        # Get artifacts for this run
        $artifactsUrl = $run.artifacts_url
        try {
            $artifactsResponse = Invoke-RestMethod -Uri $artifactsUrl -Headers $headers -Method Get
            
            foreach ($artifact in $artifactsResponse.artifacts) {
                $totalArtifacts++
                $totalSize += $artifact.size_in_bytes
                
                # Track by workflow
                $workflowName = $run.name
                if (-not $artifactsByWorkflow.ContainsKey($workflowName)) {
                    $artifactsByWorkflow[$workflowName] = @{
                        count = 0
                        size = 0
                    }
                }
                $artifactsByWorkflow[$workflowName].count++
                $artifactsByWorkflow[$workflowName].size += $artifact.size_in_bytes
                
                # Send telemetry for each artifact
                Send-TelemetryEvent -EventType "Artifact.Published" -Source "GitHubAPI" -Metadata @{
                    artifact_name = $artifact.name
                    artifact_id = $artifact.id
                    workflow_name = $workflowName
                    run_id = $run.id
                    size_bytes = $artifact.size_in_bytes
                    size_mb = [Math]::Round($artifact.size_in_bytes / 1MB, 2)
                    created_at = $artifact.created_at
                    expires_at = $artifact.expires_at
                    expired = $artifact.expired
                } -NoFlush
            }
        } catch {
            Write-Warning "Failed to fetch artifacts for run $($run.id): $_"
        }
    }
    
    # Flush telemetry
    Initialize-TelemetrySink
    $sink = (Get-Variable -Name TelemetrySink -Scope Script -ValueOnly)
    if ($sink) {
        $sink.Flush()
    }
    
    # Summary
    Write-Host "`nArtifact Metrics Summary (last $Days days):" -ForegroundColor Green
    Write-Host "  Total Artifacts: $totalArtifacts"
    Write-Host "  Total Size: $([Math]::Round($totalSize / 1MB, 2)) MB"
    Write-Host "  Workflows:"
    foreach ($workflow in $artifactsByWorkflow.Keys) {
        $stats = $artifactsByWorkflow[$workflow]
        Write-Host "    - $workflow : $($stats.count) artifacts ($([Math]::Round($stats.size / 1MB, 2)) MB)"
    }
    
    # Send summary telemetry
    Send-TelemetryEvent -EventType "Artifact.MetricsSummary" -Source "GitHubAPI" -Metadata @{
        period_days = $Days
        total_artifacts = $totalArtifacts
        total_size_mb = [Math]::Round($totalSize / 1MB, 2)
        workflows = $artifactsByWorkflow.Keys -join ", "
    }
    
    Write-Host "`n✓ Artifact metrics tracked successfully" -ForegroundColor Green
    
} catch {
    Write-Error "Failed to track artifact metrics: $_"
    
    # Send error telemetry
    Send-TelemetryEvent -EventType "Artifact.MetricsError" -Source "GitHubAPI" -Metadata @{
        error = $_.Exception.Message
    } -ErrorAction SilentlyContinue
    
    exit 1
}
