#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Telemetry module for Unified AI Toolbox
.DESCRIPTION
    Provides pluggable telemetry collection with multiple sink implementations.
    Events are stored in JSONL format by default but can be extended to external services.
#>

$ErrorActionPreference = 'Stop'

# Module-level state
$script:TelemetrySink = $null
$script:TelemetryConfig = @{
    Enabled = $true
    SinkType = 'JSONL'
    OutputPath = "$PSScriptRoot/../../artifacts/telemetry"
    BatchSize = 10
    FlushInterval = 30  # seconds
    MaxFileSize = 10MB
}

# ============================================================================
# Telemetry Event Schema
# ============================================================================

<#
.SYNOPSIS
    Creates a new telemetry event with standard schema
.PARAMETER EventType
    Type of event (e.g., "RepoAnalysis.Run", "Artifact.Download")
.PARAMETER Source
    Source of the event (e.g., "GitHubAction", "DashboardWebApp", "CLI")
.PARAMETER Metadata
    Additional event-specific metadata as a hashtable
#>
function New-TelemetryEvent {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$EventType,
        
        [Parameter(Mandatory = $true)]
        [string]$Source,
        
        [Parameter(Mandatory = $false)]
        [hashtable]$Metadata = @{}
    )
    
    return @{
        timestamp = (Get-Date).ToUniversalTime().ToString("o")
        eventType = $EventType
        source = $Source
        metadata = $Metadata
        schema_version = "1.0"
    }
}

# ============================================================================
# Telemetry Sink Interface
# ============================================================================

<#
.SYNOPSIS
    Base interface for telemetry sinks
#>
class TelemetrySink {
    [void] Write([hashtable]$event) {
        throw "Write method must be implemented by derived class"
    }
    
    [void] Flush() {
        throw "Flush method must be implemented by derived class"
    }
    
    [array] Read([hashtable]$filter) {
        throw "Read method must be implemented by derived class"
    }
}

<#
.SYNOPSIS
    JSONL (JSON Lines) telemetry sink implementation
#>
class JsonlTelemetrySink : TelemetrySink {
    [string]$OutputPath
    [string]$CurrentFile
    [System.Collections.ArrayList]$Buffer
    [int]$BatchSize
    
    JsonlTelemetrySink([string]$outputPath, [int]$batchSize) {
        # Validate path to prevent directory traversal
        # Resolve to absolute path and check if it's within allowed boundaries
        try {
            $resolvedPath = Resolve-Path $outputPath -ErrorAction SilentlyContinue
            if (-not $resolvedPath) {
                # Path doesn't exist yet, try parent directory
                $parentPath = Split-Path $outputPath -Parent
                if ($parentPath) {
                    $resolvedPath = Resolve-Path $parentPath -ErrorAction Stop
                }
            }
            
            # Basic checks for obvious traversal attempts
            if ($outputPath -match '\.\.|~|%2e|%2E') {
                throw "Invalid output path: directory traversal sequences not allowed"
            }
        } catch {
            throw "Invalid output path: $_"
        }
        
        $this.OutputPath = $outputPath
        $this.BatchSize = $batchSize
        $this.Buffer = [System.Collections.ArrayList]::new()
        
        # Ensure output directory exists
        if (-not (Test-Path $this.OutputPath)) {
            New-Item -ItemType Directory -Path $this.OutputPath -Force | Out-Null
        }
        
        # Set current file to today's date
        $dateStr = (Get-Date).ToString("yyyy-MM-dd")
        $this.CurrentFile = Join-Path $this.OutputPath "telemetry_$dateStr.jsonl"
    }
    
    [void] Write([hashtable]$event) {
        # Add to buffer
        [void]$this.Buffer.Add($event)
        
        # Flush if buffer is full
        if ($this.Buffer.Count -ge $this.BatchSize) {
            $this.Flush()
        }
    }
    
    [void] Flush() {
        if ($this.Buffer.Count -eq 0) {
            return
        }
        
        # Rotate file if needed (daily rotation + size limit)
        $dateStr = (Get-Date).ToString("yyyy-MM-dd")
        $expectedFile = Join-Path $this.OutputPath "telemetry_$dateStr.jsonl"
        
        if ($this.CurrentFile -ne $expectedFile) {
            $this.CurrentFile = $expectedFile
        }
        
        # Check file size and rotate if needed
        if ((Test-Path $this.CurrentFile) -and 
            (Get-Item $this.CurrentFile).Length -gt 10MB) {
            $timestamp = (Get-Date).ToString("HHmmss")
            $rotatedFile = $this.CurrentFile -replace '\.jsonl$', "_$timestamp.jsonl"
            Move-Item -Path $this.CurrentFile -Destination $rotatedFile -Force
        }
        
        # Write buffered events
        $jsonLines = $this.Buffer | ForEach-Object {
            $_ | ConvertTo-Json -Compress -Depth 10
        }
        
        Add-Content -Path $this.CurrentFile -Value ($jsonLines -join "`n") -Encoding UTF8
        
        # Clear buffer
        $this.Buffer.Clear()
    }
    
    [array] Read([hashtable]$filter) {
        $events = @()
        
        # Read all JSONL files in the output directory
        $files = Get-ChildItem -Path $this.OutputPath -Filter "telemetry_*.jsonl" |
            Sort-Object LastWriteTime -Descending
        
        foreach ($file in $files) {
            try {
                $lines = Get-Content $file.FullName -Encoding UTF8
                foreach ($line in $lines) {
                    if ($line.Trim()) {
                        $event = $line | ConvertFrom-Json -AsHashtable
                        
                        # Apply filters
                        $matches = $true
                        if ($filter.ContainsKey('eventType') -and $event.eventType -ne $filter.eventType) {
                            $matches = $false
                        }
                        if ($filter.ContainsKey('source') -and $event.source -ne $filter.source) {
                            $matches = $false
                        }
                        if ($filter.ContainsKey('startDate')) {
                            $eventDate = [DateTime]::Parse($event.timestamp)
                            if ($eventDate -lt $filter.startDate) {
                                $matches = $false
                            }
                        }
                        if ($filter.ContainsKey('endDate')) {
                            $eventDate = [DateTime]::Parse($event.timestamp)
                            if ($eventDate -gt $filter.endDate) {
                                $matches = $false
                            }
                        }
                        
                        if ($matches) {
                            $events += $event
                        }
                    }
                }
            } catch {
                Write-Warning "Failed to read telemetry file $($file.Name): $_"
            }
        }
        
        return $events
    }
}

# ============================================================================
# Public Functions
# ============================================================================

<#
.SYNOPSIS
    Initializes the telemetry sink
.PARAMETER SinkType
    Type of sink to use ('JSONL' or custom)
.PARAMETER OutputPath
    Path for telemetry storage
.PARAMETER BatchSize
    Number of events to buffer before flushing
#>
function Initialize-TelemetrySink {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $false)]
        [string]$SinkType = 'JSONL',
        
        [Parameter(Mandatory = $false)]
        [string]$OutputPath = "$PSScriptRoot/../../artifacts/telemetry",
        
        [Parameter(Mandatory = $false)]
        [int]$BatchSize = 10
    )
    
    $script:TelemetryConfig.SinkType = $SinkType
    $script:TelemetryConfig.OutputPath = $OutputPath
    $script:TelemetryConfig.BatchSize = $BatchSize
    
    switch ($SinkType) {
        'JSONL' {
            $script:TelemetrySink = [JsonlTelemetrySink]::new($OutputPath, $BatchSize)
            Write-Verbose "Initialized JSONL telemetry sink at $OutputPath"
        }
        default {
            throw "Unknown sink type: $SinkType"
        }
    }
}

<#
.SYNOPSIS
    Sends a telemetry event
.PARAMETER EventType
    Type of event
.PARAMETER Source
    Source of the event
.PARAMETER Metadata
    Additional metadata
.PARAMETER NoFlush
    Don't flush the buffer after writing
#>
function Send-TelemetryEvent {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$EventType,
        
        [Parameter(Mandatory = $true)]
        [string]$Source,
        
        [Parameter(Mandatory = $false)]
        [hashtable]$Metadata = @{},
        
        [Parameter(Mandatory = $false)]
        [switch]$NoFlush
    )
    
    if (-not $script:TelemetryConfig.Enabled) {
        Write-Verbose "Telemetry is disabled, skipping event"
        return
    }
    
    # Initialize sink if not already done
    if (-not $script:TelemetrySink) {
        Initialize-TelemetrySink
    }
    
    # Create event
    $event = New-TelemetryEvent -EventType $EventType -Source $Source -Metadata $Metadata
    
    # Write to sink
    try {
        $script:TelemetrySink.Write($event)
        
        if (-not $NoFlush) {
            $script:TelemetrySink.Flush()
        }
        
        Write-Verbose "Telemetry event sent: $EventType from $Source"
    } catch {
        Write-Warning "Failed to send telemetry event: $_"
    }
}

<#
.SYNOPSIS
    Retrieves telemetry events
.PARAMETER EventType
    Filter by event type
.PARAMETER Source
    Filter by source
.PARAMETER StartDate
    Filter by start date
.PARAMETER EndDate
    Filter by end date
.PARAMETER Last
    Return only the last N events
#>
function Get-TelemetryEvents {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $false)]
        [string]$EventType,
        
        [Parameter(Mandatory = $false)]
        [string]$Source,
        
        [Parameter(Mandatory = $false)]
        [DateTime]$StartDate,
        
        [Parameter(Mandatory = $false)]
        [DateTime]$EndDate,
        
        [Parameter(Mandatory = $false)]
        [int]$Last
    )
    
    # Initialize sink if not already done
    if (-not $script:TelemetrySink) {
        Initialize-TelemetrySink
    }
    
    # Build filter
    $filter = @{}
    if ($EventType) { $filter.eventType = $EventType }
    if ($Source) { $filter.source = $Source }
    if ($StartDate) { $filter.startDate = $StartDate }
    if ($EndDate) { $filter.endDate = $EndDate }
    
    # Read events
    $events = $script:TelemetrySink.Read($filter)
    
    # Sort by timestamp descending
    $events = $events | Sort-Object { [DateTime]::Parse($_.timestamp) } -Descending
    
    # Limit if requested
    if ($Last -gt 0) {
        $events = $events | Select-Object -First $Last
    }
    
    return $events
}

<#
.SYNOPSIS
    Gets telemetry statistics
.PARAMETER Days
    Number of days to analyze (default: 7)
#>
function Get-TelemetryStats {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $false)]
        [int]$Days = 7
    )
    
    $startDate = (Get-Date).AddDays(-$Days)
    $events = Get-TelemetryEvents -StartDate $startDate
    
    $stats = @{
        total_events = $events.Count
        period_days = $Days
        start_date = $startDate.ToString("o")
        end_date = (Get-Date).ToUniversalTime().ToString("o")
        by_event_type = @{}
        by_source = @{}
        by_day = @{}
    }
    
    # Group by event type
    $byType = $events | Group-Object -Property eventType
    foreach ($group in $byType) {
        $stats.by_event_type[$group.Name] = $group.Count
    }
    
    # Group by source
    $bySource = $events | Group-Object -Property source
    foreach ($group in $bySource) {
        $stats.by_source[$group.Name] = $group.Count
    }
    
    # Group by day
    foreach ($event in $events) {
        $date = ([DateTime]::Parse($event.timestamp)).ToString("yyyy-MM-dd")
        if (-not $stats.by_day.ContainsKey($date)) {
            $stats.by_day[$date] = 0
        }
        $stats.by_day[$date]++
    }
    
    return $stats
}

# ============================================================================
# Module Cleanup
# ============================================================================

$MyInvocation.MyCommand.ScriptBlock.Module.OnRemove = {
    # Flush any remaining events on module unload
    if ($script:TelemetrySink) {
        try {
            $script:TelemetrySink.Flush()
        } catch {
            Write-Warning "Failed to flush telemetry on module unload: $_"
        }
    }
}

# Export module members
Export-ModuleMember -Function @(
    'Initialize-TelemetrySink',
    'Send-TelemetryEvent',
    'Get-TelemetryEvents',
    'Get-TelemetryStats'
)
