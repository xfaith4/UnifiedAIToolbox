#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Unified AI Toolbox (UTB) - Single CLI entry point for all toolbox commands
.DESCRIPTION
    This script provides a unified command-line interface for the Unified AI Toolbox.
    All major features are accessible through subcommands:
    - telemetry: View and manage telemetry events
    - alerts: Configure and monitor alerts
    - analysis: Run repository analysis
    - ai-insights: Generate AI-powered summaries
    - templates: Manage and version CI/CD templates
.PARAMETER Command
    The subcommand to execute
.PARAMETER SubCommand
    Additional subcommand for nested operations
.PARAMETER ArgumentList
    Arguments to pass to the subcommand
.EXAMPLE
    ./utb.ps1 telemetry stats
    Show telemetry statistics
.EXAMPLE
    ./utb.ps1 alerts setup
    Configure default alert rules
.EXAMPLE
    ./utb.ps1 analysis run
    Run repository analysis
.EXAMPLE
    ./utb.ps1 templates version
    Show template version information
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0, Mandatory = $false)]
    [ValidateSet('telemetry', 'alerts', 'analysis', 'ai-insights', 'templates', 'help', 'version')]
    [string]$Command = 'help',
    
    [Parameter(Position = 1, Mandatory = $false)]
    [string]$SubCommand,
    
    [Parameter(Position = 2, ValueFromRemainingArguments = $true)]
    [string[]]$ArgumentList
)

$ErrorActionPreference = 'Stop'

# Configuration
$Script:ToolVersion = "1.0.0"
$Script:RepoRoot = Split-Path -Parent $PSScriptRoot
$Script:ModulesPath = Join-Path $RepoRoot 'modules'
$Script:ScriptsPath = Join-Path $RepoRoot 'scripts'
$Script:TemplatesPath = Join-Path $RepoRoot 'templates'

# ============================================================================
# Helper Functions
# ============================================================================

function Write-Banner {
    param([string]$Title)
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Cyan
}

function Write-Warning {
    param([string]$Message)
    Write-Host "⚠️  $Message" -ForegroundColor Yellow
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

function Show-Help {
    Write-Banner "Unified AI Toolbox (UTB) v$Script:ToolVersion"
    
    Write-Host "USAGE:" -ForegroundColor Yellow
    Write-Host "  utb.ps1 <command> [subcommand] [options]" -ForegroundColor White
    Write-Host ""
    
    Write-Host "COMMANDS:" -ForegroundColor Yellow
    Write-Host "  telemetry      View and manage telemetry events" -ForegroundColor White
    Write-Host "  alerts         Configure and monitor alerts" -ForegroundColor White
    Write-Host "  analysis       Run repository analysis" -ForegroundColor White
    Write-Host "  ai-insights    Generate AI-powered summaries" -ForegroundColor White
    Write-Host "  templates      Manage and version CI/CD templates" -ForegroundColor White
    Write-Host "  help           Show this help message" -ForegroundColor White
    Write-Host "  version        Show version information" -ForegroundColor White
    Write-Host ""
    
    Write-Host "EXAMPLES:" -ForegroundColor Yellow
    Write-Host "  utb.ps1 telemetry stats              # Show telemetry statistics" -ForegroundColor Gray
    Write-Host "  utb.ps1 telemetry events --last 10   # Show last 10 events" -ForegroundColor Gray
    Write-Host "  utb.ps1 alerts setup                 # Configure default alerts" -ForegroundColor Gray
    Write-Host "  utb.ps1 alerts list                  # List all alert rules" -ForegroundColor Gray
    Write-Host "  utb.ps1 alerts test                  # Test alert rules" -ForegroundColor Gray
    Write-Host "  utb.ps1 analysis run                 # Run repository analysis" -ForegroundColor Gray
    Write-Host "  utb.ps1 ai-insights generate         # Generate AI summary" -ForegroundColor Gray
    Write-Host "  utb.ps1 templates version            # Show template version" -ForegroundColor Gray
    Write-Host "  utb.ps1 templates changelog          # Show template changelog" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "For more information on a specific command, use:" -ForegroundColor Yellow
    Write-Host "  utb.ps1 <command> help" -ForegroundColor White
    Write-Host ""
}

function Show-Version {
    Write-Banner "Unified AI Toolbox"
    Write-Host "  Version: $Script:ToolVersion" -ForegroundColor Cyan
    Write-Host "  Repository: https://github.com/xfaith4/UnifiedAIToolbox" -ForegroundColor Gray
    Write-Host ""
}

# ============================================================================
# Telemetry Commands
# ============================================================================

function Invoke-TelemetryCommand {
    param(
        [string]$SubCommand,
        [string[]]$Args
    )
    
    Write-Banner "Telemetry Management"
    
    # Import telemetry module
    $telemetryModule = Join-Path $Script:ModulesPath 'Telemetry' 'Telemetry.psd1'
    if (-not (Test-Path $telemetryModule)) {
        Write-Error "Telemetry module not found at: $telemetryModule"
        return 1
    }
    Import-Module $telemetryModule -Force
    
    switch ($SubCommand) {
        'stats' {
            Write-Info "Fetching telemetry statistics..."
            $days = 7
            if ($Args -and $Args[0] -eq '--days' -and $Args.Count -gt 1) {
                $days = [int]$Args[1]
            }
            
            $stats = Get-TelemetryStats -Days $days
            Write-Host ""
            Write-Host "📊 Telemetry Statistics (Last $days days)" -ForegroundColor Cyan
            Write-Host "  Total Events: $($stats.total)" -ForegroundColor White
            
            if ($stats.byType.Count -gt 0) {
                Write-Host ""
                Write-Host "  Events by Type:" -ForegroundColor Yellow
                foreach ($type in $stats.byType.GetEnumerator() | Sort-Object Value -Descending) {
                    Write-Host "    $($type.Key): $($type.Value)" -ForegroundColor Gray
                }
            }
            
            if ($stats.lastEvent) {
                Write-Host ""
                Write-Host "  Last Event: $($stats.lastEvent.eventType) at $($stats.lastEvent.timestamp)" -ForegroundColor Gray
            }
        }
        
        'events' {
            Write-Info "Fetching recent telemetry events..."
            $last = 20
            if ($Args -and $Args[0] -eq '--last' -and $Args.Count -gt 1) {
                $last = [int]$Args[1]
            }
            
            $events = Get-TelemetryEvents -Last $last
            Write-Host ""
            Write-Host "📋 Recent Telemetry Events (Last $last)" -ForegroundColor Cyan
            
            foreach ($event in $events) {
                Write-Host ""
                Write-Host "  [$($event.eventType)]" -ForegroundColor Yellow
                Write-Host "    Source: $($event.source)" -ForegroundColor Gray
                Write-Host "    Time: $($event.timestamp)" -ForegroundColor Gray
                if ($event.metadata -and $event.metadata.Count -gt 0) {
                    Write-Host "    Metadata: $($event.metadata | ConvertTo-Json -Compress)" -ForegroundColor DarkGray
                }
            }
        }
        
        'help' {
            Write-Host "TELEMETRY COMMANDS:" -ForegroundColor Yellow
            Write-Host "  stats [--days N]     Show telemetry statistics" -ForegroundColor White
            Write-Host "  events [--last N]    Show recent telemetry events" -ForegroundColor White
            Write-Host "  help                 Show this help message" -ForegroundColor White
        }
        
        default {
            Write-Warning "Unknown telemetry subcommand: $SubCommand"
            Write-Host "Use 'utb.ps1 telemetry help' for available commands"
            return 1
        }
    }
    
    return 0
}

# ============================================================================
# Alerts Commands
# ============================================================================

function Invoke-AlertsCommand {
    param(
        [string]$SubCommand,
        [string[]]$Args
    )
    
    $alertScript = Join-Path $Script:ScriptsPath 'alerting' 'Configure-Alerts.ps1'
    if (-not (Test-Path $alertScript)) {
        Write-Error "Alert configuration script not found at: $alertScript"
        return 1
    }
    
    switch ($SubCommand) {
        'setup' {
            & $alertScript -Action Setup
        }
        
        'list' {
            & $alertScript -Action List
        }
        
        'test' {
            & $alertScript -Action Test
        }
        
        'clear' {
            & $alertScript -Action Clear
        }
        
        'view' {
            Write-Banner "Recent Alerts"
            
            # Import alerting module
            $alertingModule = Join-Path $Script:ModulesPath 'Alerting' 'Alerting.psd1'
            Import-Module $alertingModule -Force
            
            $last = 20
            $severity = $null
            
            # Parse arguments
            for ($i = 0; $i -lt $Args.Count; $i++) {
                if ($Args[$i] -eq '--last' -and ($i + 1) -lt $Args.Count) {
                    $last = [int]$Args[$i + 1]
                    $i++
                }
                elseif ($Args[$i] -eq '--severity' -and ($i + 1) -lt $Args.Count) {
                    $severity = $Args[$i + 1]
                    $i++
                }
            }
            
            Initialize-AlertingSystem
            $alerts = if ($severity) {
                Get-Alerts -Last $last -Severity $severity
            } else {
                Get-Alerts -Last $last
            }
            
            if ($alerts.Count -eq 0) {
                Write-Info "No alerts found"
                return 0
            }
            
            foreach ($alert in $alerts) {
                $color = switch ($alert.severity) {
                    'Critical' { 'Red' }
                    'High' { 'DarkRed' }
                    'Medium' { 'Yellow' }
                    'Low' { 'DarkYellow' }
                    'Info' { 'Cyan' }
                    default { 'White' }
                }
                
                Write-Host ""
                Write-Host "[$($alert.severity)] $($alert.message)" -ForegroundColor $color
                Write-Host "  Rule: $($alert.ruleName)" -ForegroundColor Gray
                Write-Host "  Time: $($alert.timestamp)" -ForegroundColor Gray
                Write-Host "  Event: $($alert.eventType)" -ForegroundColor DarkGray
            }
        }
        
        'help' {
            Write-Banner "Alerts Management"
            Write-Host "ALERTS COMMANDS:" -ForegroundColor Yellow
            Write-Host "  setup                              Configure default alert rules" -ForegroundColor White
            Write-Host "  list                               List all alert rules" -ForegroundColor White
            Write-Host "  test                               Test alert rules with sample events" -ForegroundColor White
            Write-Host "  view [--last N] [--severity LEVEL] View recent alerts" -ForegroundColor White
            Write-Host "  clear                              Clear old alert history" -ForegroundColor White
            Write-Host "  help                               Show this help message" -ForegroundColor White
        }
        
        default {
            Write-Warning "Unknown alerts subcommand: $SubCommand"
            Write-Host "Use 'utb.ps1 alerts help' for available commands"
            return 1
        }
    }
    
    return 0
}

# ============================================================================
# Analysis Commands
# ============================================================================

function Invoke-AnalysisCommand {
    param(
        [string]$SubCommand,
        [string[]]$Args
    )
    
    Write-Banner "Repository Analysis"
    
    $analysisScript = Join-Path $Script:ScriptsPath 'Run-RepoAnalysis.ps1'
    if (-not (Test-Path $analysisScript)) {
        Write-Error "Analysis script not found at: $analysisScript"
        return 1
    }
    
    switch ($SubCommand) {
        'run' {
            Write-Info "Running repository analysis..."
            & $analysisScript @Args
        }
        
        'help' {
            Write-Host "ANALYSIS COMMANDS:" -ForegroundColor Yellow
            Write-Host "  run [options]    Run repository analysis" -ForegroundColor White
            Write-Host "  help             Show this help message" -ForegroundColor White
            Write-Host ""
            Write-Host "For detailed analysis options, use:" -ForegroundColor Gray
            Write-Host "  pwsh $analysisScript -?" -ForegroundColor Gray
        }
        
        default {
            Write-Warning "Unknown analysis subcommand: $SubCommand"
            Write-Host "Use 'utb.ps1 analysis help' for available commands"
            return 1
        }
    }
    
    return 0
}

# ============================================================================
# AI Insights Commands
# ============================================================================

function Invoke-AIInsightsCommand {
    param(
        [string]$SubCommand,
        [string[]]$Args
    )
    
    Write-Banner "AI-Powered Insights"
    
    $aiInsightsScript = Join-Path $Script:ScriptsPath 'ai-insights' 'Generate-RepoAnalysisSummary.ps1'
    if (-not (Test-Path $aiInsightsScript)) {
        Write-Error "AI insights script not found at: $aiInsightsScript"
        return 1
    }
    
    switch ($SubCommand) {
        'generate' {
            Write-Info "Generating AI-powered summary..."
            & $aiInsightsScript @Args
        }
        
        'help' {
            Write-Host "AI INSIGHTS COMMANDS:" -ForegroundColor Yellow
            Write-Host "  generate [options]   Generate AI-powered summary" -ForegroundColor White
            Write-Host "  help                 Show this help message" -ForegroundColor White
            Write-Host ""
            Write-Host "For detailed AI insights options, use:" -ForegroundColor Gray
            Write-Host "  pwsh $aiInsightsScript -?" -ForegroundColor Gray
        }
        
        default {
            Write-Warning "Unknown ai-insights subcommand: $SubCommand"
            Write-Host "Use 'utb.ps1 ai-insights help' for available commands"
            return 1
        }
    }
    
    return 0
}

# ============================================================================
# Templates Commands
# ============================================================================

function Invoke-TemplatesCommand {
    param(
        [string]$SubCommand,
        [string[]]$Args
    )
    
    Write-Banner "CI/CD Templates Management"
    
    $templatePath = Join-Path $Script:TemplatesPath 'ci-cd-blueprint'
    $versionFile = Join-Path $templatePath 'VERSION'
    $changelogFile = Join-Path $templatePath 'CHANGELOG.md'
    
    switch ($SubCommand) {
        'version' {
            if (Test-Path $versionFile) {
                $version = Get-Content $versionFile -Raw
                Write-Success "Template Version: $version"
            } else {
                Write-Warning "No version file found at: $versionFile"
            }
        }
        
        'changelog' {
            if (Test-Path $changelogFile) {
                Write-Info "Displaying changelog..."
                Write-Host ""
                Get-Content $changelogFile | Write-Host
            } else {
                Write-Warning "No changelog file found at: $changelogFile"
            }
        }
        
        'list' {
            Write-Info "Available templates:"
            Write-Host ""
            $templates = Get-ChildItem -Path $Script:TemplatesPath -Directory
            foreach ($template in $templates) {
                Write-Host "  📦 $($template.Name)" -ForegroundColor Cyan
                $readme = Join-Path $template.FullName 'README.md'
                if (Test-Path $readme) {
                    $firstLine = Get-Content $readme -First 3 | Where-Object { $_ -match '^[^#]' } | Select-Object -First 1
                    if ($firstLine) {
                        Write-Host "     $firstLine" -ForegroundColor Gray
                    }
                }
            }
        }
        
        'help' {
            Write-Host "TEMPLATES COMMANDS:" -ForegroundColor Yellow
            Write-Host "  version      Show template version" -ForegroundColor White
            Write-Host "  changelog    Show template changelog" -ForegroundColor White
            Write-Host "  list         List available templates" -ForegroundColor White
            Write-Host "  help         Show this help message" -ForegroundColor White
        }
        
        default {
            Write-Warning "Unknown templates subcommand: $SubCommand"
            Write-Host "Use 'utb.ps1 templates help' for available commands"
            return 1
        }
    }
    
    return 0
}

# ============================================================================
# Main Command Router
# ============================================================================

try {
    $exitCode = 0
    
    switch ($Command) {
        'telemetry' {
            $exitCode = Invoke-TelemetryCommand -SubCommand $SubCommand -Args $ArgumentList
        }
        
        'alerts' {
            $exitCode = Invoke-AlertsCommand -SubCommand $SubCommand -Args $ArgumentList
        }
        
        'analysis' {
            $exitCode = Invoke-AnalysisCommand -SubCommand $SubCommand -Args $ArgumentList
        }
        
        'ai-insights' {
            $exitCode = Invoke-AIInsightsCommand -SubCommand $SubCommand -Args $ArgumentList
        }
        
        'templates' {
            $exitCode = Invoke-TemplatesCommand -SubCommand $SubCommand -Args $ArgumentList
        }
        
        'version' {
            Show-Version
        }
        
        'help' {
            Show-Help
        }
        
        default {
            Show-Help
        }
    }
    
    exit $exitCode
}
catch {
    Write-Error "Error: $_"
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
    exit 1
}
