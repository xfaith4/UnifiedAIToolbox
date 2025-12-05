#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Alerting module for Unified AI Toolbox
.DESCRIPTION
    Provides alerting capabilities on top of telemetry events.
    Supports threshold-based, pattern-based, and custom alert rules.
    Stores alerts in JSONL format for easy querying and analysis.
#>

$ErrorActionPreference = 'Stop'

# Module-level state
$script:AlertingConfig = @{
    Enabled = $true
    OutputPath = "$PSScriptRoot/../../artifacts/alerts"
    AlertRules = @()
    CheckInterval = 60  # seconds
    MaxFileSize = 10MB
}

# ============================================================================
# Alert Rule Schema
# ============================================================================

<#
.SYNOPSIS
    Creates a new alert rule
.PARAMETER Name
    Unique name for the alert rule
.PARAMETER Description
    Human-readable description of what the alert monitors
.PARAMETER Condition
    Condition type: Threshold, Pattern, Custom
.PARAMETER EventType
    Telemetry event type to monitor (supports wildcards)
.PARAMETER ThresholdProperty
    Property path to evaluate (e.g., "metadata.error_count")
.PARAMETER ThresholdValue
    Threshold value for comparison
.PARAMETER ThresholdOperator
    Comparison operator: GreaterThan, LessThan, Equal, NotEqual
.PARAMETER Pattern
    Regex pattern to match against event data
.PARAMETER ScriptBlock
    Custom PowerShell script block for evaluation
.PARAMETER Severity
    Alert severity: Critical, High, Medium, Low, Info
.PARAMETER Enabled
    Whether the alert rule is active
#>
function New-AlertRule {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        
        [Parameter(Mandatory = $true)]
        [string]$Description,
        
        [Parameter(Mandatory = $true)]
        [ValidateSet('Threshold', 'Pattern', 'Custom')]
        [string]$Condition,
        
        [Parameter(Mandatory = $true)]
        [string]$EventType,
        
        [Parameter(Mandatory = $false)]
        [string]$ThresholdProperty,
        
        [Parameter(Mandatory = $false)]
        [object]$ThresholdValue,
        
        [Parameter(Mandatory = $false)]
        [ValidateSet('GreaterThan', 'LessThan', 'Equal', 'NotEqual', 'GreaterThanOrEqual', 'LessThanOrEqual')]
        [string]$ThresholdOperator = 'GreaterThan',
        
        [Parameter(Mandatory = $false)]
        [string]$Pattern,
        
        [Parameter(Mandatory = $false)]
        [scriptblock]$ScriptBlock,
        
        [Parameter(Mandatory = $false)]
        [ValidateSet('Critical', 'High', 'Medium', 'Low', 'Info')]
        [string]$Severity = 'Medium',
        
        [Parameter(Mandatory = $false)]
        [bool]$Enabled = $true
    )
    
    return @{
        name = $Name
        description = $Description
        condition = $Condition
        eventType = $EventType
        thresholdProperty = $ThresholdProperty
        thresholdValue = $ThresholdValue
        thresholdOperator = $ThresholdOperator
        pattern = $Pattern
        scriptBlock = $ScriptBlock
        severity = $Severity
        enabled = $Enabled
        createdAt = (Get-Date).ToUniversalTime().ToString("o")
    }
}

# ============================================================================
# Alert Schema
# ============================================================================

<#
.SYNOPSIS
    Creates a new alert instance
#>
function New-Alert {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Rule,
        
        [Parameter(Mandatory = $true)]
        [hashtable]$Event,
        
        [Parameter(Mandatory = $false)]
        [string]$Message
    )
    
    return @{
        id = [Guid]::NewGuid().ToString()
        timestamp = (Get-Date).ToUniversalTime().ToString("o")
        ruleName = $Rule.name
        severity = $Rule.severity
        message = $Message
        eventType = $Event.eventType
        eventTimestamp = $Event.timestamp
        eventSource = $Event.source
        eventMetadata = $Event.metadata
        schema_version = "1.0"
    }
}

# ============================================================================
# Alert Storage
# ============================================================================

<#
.SYNOPSIS
    Writes an alert to JSONL storage
#>
function Write-AlertToStorage {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Alert
    )
    
    if (-not $script:AlertingConfig.Enabled) {
        Write-Verbose "Alerting is disabled, skipping alert storage"
        return
    }
    
    # Ensure output directory exists
    $outputPath = $script:AlertingConfig.OutputPath
    if (-not (Test-Path $outputPath)) {
        New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
    }
    
    # Create daily log file
    $date = Get-Date -Format "yyyy-MM-dd"
    $logFile = Join-Path $outputPath "alerts_$date.jsonl"
    
    # Convert to JSON and append
    $jsonLine = ($Alert | ConvertTo-Json -Compress -Depth 10)
    Add-Content -Path $logFile -Value $jsonLine -Encoding UTF8
    
    Write-Verbose "Alert written to: $logFile"
}

<#
.SYNOPSIS
    Reads alerts from JSONL storage
#>
function Read-AlertsFromStorage {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $false)]
        [int]$Last = 0,
        
        [Parameter(Mandatory = $false)]
        [string]$Severity,
        
        [Parameter(Mandatory = $false)]
        [string]$RuleName,
        
        [Parameter(Mandatory = $false)]
        [int]$Days = 7
    )
    
    $outputPath = $script:AlertingConfig.OutputPath
    if (-not (Test-Path $outputPath)) {
        return @()
    }
    
    # Get log files from last N days
    $startDate = (Get-Date).AddDays(-$Days)
    $logFiles = Get-ChildItem -Path $outputPath -Filter "alerts_*.jsonl" |
        Where-Object { $_.LastWriteTime -ge $startDate } |
        Sort-Object LastWriteTime -Descending
    
    $alerts = @()
    foreach ($file in $logFiles) {
        $content = Get-Content -Path $file.FullName -Encoding UTF8
        foreach ($line in $content) {
            if ($line.Trim()) {
                try {
                    $alert = $line | ConvertFrom-Json -AsHashtable
                    
                    # Apply filters
                    if ($Severity -and $alert.severity -ne $Severity) {
                        continue
                    }
                    if ($RuleName -and $alert.ruleName -ne $RuleName) {
                        continue
                    }
                    
                    $alerts += $alert
                }
                catch {
                    Write-Warning "Failed to parse alert line: $_"
                }
            }
        }
    }
    
    # Sort by timestamp descending
    $alerts = $alerts | Sort-Object { [DateTime]$_.timestamp } -Descending
    
    # Apply Last filter if specified
    if ($Last -gt 0 -and $alerts.Count -gt $Last) {
        $alerts = $alerts[0..($Last - 1)]
    }
    
    return $alerts
}

# ============================================================================
# Alert Evaluation
# ============================================================================

<#
.SYNOPSIS
    Evaluates a threshold condition
#>
function Test-ThresholdCondition {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Rule,
        
        [Parameter(Mandatory = $true)]
        [hashtable]$Event
    )
    
    # Extract property value using dot notation
    $propertyPath = $Rule.thresholdProperty -split '\.'
    $value = $Event
    
    foreach ($prop in $propertyPath) {
        if ($value -is [hashtable] -and $value.ContainsKey($prop)) {
            $value = $value[$prop]
        }
        else {
            Write-Verbose "Property path not found: $($Rule.thresholdProperty)"
            return $false
        }
    }
    
    # Compare based on operator
    $thresholdValue = $Rule.thresholdValue
    switch ($Rule.thresholdOperator) {
        'GreaterThan' { return $value -gt $thresholdValue }
        'LessThan' { return $value -lt $thresholdValue }
        'Equal' { return $value -eq $thresholdValue }
        'NotEqual' { return $value -ne $thresholdValue }
        'GreaterThanOrEqual' { return $value -ge $thresholdValue }
        'LessThanOrEqual' { return $value -le $thresholdValue }
        default { return $false }
    }
}

<#
.SYNOPSIS
    Evaluates a pattern condition
#>
function Test-PatternCondition {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Rule,
        
        [Parameter(Mandatory = $true)]
        [hashtable]$Event
    )
    
    # Convert event to JSON for pattern matching
    $eventJson = $Event | ConvertTo-Json -Compress
    
    # Test regex pattern
    return $eventJson -match $Rule.pattern
}

<#
.SYNOPSIS
    Evaluates a custom script block condition
#>
function Test-CustomCondition {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Rule,
        
        [Parameter(Mandatory = $true)]
        [hashtable]$Event
    )
    
    if (-not $Rule.scriptBlock) {
        Write-Warning "Custom condition requires a script block"
        return $false
    }
    
    try {
        # Execute script block with event as parameter
        $result = & $Rule.scriptBlock $Event
        return [bool]$result
    }
    catch {
        Write-Warning "Error evaluating custom condition: $_"
        return $false
    }
}

# ============================================================================
# Public Functions
# ============================================================================

<#
.SYNOPSIS
    Initializes the alerting system
.PARAMETER OutputPath
    Path where alerts will be stored (default: artifacts/alerts)
.PARAMETER CheckInterval
    Interval in seconds for checking alert rules (default: 60)
#>
function Initialize-AlertingSystem {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $false)]
        [string]$OutputPath,
        
        [Parameter(Mandatory = $false)]
        [int]$CheckInterval = 60
    )
    
    if ($OutputPath) {
        $script:AlertingConfig.OutputPath = $OutputPath
    }
    
    $script:AlertingConfig.CheckInterval = $CheckInterval
    
    # Ensure output directory exists
    $outputPath = $script:AlertingConfig.OutputPath
    if (-not (Test-Path $outputPath)) {
        New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
    }
    
    Write-Verbose "Alerting system initialized: $outputPath"
}

<#
.SYNOPSIS
    Adds an alert rule to the system
#>
function Add-AlertRule {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Rule
    )
    
    # Check if rule with same name exists
    $existing = $script:AlertingConfig.AlertRules | Where-Object { $_.name -eq $Rule.name }
    if ($existing) {
        Write-Warning "Alert rule with name '$($Rule.name)' already exists. Updating."
        Remove-AlertRule -Name $Rule.name
    }
    
    $script:AlertingConfig.AlertRules += $Rule
    Write-Verbose "Added alert rule: $($Rule.name)"
}

<#
.SYNOPSIS
    Removes an alert rule from the system
#>
function Remove-AlertRule {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )
    
    $script:AlertingConfig.AlertRules = $script:AlertingConfig.AlertRules | 
        Where-Object { $_.name -ne $Name }
    
    Write-Verbose "Removed alert rule: $Name"
}

<#
.SYNOPSIS
    Gets all alert rules or a specific rule by name
#>
function Get-AlertRules {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $false)]
        [string]$Name
    )
    
    if ($Name) {
        return $script:AlertingConfig.AlertRules | Where-Object { $_.name -eq $Name }
    }
    
    return $script:AlertingConfig.AlertRules
}

<#
.SYNOPSIS
    Tests if an event matches an alert condition
#>
function Test-AlertCondition {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Rule,
        
        [Parameter(Mandatory = $true)]
        [hashtable]$Event
    )
    
    # Check if rule is enabled
    if (-not $Rule.enabled) {
        return $false
    }
    
    # Check event type match (supports wildcards)
    $eventTypePattern = $Rule.eventType -replace '\*', '.*'
    if ($Event.eventType -notmatch "^$eventTypePattern$") {
        return $false
    }
    
    # Evaluate based on condition type
    switch ($Rule.condition) {
        'Threshold' {
            return Test-ThresholdCondition -Rule $Rule -Event $Event
        }
        'Pattern' {
            return Test-PatternCondition -Rule $Rule -Event $Event
        }
        'Custom' {
            return Test-CustomCondition -Rule $Rule -Event $Event
        }
        default {
            Write-Warning "Unknown condition type: $($Rule.condition)"
            return $false
        }
    }
}

<#
.SYNOPSIS
    Sends an alert based on a rule and event
#>
function Send-Alert {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Rule,
        
        [Parameter(Mandatory = $true)]
        [hashtable]$Event,
        
        [Parameter(Mandatory = $false)]
        [string]$Message
    )
    
    # Generate default message if not provided
    if (-not $Message) {
        $Message = "Alert triggered: $($Rule.name) - $($Rule.description)"
    }
    
    # Create alert
    $alert = New-Alert -Rule $Rule -Event $Event -Message $Message
    
    # Write to storage
    Write-AlertToStorage -Alert $alert
    
    # Log to console based on severity
    $color = switch ($Rule.severity) {
        'Critical' { 'Red' }
        'High' { 'DarkRed' }
        'Medium' { 'Yellow' }
        'Low' { 'DarkYellow' }
        'Info' { 'Cyan' }
        default { 'White' }
    }
    
    Write-Host "[$($Rule.severity)] $Message" -ForegroundColor $color
    
    return $alert
}

<#
.SYNOPSIS
    Gets alerts from storage with optional filtering
#>
function Get-Alerts {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $false)]
        [int]$Last = 0,
        
        [Parameter(Mandatory = $false)]
        [ValidateSet('Critical', 'High', 'Medium', 'Low', 'Info')]
        [string]$Severity,
        
        [Parameter(Mandatory = $false)]
        [string]$RuleName,
        
        [Parameter(Mandatory = $false)]
        [int]$Days = 7
    )
    
    return Read-AlertsFromStorage -Last $Last -Severity $Severity -RuleName $RuleName -Days $Days
}

<#
.SYNOPSIS
    Gets statistics about alerts
#>
function Get-AlertStats {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $false)]
        [int]$Days = 7
    )
    
    $alerts = Get-Alerts -Days $Days
    
    $stats = @{
        total = $alerts.Count
        bySeverity = @{}
        byRule = @{}
        lastAlert = $null
        oldestAlert = $null
    }
    
    if ($alerts.Count -gt 0) {
        # Group by severity
        $alerts | Group-Object severity | ForEach-Object {
            $stats.bySeverity[$_.Name] = $_.Count
        }
        
        # Group by rule name
        $alerts | Group-Object ruleName | ForEach-Object {
            $stats.byRule[$_.Name] = $_.Count
        }
        
        # Get first and last alert
        $stats.lastAlert = $alerts[0]
        $stats.oldestAlert = $alerts[-1]
    }
    
    return $stats
}

<#
.SYNOPSIS
    Clears alert history
#>
function Clear-Alerts {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param(
        [Parameter(Mandatory = $false)]
        [int]$OlderThanDays = 30
    )
    
    $outputPath = $script:AlertingConfig.OutputPath
    if (-not (Test-Path $outputPath)) {
        Write-Verbose "No alerts directory found"
        return
    }
    
    $cutoffDate = (Get-Date).AddDays(-$OlderThanDays)
    $logFiles = Get-ChildItem -Path $outputPath -Filter "alerts_*.jsonl" |
        Where-Object { $_.LastWriteTime -lt $cutoffDate }
    
    if ($logFiles.Count -eq 0) {
        Write-Verbose "No alert files older than $OlderThanDays days"
        return
    }
    
    if ($PSCmdlet.ShouldProcess("$($logFiles.Count) alert files", "Delete")) {
        foreach ($file in $logFiles) {
            Remove-Item -Path $file.FullName -Force
            Write-Verbose "Deleted: $($file.Name)"
        }
        Write-Host "Deleted $($logFiles.Count) alert files older than $OlderThanDays days" -ForegroundColor Green
    }
}

# Export module members
Export-ModuleMember -Function @(
    'Initialize-AlertingSystem',
    'New-AlertRule',
    'New-Alert',
    'Add-AlertRule',
    'Remove-AlertRule',
    'Get-AlertRules',
    'Test-AlertCondition',
    'Send-Alert',
    'Get-Alerts',
    'Get-AlertStats',
    'Clear-Alerts'
)
