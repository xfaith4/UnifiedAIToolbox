#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Comprehensive repository health analysis script
.DESCRIPTION
    Analyzes repository health including:
    - Code quality metrics
    - Test coverage
    - Build status
    - Dependency health
    - Security posture
    - Documentation completeness
.PARAMETER OutputPath
    Path where the analysis report will be saved (JSON format)
.PARAMETER AnalysisType
    Type of analysis: 'full', 'quick', or 'security-only'
.PARAMETER IncludeMetrics
    Include detailed metrics in the report
.EXAMPLE
    .\Run-RepoAnalysis.ps1 -OutputPath "reports/analysis.json" -AnalysisType full
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$OutputPath = "artifacts/repo-analysis/repo-health-$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss').json",
    
    [Parameter(Mandatory = $false)]
    [ValidateSet('full', 'quick', 'security-only')]
    [string]$AnalysisType = 'full',
    
    [Parameter(Mandatory = $false)]
    [bool]$IncludeMetrics = $true
)

$ErrorActionPreference = 'Continue'
$WarningPreference = 'Continue'

# Import Telemetry module
$telemetryModulePath = Join-Path $PSScriptRoot "../modules/Telemetry/Telemetry.psm1"
if (Test-Path $telemetryModulePath) {
    Import-Module $telemetryModulePath -Force
} else {
    Write-Warning "Telemetry module not found at $telemetryModulePath - telemetry disabled"
}

# ANSI colors
$Colors = @{
    Green  = "`e[32m"
    Yellow = "`e[33m"
    Red    = "`e[31m"
    Blue   = "`e[34m"
    Cyan   = "`e[36m"
    Reset  = "`e[0m"
}

# Determine source (GitHub Actions or local)
$telemetrySource = if ($env:GITHUB_ACTIONS -eq 'true') { "GitHubAction" } else { "CLI" }

# Send telemetry: Analysis started
Send-TelemetryEvent -EventType "RepoAnalysis.Started" -Source $telemetrySource -Metadata @{
    analysis_type = $AnalysisType
    include_metrics = $IncludeMetrics
    run_id = $env:GITHUB_RUN_ID
    actor = $env:GITHUB_ACTOR
} -ErrorAction SilentlyContinue

$analysisStartTime = Get-Date

Write-Host "$($Colors.Cyan)═══════════════════════════════════════════════════════════$($Colors.Reset)"
Write-Host "$($Colors.Cyan)        Repository Health Analysis$($Colors.Reset)"
Write-Host "$($Colors.Cyan)═══════════════════════════════════════════════════════════$($Colors.Reset)"
Write-Host ""
Write-Host "Analysis Type: $($Colors.Yellow)$AnalysisType$($Colors.Reset)"
Write-Host "Output Path: $($Colors.Yellow)$OutputPath$($Colors.Reset)"
Write-Host ""

# Initialize analysis report
$analysis = @{
    metadata = @{
        timestamp = (Get-Date -Format "o")
        analysis_type = $AnalysisType
        repository = "UnifiedAIToolbox"
        version = "1.5"
    }
    summary = @{
        overall_health = "unknown"
        critical_issues = 0
        warnings = 0
        recommendations = @()
    }
}

# ============================================================================
# Helper Functions
# ============================================================================

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "$($Colors.Blue)▶ $Title$($Colors.Reset)"
}

function Write-Metric {
    param(
        [string]$Name,
        [string]$Value,
        [string]$Status = "info"  # info, success, warning, error
    )
    
    $symbol = switch ($Status) {
        "success" { "✓" }
        "warning" { "⚠" }
        "error"   { "✗" }
        default   { "•" }
    }
    
    $color = switch ($Status) {
        "success" { $Colors.Green }
        "warning" { $Colors.Yellow }
        "error"   { $Colors.Red }
        default   { $Colors.Reset }
    }
    
    Write-Host "  ${color}${symbol}$($Colors.Reset) ${Name}: $Value"
}

# ============================================================================
# File Structure Analysis
# ============================================================================
Write-Section "1. File Structure Analysis"

$fileStats = @{
    total_files = (Get-ChildItem -Recurse -File | Where-Object { $_.FullName -notmatch 'node_modules|\.venv|\.git|bin|obj' }).Count
    powershell_files = (Get-ChildItem -Recurse -Filter "*.ps1" -File | Where-Object { $_.FullName -notmatch 'node_modules|\.venv' }).Count
    python_files = (Get-ChildItem -Recurse -Filter "*.py" -File | Where-Object { $_.FullName -notmatch 'node_modules|\.venv' }).Count
    typescript_files = (Get-ChildItem -Recurse -Filter "*.ts" -File | Where-Object { $_.FullName -notmatch 'node_modules' }).Count + 
                       (Get-ChildItem -Recurse -Filter "*.tsx" -File | Where-Object { $_.FullName -notmatch 'node_modules' }).Count
    csharp_files = (Get-ChildItem -Recurse -Filter "*.cs" -File).Count
}

Write-Metric "Total Files" $fileStats.total_files "info"
Write-Metric "PowerShell Scripts" $fileStats.powershell_files "info"
Write-Metric "Python Files" $fileStats.python_files "info"
Write-Metric "TypeScript Files" $fileStats.typescript_files "info"
Write-Metric "C# Files" $fileStats.csharp_files "info"

$analysis.file_structure = $fileStats

# ============================================================================
# Code Quality Analysis
# ============================================================================
if ($AnalysisType -in @('full', 'quick')) {
    Write-Section "2. Code Quality Analysis"
    
    $codeQuality = @{
        powershell = @{
            files_scanned = 0
            issues_found = 0
            critical_issues = 0
        }
        python = @{
            files_scanned = 0
            issues_found = 0
        }
    }
    
    # PowerShell analysis
    try {
        $psScripts = Get-ChildItem -Recurse -Filter "*.ps1" -File | 
            Where-Object { $_.FullName -notmatch 'node_modules|\.venv|archive' } |
            Select-Object -First 50  # Limit for performance
        
        $codeQuality.powershell.files_scanned = $psScripts.Count
        Write-Metric "PowerShell Files Scanned" $psScripts.Count "info"
        
        # Note: PSScriptAnalyzer would be called here if installed
        # For now, just count files
        
    } catch {
        Write-Warning "PowerShell analysis error: $_"
    }
    
    # Python analysis (basic)
    try {
        $pyFiles = Get-ChildItem -Recurse -Filter "*.py" -File | 
            Where-Object { $_.FullName -notmatch 'node_modules|\.venv|__pycache__' }
        
        $codeQuality.python.files_scanned = $pyFiles.Count
        Write-Metric "Python Files Scanned" $pyFiles.Count "info"
        
    } catch {
        Write-Warning "Python analysis error: $_"
    }
    
    $analysis.code_quality = $codeQuality
}

# ============================================================================
# Dependency Analysis
# ============================================================================
if ($AnalysisType -in @('full', 'quick')) {
    Write-Section "3. Dependency Analysis"
    
    $dependencies = @{
        npm_packages = @()
        python_packages = @()
        dotnet_packages = @()
    }
    
    # Check npm packages
    $packageJsonFiles = Get-ChildItem -Recurse -Filter "package.json" -File | 
        Where-Object { $_.FullName -notmatch 'node_modules' }
    
    $dependencies.npm_packages = $packageJsonFiles | ForEach-Object {
        $pkg = Get-Content $_.FullName -Raw | ConvertFrom-Json
        @{
            path = $_.DirectoryName
            name = $pkg.name
            version = $pkg.version
            has_dependencies = [bool]$pkg.dependencies
            has_dev_dependencies = [bool]$pkg.devDependencies
        }
    }
    
    Write-Metric "Package.json Files Found" $dependencies.npm_packages.Count "info"
    
    # Check Python requirements
    $requirementsFiles = Get-ChildItem -Recurse -Filter "requirements.txt" -File |
        Where-Object { $_.FullName -notmatch 'node_modules|\.venv' }
    
    Write-Metric "Requirements.txt Files Found" $requirementsFiles.Count "info"
    
    # Check .NET projects
    $csprojFiles = Get-ChildItem -Recurse -Filter "*.csproj" -File
    $dependencies.dotnet_packages = $csprojFiles.Count
    
    Write-Metric ".NET Project Files Found" $csprojFiles.Count "info"
    
    $analysis.dependencies = $dependencies
}

# ============================================================================
# Test Coverage Analysis
# ============================================================================
if ($AnalysisType -eq 'full') {
    Write-Section "4. Test Coverage Analysis"
    
    $testCoverage = @{
        test_files = @{
            powershell = (Get-ChildItem -Path "tests" -Filter "*.Tests.ps1" -File -ErrorAction SilentlyContinue).Count
            python = (Get-ChildItem -Path "tests" -Filter "test_*.py" -File -ErrorAction SilentlyContinue).Count +
                     (Get-ChildItem -Recurse -Filter "test_*.py" -File | Where-Object { $_.FullName -match 'tests' }).Count
            typescript = (Get-ChildItem -Recurse -Filter "*.test.ts*" -File | Where-Object { $_.FullName -notmatch 'node_modules' }).Count
        }
        total_test_files = 0
    }
    
    $testCoverage.total_test_files = $testCoverage.test_files.powershell + 
                                      $testCoverage.test_files.python + 
                                      $testCoverage.test_files.typescript
    
    Write-Metric "Total Test Files" $testCoverage.total_test_files "info"
    Write-Metric "PowerShell Tests" $testCoverage.test_files.powershell "info"
    Write-Metric "Python Tests" $testCoverage.test_files.python "info"
    Write-Metric "TypeScript Tests" $testCoverage.test_files.typescript "info"
    
    $analysis.test_coverage = $testCoverage
}

# ============================================================================
# Documentation Analysis
# ============================================================================
if ($AnalysisType -eq 'full') {
    Write-Section "5. Documentation Analysis"
    
    $documentation = @{
        markdown_files = (Get-ChildItem -Recurse -Filter "*.md" -File | Where-Object { $_.FullName -notmatch 'node_modules|\.venv' }).Count
        has_readme = (Test-Path "README.md")
        has_contributing = (Test-Path "CONTRIBUTING.md")
        has_docs_folder = (Test-Path "docs")
        docs_in_folder = 0
    }
    
    if ($documentation.has_docs_folder) {
        $documentation.docs_in_folder = (Get-ChildItem -Path "docs" -Recurse -Filter "*.md" -File).Count
    }
    
    Write-Metric "Markdown Files" $documentation.markdown_files "info"
    Write-Metric "README.md" $(if ($documentation.has_readme) { "✓ Present" } else { "✗ Missing" }) $(if ($documentation.has_readme) { "success" } else { "warning" })
    Write-Metric "CONTRIBUTING.md" $(if ($documentation.has_contributing) { "✓ Present" } else { "✗ Missing" }) $(if ($documentation.has_contributing) { "success" } else { "warning" })
    Write-Metric "Docs Folder" $(if ($documentation.has_docs_folder) { "$($documentation.docs_in_folder) files" } else { "✗ Missing" }) $(if ($documentation.has_docs_folder) { "success" } else { "warning" })
    
    $analysis.documentation = $documentation
}

# ============================================================================
# Security Analysis
# ============================================================================
if ($AnalysisType -in @('full', 'security-only')) {
    Write-Section "6. Security Analysis"
    
    $security = @{
        has_gitignore = (Test-Path ".gitignore")
        has_security_notice = (Test-Path "SECURITY_NOTICE_OAUTH.md") -or (Test-Path "SECURITY.md")
        exposed_secrets_check = "passed"
        critical_vulnerabilities = 0
    }
    
    # Check for potentially exposed secrets in common locations
    $sensitivePatterns = @('.env$', 'client_secret.*\.json$', '.*\.key$', '.*\.pem$')
    $exposedFiles = @()
    
    foreach ($pattern in $sensitivePatterns) {
        $files = Get-ChildItem -Recurse -File | 
            Where-Object { $_.Name -match $pattern -and $_.FullName -notmatch 'node_modules|\.venv|\.git' }
        
        foreach ($file in $files) {
            # Get relative path using Resolve-Path for proper handling
            try {
                $relativePath = Resolve-Path $file.FullName -Relative
            } catch {
                # Fallback if Resolve-Path fails
                $relativePath = $file.FullName
            }
            
            # Use git check-ignore if git is available, otherwise skip detailed check
            $inGitignore = $false
            if (Get-Command git -ErrorAction SilentlyContinue) {
                try {
                    $gitCheckResult = git check-ignore $relativePath 2>$null
                    $inGitignore = [bool]$gitCheckResult
                } catch {
                    # Git check failed, assume not in gitignore
                }
            }
            
            if (-not $inGitignore) {
                $exposedFiles += $relativePath
            }
        }
    }
    
    if ($exposedFiles.Count -gt 0) {
        $security.exposed_secrets_check = "warning"
        $security.potentially_exposed_files = $exposedFiles
        $analysis.summary.warnings += $exposedFiles.Count
        $analysis.summary.recommendations += "Review potentially sensitive files: $($exposedFiles -join ', ')"
    }
    
    Write-Metric "GitIgnore Present" $(if ($security.has_gitignore) { "✓ Yes" } else { "✗ No" }) $(if ($security.has_gitignore) { "success" } else { "error" })
    Write-Metric "Security Documentation" $(if ($security.has_security_notice) { "✓ Yes" } else { "✗ No" }) $(if ($security.has_security_notice) { "success" } else { "warning" })
    Write-Metric "Exposed Secrets Check" $security.exposed_secrets_check $(if ($security.exposed_secrets_check -eq "passed") { "success" } else { "warning" })
    
    if ($exposedFiles.Count -gt 0) {
        Write-Warning "Found $($exposedFiles.Count) potentially sensitive file(s) that may not be in .gitignore"
    }
    
    $analysis.security = $security
}

# ============================================================================
# Build Configuration Analysis
# ============================================================================
if ($AnalysisType -eq 'full') {
    Write-Section "7. Build Configuration Analysis"
    
    $buildConfig = @{
        has_github_workflows = (Test-Path ".github/workflows")
        workflow_count = 0
        has_docker_compose = (Test-Path "docker-compose.yml") -or (Test-Path "docker-compose.yaml")
        has_solution_file = (Test-Path "UnifiedAIToolbox.sln")
    }
    
    if ($buildConfig.has_github_workflows) {
        $buildConfig.workflow_count = (Get-ChildItem -Path ".github/workflows" -Filter "*.yml" -File).Count +
                                       (Get-ChildItem -Path ".github/workflows" -Filter "*.yaml" -File).Count
    }
    
    Write-Metric "GitHub Workflows" $(if ($buildConfig.has_github_workflows) { "$($buildConfig.workflow_count) workflows" } else { "✗ None" }) $(if ($buildConfig.workflow_count -gt 0) { "success" } else { "warning" })
    Write-Metric "Docker Compose" $(if ($buildConfig.has_docker_compose) { "✓ Present" } else { "✗ Missing" }) $(if ($buildConfig.has_docker_compose) { "info" } else { "info" })
    Write-Metric "Solution File" $(if ($buildConfig.has_solution_file) { "✓ Present" } else { "✗ Missing" }) $(if ($buildConfig.has_solution_file) { "success" } else { "info" })
    
    $analysis.build = $buildConfig
}

# ============================================================================
# Generate Summary
# ============================================================================
Write-Section "8. Generating Summary"

# Calculate overall health score
$healthScore = 100
$criticalIssues = 0
$warnings = 0

# Deduct points for missing critical items
if ($analysis.ContainsKey('documentation')) {
    if (-not $analysis.documentation.has_readme) { $healthScore -= 10; $warnings++ }
}

if ($analysis.ContainsKey('security')) {
    if (-not $analysis.security.has_gitignore) { $healthScore -= 15; $criticalIssues++ }
    if ($analysis.security.exposed_secrets_check -eq "warning") { $healthScore -= 10; $warnings++ }
}

if ($analysis.ContainsKey('test_coverage')) {
    if ($analysis.test_coverage.total_test_files -eq 0) { $healthScore -= 20; $warnings++ }
}

# Determine overall health status
$healthStatus = if ($healthScore -ge 90) { "excellent" }
    elseif ($healthScore -ge 75) { "good" }
    elseif ($healthScore -ge 60) { "fair" }
    else { "needs-improvement" }

$analysis.summary.overall_health = $healthStatus
$analysis.summary.health_score = $healthScore
$analysis.summary.critical_issues = $criticalIssues
$analysis.summary.warnings = $warnings

Write-Host ""
Write-Host "$($Colors.Cyan)═══════════════════════════════════════════════════════════$($Colors.Reset)"
Write-Host "$($Colors.Cyan)                    Summary$($Colors.Reset)"
Write-Host "$($Colors.Cyan)═══════════════════════════════════════════════════════════$($Colors.Reset)"
Write-Host ""
Write-Host "Overall Health: $($Colors.Yellow)$healthStatus$($Colors.Reset) (Score: $healthScore/100)"
Write-Host "Critical Issues: $($Colors.Red)$criticalIssues$($Colors.Reset)"
Write-Host "Warnings: $($Colors.Yellow)$warnings$($Colors.Reset)"

if ($analysis.summary.recommendations.Count -gt 0) {
    Write-Host ""
    Write-Host "Recommendations:"
    foreach ($rec in $analysis.summary.recommendations) {
        Write-Host "  • $rec" -ForegroundColor Yellow
    }
}

# ============================================================================
# Save Report
# ============================================================================
Write-Section "9. Saving Report"

# Ensure output directory exists
$outputDir = Split-Path $OutputPath -Parent
if ($outputDir -and -not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

# Save JSON report
$analysis | ConvertTo-Json -Depth 10 | Out-File $OutputPath -Encoding UTF8

$analysisEndTime = Get-Date
$analysisDuration = ($analysisEndTime - $analysisStartTime).TotalSeconds

Write-Host ""
Write-Host "$($Colors.Green)✓ Analysis complete!$($Colors.Reset)"
Write-Host "Report saved to: $($Colors.Yellow)$OutputPath$($Colors.Reset)"
Write-Host "Duration: $($Colors.Yellow)$([Math]::Round($analysisDuration, 2))s$($Colors.Reset)"
Write-Host ""

# Send telemetry: Analysis completed
Send-TelemetryEvent -EventType "RepoAnalysis.Completed" -Source $telemetrySource -Metadata @{
    analysis_type = $AnalysisType
    duration_seconds = [Math]::Round($analysisDuration, 2)
    health_score = $healthScore
    health_status = $healthStatus
    critical_issues = $criticalIssues
    warnings = $warnings
    output_file = (Split-Path $OutputPath -Leaf)
    run_id = $env:GITHUB_RUN_ID
    success = $true
} -ErrorAction SilentlyContinue

# Return analysis object for pipeline use
return $analysis
