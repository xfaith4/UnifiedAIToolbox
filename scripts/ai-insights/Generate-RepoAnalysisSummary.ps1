#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Generates AI-powered summary of repository analysis
.DESCRIPTION
    Reads the latest repo analysis JSON file and uses AI to generate
    a concise, actionable summary with prioritized recommendations.
    
    IMPORTANT: This generates AI-assisted insights. Always validate
    AI suggestions with human review before taking action.
.PARAMETER JsonPath
    Path to the analysis JSON file (defaults to latest in artifacts/repo-analysis)
.PARAMETER OutputPath
    Path for the output markdown summary
.PARAMETER NoTelemetry
    Disable telemetry tracking
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$JsonPath,
    
    [Parameter(Mandatory = $false)]
    [string]$OutputPath,
    
    [Parameter(Mandatory = $false)]
    [switch]$NoTelemetry
)

$ErrorActionPreference = 'Stop'

# Import required modules
$aiClientPath = Join-Path $PSScriptRoot "../../modules/AIClient/AIClient.psm1"
$telemetryPath = Join-Path $PSScriptRoot "../../modules/Telemetry/Telemetry.psm1"

if (Test-Path $aiClientPath) {
    Import-Module $aiClientPath -Force
} else {
    Write-Error "AIClient module not found at $aiClientPath"
    exit 1
}

if (Test-Path $telemetryPath) {
    Import-Module $telemetryPath -Force
}

Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "    AI-Powered Repository Analysis Summary Generator" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$startTime = Get-Date

# Find the latest analysis JSON if not specified
if (-not $JsonPath) {
    $repoAnalysisDir = Join-Path $PSScriptRoot "../../artifacts/repo-analysis"
    
    if (-not (Test-Path $repoAnalysisDir)) {
        Write-Error "Repository analysis directory not found: $repoAnalysisDir"
        Write-Host "Run Run-RepoAnalysis.ps1 first to generate analysis data." -ForegroundColor Yellow
        exit 1
    }
    
    $jsonFiles = Get-ChildItem -Path $repoAnalysisDir -Filter "*.json" -File |
        Sort-Object LastWriteTime -Descending
    
    if ($jsonFiles.Count -eq 0) {
        Write-Error "No analysis JSON files found in $repoAnalysisDir"
        exit 1
    }
    
    $JsonPath = $jsonFiles[0].FullName
    Write-Host "Using latest analysis: $($jsonFiles[0].Name)" -ForegroundColor Green
}

# Validate JSON file exists
if (-not (Test-Path $JsonPath)) {
    Write-Error "Analysis JSON file not found: $JsonPath"
    exit 1
}

# Set output path if not specified
if (-not $OutputPath) {
    $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $outputDir = Join-Path $PSScriptRoot "../../artifacts/reports/repo-analysis"
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    $OutputPath = Join-Path $outputDir "RepoAnalysis_Summary_$timestamp.md"
}

# Read analysis JSON
Write-Host "Reading analysis data..." -ForegroundColor Cyan
try {
    $analysisJson = Get-Content $JsonPath -Raw
    $analysis = $analysisJson | ConvertFrom-Json
} catch {
    Write-Error "Failed to read or parse JSON file: $_"
    exit 1
}

# Load prompt template
$promptTemplatePath = Join-Path $PSScriptRoot "prompts/RepoAnalysisSummary.txt"
if (-not (Test-Path $promptTemplatePath)) {
    Write-Error "Prompt template not found: $promptTemplatePath"
    exit 1
}

$promptTemplate = Get-Content $promptTemplatePath -Raw

# Build prompt by replacing placeholder
$prompt = $promptTemplate -replace '\{ANALYSIS_JSON\}', $analysisJson

Write-Host "Generating AI summary..." -ForegroundColor Cyan
Write-Host "  Model: $($env:OPENAI_MODEL ?? 'gpt-4o-mini')" -ForegroundColor Gray
Write-Host "  This may take 10-30 seconds..." -ForegroundColor Gray
Write-Host ""

# Initialize AI client
Initialize-AIClient

# Send telemetry: AI generation started
if (-not $NoTelemetry) {
    Send-TelemetryEvent -EventType "AI.SummaryGeneration.Started" -Source "CLI" -Metadata @{
        type = "RepoAnalysis"
        analysis_file = (Split-Path $JsonPath -Leaf)
    } -ErrorAction SilentlyContinue
}

# Generate AI summary
try {
    $result = Invoke-AICompletion -Prompt $prompt -Temperature 0.7 -MaxTokens 1500
    
    if (-not $result.success) {
        Write-Warning "AI generation failed: $($result.error)"
        Write-Host ""
        Write-Host "The analysis JSON is still available at: $JsonPath" -ForegroundColor Yellow
        Write-Host "You can review it manually or try again later." -ForegroundColor Yellow
        
        # Send telemetry: AI generation failed
        if (-not $NoTelemetry) {
            Send-TelemetryEvent -EventType "AI.SummaryGeneration.Failed" -Source "CLI" -Metadata @{
                type = "RepoAnalysis"
                error = $result.error
            } -ErrorAction SilentlyContinue
        }
        
        exit 1
    }
    
    # Build markdown output
    $markdown = @"
# Repository Analysis Summary

> **Generated:** $(Get-Date -Format "yyyy-MM-dd HH:mm:ss UTC")  
> **Source:** $(Split-Path $JsonPath -Leaf)  
> **Model:** $($result.model)

---

## ⚠️ Advisory

This summary is AI-generated and should be used as a starting point for discussion.
Always validate findings with:
- Manual code review
- Security audits
- Team expertise
- Testing

---

$($result.content)

---

## Analysis Metadata

- **Health Score:** $($analysis.summary.health_score)/100
- **Health Status:** $($analysis.summary.overall_health)
- **Critical Issues:** $($analysis.summary.critical_issues)
- **Warnings:** $($analysis.summary.warnings)
- **Analysis Type:** $($analysis.metadata.analysis_type)
- **Timestamp:** $($analysis.metadata.timestamp)

## AI Generation Stats

- **Model:** $($result.model)
- **Tokens Used:** $($result.usage.total_tokens) (prompt: $($result.usage.prompt_tokens), completion: $($result.usage.completion_tokens))
- **Duration:** $($result.duration_seconds)s

---

*This summary was generated by the Unified AI Toolbox AI Insights module.*
"@

    # Write output
    $markdown | Out-File -FilePath $OutputPath -Encoding UTF8
    
    $duration = (Get-Date) - $startTime
    
    Write-Host "✓ AI summary generated successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Summary saved to:" -ForegroundColor Cyan
    Write-Host "  $OutputPath" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Generation Stats:" -ForegroundColor Cyan
    Write-Host "  Duration: $([Math]::Round($duration.TotalSeconds, 2))s"
    Write-Host "  Tokens: $($result.usage.total_tokens)"
    Write-Host "  Model: $($result.model)"
    Write-Host ""
    
    # Send telemetry: AI generation completed
    if (-not $NoTelemetry) {
        Send-TelemetryEvent -EventType "AI.SummaryGeneration.Completed" -Source "CLI" -Metadata @{
            type = "RepoAnalysis"
            success = $true
            duration_seconds = [Math]::Round($duration.TotalSeconds, 2)
            tokens_used = $result.usage.total_tokens
            model = $result.model
            output_file = (Split-Path $OutputPath -Leaf)
        } -ErrorAction SilentlyContinue
    }
    
} catch {
    Write-Error "Failed to generate AI summary: $_"
    
    # Send telemetry: AI generation error
    if (-not $NoTelemetry) {
        Send-TelemetryEvent -EventType "AI.SummaryGeneration.Error" -Source "CLI" -Metadata @{
            type = "RepoAnalysis"
            error = $_.Exception.Message
        } -ErrorAction SilentlyContinue
    }
    
    exit 1
}
