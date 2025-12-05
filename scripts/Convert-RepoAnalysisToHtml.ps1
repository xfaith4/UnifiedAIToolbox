#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Converts repository analysis JSON report to HTML format
.DESCRIPTION
    Takes a JSON analysis report and generates a formatted HTML report
    suitable for viewing in a browser or embedding in dashboards
.PARAMETER JsonPath
    Path to the JSON analysis report
.PARAMETER OutputPath
    Path where the HTML report will be saved
.EXAMPLE
    .\Convert-RepoAnalysisToHtml.ps1 -JsonPath "analysis.json" -OutputPath "analysis.html"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$JsonPath,
    
    [Parameter(Mandatory = $false)]
    [string]$OutputPath = ""
)

$ErrorActionPreference = 'Stop'

# Load System.Web for HTML encoding
Add-Type -AssemblyName System.Web

# If no output path specified, use same name as JSON with .html extension
if (-not $OutputPath) {
    $OutputPath = $JsonPath -replace '\.json$', '.html'
}

Write-Host "Converting $JsonPath to HTML..." -ForegroundColor Cyan

# Read JSON report
$analysis = Get-Content $JsonPath -Raw | ConvertFrom-Json

# Generate HTML
$html = @"
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Repository Health Analysis - $($analysis.metadata.repository)</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
        }
        
        .header .subtitle {
            font-size: 1.1em;
            opacity: 0.9;
        }
        
        .summary {
            padding: 40px;
            background: #f8f9fa;
            border-bottom: 3px solid #667eea;
        }
        
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        
        .metric-card {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            text-align: center;
        }
        
        .metric-card .label {
            font-size: 0.9em;
            color: #666;
            margin-bottom: 10px;
        }
        
        .metric-card .value {
            font-size: 2em;
            font-weight: bold;
            color: #667eea;
        }
        
        .health-badge {
            display: inline-block;
            padding: 8px 20px;
            border-radius: 20px;
            font-weight: bold;
            text-transform: uppercase;
            font-size: 0.9em;
        }
        
        .health-excellent { background: #10b981; color: white; }
        .health-good { background: #3b82f6; color: white; }
        .health-fair { background: #f59e0b; color: white; }
        .health-needs-improvement { background: #ef4444; color: white; }
        
        .content {
            padding: 40px;
        }
        
        .section {
            margin-bottom: 40px;
        }
        
        .section h2 {
            color: #667eea;
            margin-bottom: 20px;
            padding-bottom: 10px;
            border-bottom: 2px solid #e5e7eb;
        }
        
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
            margin-top: 15px;
        }
        
        .info-item {
            padding: 15px;
            background: #f8f9fa;
            border-radius: 6px;
            border-left: 4px solid #667eea;
        }
        
        .info-item .info-label {
            font-size: 0.85em;
            color: #666;
            margin-bottom: 5px;
        }
        
        .info-item .info-value {
            font-size: 1.1em;
            font-weight: 500;
            color: #333;
        }
        
        .status-icon {
            display: inline-block;
            width: 10px;
            height: 10px;
            border-radius: 50%;
            margin-right: 8px;
        }
        
        .status-success { background: #10b981; }
        .status-warning { background: #f59e0b; }
        .status-error { background: #ef4444; }
        .status-info { background: #3b82f6; }
        
        .recommendations {
            background: #fef3c7;
            border-left: 4px solid #f59e0b;
            padding: 20px;
            border-radius: 6px;
            margin-top: 20px;
        }
        
        .recommendations h3 {
            color: #92400e;
            margin-bottom: 10px;
        }
        
        .recommendations ul {
            list-style: none;
            padding-left: 0;
        }
        
        .recommendations li {
            padding: 8px 0;
            color: #78350f;
        }
        
        .recommendations li:before {
            content: "⚠ ";
            margin-right: 8px;
        }
        
        .footer {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #666;
            font-size: 0.9em;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
        }
        
        th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid #e5e7eb;
        }
        
        th {
            background: #f8f9fa;
            font-weight: 600;
            color: #667eea;
        }
        
        tr:hover {
            background: #f8f9fa;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 Repository Health Analysis</h1>
            <div class="subtitle">$($analysis.metadata.repository) - Version $($analysis.metadata.version)</div>
            <div class="subtitle">Generated: $($analysis.metadata.timestamp)</div>
        </div>
        
        <div class="summary">
            <h2>Overall Health Status</h2>
            <div style="text-align: center; margin: 30px 0;">
                <span class="health-badge health-$($analysis.summary.overall_health)">
                    $($analysis.summary.overall_health.ToUpper())
                </span>
            </div>
            
            <div class="summary-grid">
                <div class="metric-card">
                    <div class="label">Health Score</div>
                    <div class="value">$($analysis.summary.health_score)/100</div>
                </div>
                <div class="metric-card">
                    <div class="label">Critical Issues</div>
                    <div class="value" style="color: #ef4444;">$($analysis.summary.critical_issues)</div>
                </div>
                <div class="metric-card">
                    <div class="label">Warnings</div>
                    <div class="value" style="color: #f59e0b;">$($analysis.summary.warnings)</div>
                </div>
                <div class="metric-card">
                    <div class="label">Total Files</div>
                    <div class="value" style="color: #3b82f6;">$($analysis.file_structure.total_files)</div>
                </div>
            </div>
"@

# Add recommendations if present
if ($analysis.summary.recommendations -and $analysis.summary.recommendations.Count -gt 0) {
    $html += @"
            
            <div class="recommendations">
                <h3>Recommendations</h3>
                <ul>
"@
    foreach ($rec in $analysis.summary.recommendations) {
        # HTML encode the recommendation to prevent XSS
        $encodedRec = [System.Web.HttpUtility]::HtmlEncode($rec)
        $html += "                    <li>$encodedRec</li>`n"
    }
    $html += @"
                </ul>
            </div>
"@
}

$html += @"
        </div>
        
        <div class="content">
"@

# File Structure Section
if ($analysis.file_structure) {
    $html += @"
            <div class="section">
                <h2>📁 File Structure</h2>
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">PowerShell Scripts</div>
                        <div class="info-value">$($analysis.file_structure.powershell_files) files</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Python Files</div>
                        <div class="info-value">$($analysis.file_structure.python_files) files</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">TypeScript Files</div>
                        <div class="info-value">$($analysis.file_structure.typescript_files) files</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">C# Files</div>
                        <div class="info-value">$($analysis.file_structure.csharp_files) files</div>
                    </div>
                </div>
            </div>
"@
}

# Test Coverage Section
if ($analysis.test_coverage) {
    $html += @"
            <div class="section">
                <h2>🧪 Test Coverage</h2>
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">Total Test Files</div>
                        <div class="info-value">$($analysis.test_coverage.total_test_files) files</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">PowerShell Tests</div>
                        <div class="info-value">$($analysis.test_coverage.test_files.powershell) files</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Python Tests</div>
                        <div class="info-value">$($analysis.test_coverage.test_files.python) files</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">TypeScript Tests</div>
                        <div class="info-value">$($analysis.test_coverage.test_files.typescript) files</div>
                    </div>
                </div>
            </div>
"@
}

# Documentation Section
if ($analysis.documentation) {
    $docStatus = if ($analysis.documentation.has_readme) { "success" } else { "error" }
    $contribStatus = if ($analysis.documentation.has_contributing) { "success" } else { "warning" }
    $docsStatus = if ($analysis.documentation.has_docs_folder) { "success" } else { "warning" }
    
    $html += @"
            <div class="section">
                <h2>📚 Documentation</h2>
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">
                            <span class="status-icon status-$docStatus"></span>README.md
                        </div>
                        <div class="info-value">$(if ($analysis.documentation.has_readme) { "Present" } else { "Missing" })</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">
                            <span class="status-icon status-$contribStatus"></span>CONTRIBUTING.md
                        </div>
                        <div class="info-value">$(if ($analysis.documentation.has_contributing) { "Present" } else { "Missing" })</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">
                            <span class="status-icon status-$docsStatus"></span>Docs Folder
                        </div>
                        <div class="info-value">$(if ($analysis.documentation.has_docs_folder) { "$($analysis.documentation.docs_in_folder) files" } else { "Missing" })</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Total Markdown Files</div>
                        <div class="info-value">$($analysis.documentation.markdown_files) files</div>
                    </div>
                </div>
            </div>
"@
}

# Security Section
if ($analysis.security) {
    $gitignoreStatus = if ($analysis.security.has_gitignore) { "success" } else { "error" }
    $secDocStatus = if ($analysis.security.has_security_notice) { "success" } else { "warning" }
    $secretsStatus = if ($analysis.security.exposed_secrets_check -eq "passed") { "success" } else { "warning" }
    
    $html += @"
            <div class="section">
                <h2>🔒 Security</h2>
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">
                            <span class="status-icon status-$gitignoreStatus"></span>.gitignore
                        </div>
                        <div class="info-value">$(if ($analysis.security.has_gitignore) { "Present" } else { "Missing" })</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">
                            <span class="status-icon status-$secDocStatus"></span>Security Documentation
                        </div>
                        <div class="info-value">$(if ($analysis.security.has_security_notice) { "Present" } else { "Missing" })</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">
                            <span class="status-icon status-$secretsStatus"></span>Exposed Secrets Check
                        </div>
                        <div class="info-value">$($analysis.security.exposed_secrets_check)</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Critical Vulnerabilities</div>
                        <div class="info-value">$($analysis.security.critical_vulnerabilities)</div>
                    </div>
                </div>
            </div>
"@
}

# Build Configuration Section
if ($analysis.build) {
    $workflowStatus = if ($analysis.build.workflow_count -gt 0) { "success" } else { "warning" }
    
    $html += @"
            <div class="section">
                <h2>🔧 Build Configuration</h2>
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">
                            <span class="status-icon status-$workflowStatus"></span>GitHub Workflows
                        </div>
                        <div class="info-value">$($analysis.build.workflow_count) workflows</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Docker Compose</div>
                        <div class="info-value">$(if ($analysis.build.has_docker_compose) { "Present" } else { "Not Found" })</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">.NET Solution</div>
                        <div class="info-value">$(if ($analysis.build.has_solution_file) { "Present" } else { "Not Found" })</div>
                    </div>
                </div>
            </div>
"@
}

# Add Telemetry Overview Section
try {
    $repoRoot = Split-Path -Parent $PSScriptRoot
    $telemetryModule = Join-Path $repoRoot 'modules' 'Telemetry' 'Telemetry.psd1'
    
    if (Test-Path $telemetryModule) {
        Import-Module $telemetryModule -Force -ErrorAction SilentlyContinue
        $telemetryStats = Get-TelemetryStats -Days 7
        
        if ($telemetryStats.total_events -gt 0) {
            $repoAnalysisCount = if ($telemetryStats.by_event_type.ContainsKey('RepoAnalysis.Completed')) { $telemetryStats.by_event_type['RepoAnalysis.Completed'] } else { 0 }
            $prDashboardViews = if ($telemetryStats.by_event_type.ContainsKey('PRDashboard.View')) { $telemetryStats.by_event_type['PRDashboard.View'] } else { 0 }
            $aiFailures = if ($telemetryStats.by_event_type.ContainsKey('AI.RequestFailed')) { $telemetryStats.by_event_type['AI.RequestFailed'] } else { 0 }
            
            $telemetryHtml = @"
            <div class="section" style="background: #f0f9ff; border-left: 4px solid #3b82f6;">
                <h2>📊 Telemetry Overview (Last 7 Days)</h2>
                <div class="info-grid">
                    <div class="info-item">
                        <div class="info-label">Total Events</div>
                        <div class="info-value">$($telemetryStats.total_events)</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Repository Analyses</div>
                        <div class="info-value">$repoAnalysisCount</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">PR Dashboard Views</div>
                        <div class="info-value">$prDashboardViews</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">
                            <span class="status-icon $(if ($aiFailures -eq 0) { "status-success" } else { "status-warning" })"></span>AI Failures
                        </div>
                        <div class="info-value">$aiFailures</div>
                    </div>
                </div>
                <p style="margin-top: 15px; font-size: 0.9em; color: #6b7280;">
                    📈 View detailed metrics and charts in the <a href="/telemetry" style="color: #3b82f6; text-decoration: none;">Telemetry Dashboard</a>
                </p>
            </div>
"@
            $html += $telemetryHtml
        }
    }
} catch {
    # Silently skip telemetry section if there's an error
    Write-Verbose "Could not load telemetry data: $_"
}

$html += @"
        </div>
        
        <div class="footer">
            <p>Generated by Unified AI Toolbox Repository Analysis</p>
            <p>Analysis Type: $($analysis.metadata.analysis_type) | Timestamp: $($analysis.metadata.timestamp)</p>
        </div>
    </div>
</body>
</html>
"@

# Save HTML report
$html | Out-File $OutputPath -Encoding UTF8

Write-Host "✓ HTML report generated: $OutputPath" -ForegroundColor Green
