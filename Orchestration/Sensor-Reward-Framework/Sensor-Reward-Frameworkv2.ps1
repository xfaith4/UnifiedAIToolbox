<# 
.SYNOPSIS 
Pluggable "sensor → normalize → reward" framework for monitoring system metrics. 

.DESCRIPTION 
- Define sensors as scriptblocks that return raw numbers.
- Normalize to 0..1 (where 1 = good) via helper normalizers.
- Combine with weights to compute a scalar "Reward".
- Swap profiles (weights) to optimize for different goals.

.NOTES 
Tested on PowerShell 7+. Keep thresholds honest; don't sugar-coat.
#>

Set-StrictMode -Version Latest

# --- Logging function ----------------------------------------------------------
function Write-Log {
    param (
        [string]$Message,
        [string]$LogFile = "F:\Logs\Syslog\LogFile.log"  # Change this to your desired log file path
    )
    try {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $logEntry = "$timestamp - $Message"
        Add-Content -Path $LogFile -Value $logEntry
    } catch {
        Write-Warning "Failed to write to log file: $_"
    }
}

# --- Helpers: numeric clamps and normalizers ----------------------------------
function ConvertTo-NormalizedRange {
    <#
    .SYNOPSIS 
    Normalize a value to 0..1 using a linear range.
    
    .PARAMETER Value 
    Raw numeric value.
    
    .PARAMETER Min   
    Lower bound for "bad".
    
    .PARAMETER Max   
    Upper bound for "good".
    
    .PARAMETER Invert 
    If set, flips so "less is better".
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][double]$Value,
        [Parameter(Mandatory)][double]$Min,
        [Parameter(Mandatory)][double]$Max,
        [switch]$Invert
    )
    if ($Min -eq $Max) { return 0.0 } # Avoid divide-by-zero
    $t = [math]::Min(1.0, [math]::Max(0.0, ($Value - $Min) / ($Max - $Min)))
    if ($Invert) { $t = 1.0 - $t }
    return [math]::Round($t, 4)
}

function ConvertTo-NormalizedLessIsBetter {
    <#
    .SYNOPSIS 
    Normalize where smaller values are better.
    
    .DESCRIPTION 
    Returns 1 at/under Target, falls to 0 at/over Worst.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][double]$Value,
        [Parameter(Mandatory)][double]$Target,
        [Parameter(Mandatory)][double]$Worst
    )
    if ($Value -le $Target) { return 1.0 }
    if ($Value -ge $Worst)  { return 0.0 }
    $t = 1.0 - (($Value - $Target) / ($Worst - $Target))
    return [math]::Round($t, 4)
}

# --- Sensor definition & invocation -------------------------------------------
function New-Sensor {
    <#
    .SYNOPSIS 
    Create a sensor definition.
    
    .PARAMETER Name       
    Unique sensor name.
    
    .PARAMETER Getter     
    ScriptBlock returning a raw [double] or [int].
    
    .PARAMETER Normalizer 
    ScriptBlock that accepts (raw) and returns 0..1.
    
    .PARAMETER Weight     
    Relative importance in reward (default 1.0).
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][scriptblock]$Getter,
        [Parameter(Mandatory)][scriptblock]$Normalizer,
        [double]$Weight = 1.0
    )
    # Use PSCustomObject to keep it simple & flexible.
    [pscustomobject]@{
        Name       = $Name
        Getter     = $Getter
        Normalizer = $Normalizer
        Weight     = $Weight
    }
}

function Invoke-Sensor {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory, ValueFromPipeline)][pscustomobject]$Sensor
    )
    process {
        try {
            $raw = & $Sensor.Getter
            # If getter returns $null → treat as "not applicable": zero its weight so it doesn't tank the score
            if ($null -eq $raw) {
                Write-Log "Sensor '$($Sensor.Name)' returned null value, zeroing weight."
                return [pscustomobject]@{
                    Name = $Sensor.Name; Raw = [double]::NaN; Normalized = 0.0; Weight = 0.0;  # << weight zeroed
                }
            }

            # Accept numeric strings by TryParse; otherwise require a ValueType
            if ($raw -isnot [ValueType]) {
                if (-not [double]::TryParse([string]$raw, [ref]([double]$raw))) {
                    throw "Sensor '$($Sensor.Name)' returned non-numeric."
                }
            }

            $norm = & $Sensor.Normalizer ([double]$raw)
            return [pscustomobject]@{
                Name       = $Sensor.Name; 
                Raw        = [double]$raw; 
                Normalized = [double]$norm; 
                Weight     = [double]$Sensor.Weight
            }
        } catch {
            Write-Warning ("Sensor '{0}' failed: {1}" -f $Sensor.Name, $_.Exception.Message)
            Write-Log "Sensor '$($Sensor.Name)' failed: $($_.Exception.Message)"
            return [pscustomobject]@{
                Name = $Sensor.Name; Raw = [double]::NaN; Normalized = 0.0; Weight = [double]$Sensor.Weight
            }
        }
    }
}

# --- Reward computation -------------------------------------------------------
function Measure-Reward {
    <#
    .SYNOPSIS 
    Run sensors, compute weighted reward, and emit a breakdown.
    
    .PARAMETER Sensors 
    Array of sensor definitions.
    
    .PARAMETER VerboseOut 
    Show per-sensor details.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][pscustomobject[]]$Sensors,
        [switch]$VerboseOut
    )
    
    $results = $Sensors | Invoke-Sensor
    $weighted = foreach ($r in $results) {
        [pscustomobject]@{
            Name        = $r.Name
            Raw         = $r.Raw
            Normalized  = $r.Normalized
            Weight      = $r.Weight
            Contribution = [math]::Round(($r.Normalized * $r.Weight), 4)
        }
    }
    
    $reward = ($weighted | Measure-Object -Property Contribution -Sum).Sum
    $weightSum = ($weighted | Measure-Object -Property Weight -Sum).Sum
    $rewardNorm = if ($weightSum -gt 0) { [math]::Round($reward / $weightSum, 4) } else { 0.0 }
    
    if ($VerboseOut) {
        $weighted | Sort-Object Contribution |
        Format-Table Name, Raw, Normalized, Weight, Contribution -AutoSize | Out-Host
    }
    
    return [pscustomobject]@{
        RewardRaw   = [math]::Round($reward, 4)
        Reward0to1  = $rewardNorm
        WeightTotal = [math]::Round($weightSum, 4)
        Details     = $weighted
    }
}

# --- Ready-to-use sensors -----------------------------------------------------
# CPU utilization (%). Lower is generally "better" for headroom.
$SensorCpu = New-Sensor -Name 'CPU_Util' -Getter {
    (Get-Counter '\Processor(_Total)\% Processor Time' -ErrorAction Stop).CounterSamples[0].CookedValue
} -Normalizer {
    param([double]$raw)
    # 40% or lower → perfect (1.0), degrade to 0 by 95%.
    ConvertTo-NormalizedLessIsBetter -Value $raw -Target 40 -Worst 95
} -Weight 1.2

# Memory used (%). Lower is "better" to avoid paging thrash.
$SensorMem = New-Sensor -Name 'Mem_Used' -Getter {
    $os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction Stop
    $total = [double]$os.TotalVisibleMemorySize
    $free  = [double]$os.FreePhysicalMemory
    (1.0 - ($free / $total)) * 100.0
} -Normalizer {
    param([double]$raw)
    ConvertTo-NormalizedLessIsBetter -Value $raw -Target 60 -Worst 95
} -Weight 1.0

# Disk queue length. Lower is better; tweak for your storage.
$SensorDiskQ = New-Sensor -Name 'Disk_Queue' -Getter {
    (Get-Counter '\PhysicalDisk(_Total)\Avg. Disk Queue Length' -ErrorAction Stop).CounterSamples[0].CookedValue
} -Normalizer {
    param([double]$raw)
    ConvertTo-NormalizedLessIsBetter -Value $raw -Target 1.0 -Worst 10.0
} -Weight 0.8

# Ping latency (ms) to a key host (e.g., api.usw2.pure.cloud or your router).
$script:TargetHost = "1.1.1.1" 
$SensorPingAvg = New-Sensor -Name ("Ping_{0}_AvgMs" -f $script:TargetHost) -Getter {
    $p = Test-Connection -TargetName $script:TargetHost -Count 5 -ErrorAction SilentlyContinue
    if (-not $p) { return 9999.0 }  # fail "open" into the normalizer
    [double](($p | Measure-Object -Property Latency -Average).Average)
} -Normalizer {
    param([double]$raw)
    ConvertTo-NormalizedLessIsBetter -Value $raw -Target 15 -Worst 150
} -Weight 1.3

# Ping jitter (ms) — lower is better
$SensorPingJitter = New-Sensor -Name ("Ping_{0}_JitterMs" -f $script:TargetHost) -Getter {
    $p = Test-Connection -TargetName $script:TargetHost -Count 5 -ErrorAction SilentlyContinue
    if (-not $p) { return 9999.0 }
    $samples = $p.Latency | ForEach-Object { [double]$_ }
    $avg = ($samples | Measure-Object -Average).Average
    $variance = ($samples | ForEach-Object { ($_ - $avg) * ($_ - $avg) } | Measure-Object -Sum).Sum / [math]::Max(1, ($samples.Count - 1))
    [math]::Sqrt($variance)
} -Normalizer {
    param([double]$raw)
    ConvertTo-NormalizedLessIsBetter -Value $raw -Target 2 -Worst 25
} -Weight 1.0

# Syslog warn/error rate per minute (last 10 min). If path missing → N/A
$script:SyslogPath = 'F:\Logs\Syslog\*.log'  # adjust to your SolarWinds syslog location
$SensorSyslogWarn = New-Sensor -Name 'Syslog_WarnPerMin' -Getter {
    $files = Get-ChildItem $script:SyslogPath -ErrorAction SilentlyContinue
    if (-not $files) { return $null }  # not applicable on this box
    $since = (Get-Date).AddMinutes(-10)

# Map severity number to name (0..7)
$severityNames = 'Emergency','Alert','Critical','Error','Warning','Notice','Informational','Debug'
}
function ConvertFrom-SyslogLine {
    <#
    .SYNOPSIS  Parse one syslog line (RFC3164 or RFC5424-ish).
    .OUTPUTS   PSCustomObject(Timestamp, SeverityNum, Severity, Host, App, Message)
    .NOTES     Falls back to $null if it can’t parse.
    #>
    param([Parameter(Mandatory)][string]$Line)

    # RFC5424: <PRI>VER ISO8601 host app procid msgid [structured] message
    $m5424 = [regex]::Match($Line, '^\<(?<pri>\d{1,3})\>(?<ver>\d)\s+(?<ts>\S+)\s+(?<host>\S+)\s+(?<app>\S+)\s+(?<proc>\S+)\s+(?<msgid>\S+)\s+(?<structured>\S+)?\s*(?<msg>.*)$')
    if ($m5424.Success) {
        $pri = [int]$m5424.Groups['pri'].Value
        $sev = $pri % 8
        $ts  = $m5424.Groups['ts'].Value
        $dt  = $null
        # RFC5424 timestamps are ISO8601; try direct parse
        [void][datetime]::TryParse($ts, [ref]$dt)
        if (-not $dt) { return $null }
        return [pscustomobject]@{
            Timestamp   = $dt
            SeverityNum = $sev
            Severity    = $severityNames[$sev]
            Host        = $m5424.Groups['host'].Value
            App         = $m5424.Groups['app'].Value
            Message     = $m5424.Groups['msg'].Value
        }
    }

    # RFC3164: <PRI>MMM dd HH:mm:ss host app[pid]: message
    $m3164 = [regex]::Match($Line, '^\<(?<pri>\d{1,3})\>(?<mon>\w{3})\s+(?<day>\d{1,2})\s+(?<time>\d{2}:\d{2}:\d{2})\s+(?<host>\S+)\s+(?<app>[^\s:]+):\s*(?<msg>.*)$')
    if ($m3164.Success) {
        $pri = [int]$m3164.Groups['pri'].Value
        $sev = $pri % 8
        $mon = $m3164.Groups['mon'].Value
        $day = [int]$m3164.Groups['day'].Value
        $tim = $m3164.Groups['time'].Value

        # RFC3164 lacks year; assume current year (good enough for recent windows)
        $year = (Get-Date).Year
        $tsStr = '{0} {1} {2} {3}' -f $mon, $day, $year, $tim
        $dt = $null
        $formats = @('MMM d yyyy HH:mm:ss','MMM dd yyyy HH:mm:ss')
        foreach ($f in $formats) {
            if ([datetime]::TryParseExact($tsStr, $f, [System.Globalization.CultureInfo]::InvariantCulture, [System.Globalization.DateTimeStyles]::AssumeLocal, [ref]$dt)) { break }
        }
        if (-not $dt) { return $null }

        return [pscustomobject]@{
            Timestamp   = $dt
            SeverityNum = $sev
            Severity    = $severityNames[$sev]
            Host        = $m3164.Groups['host'].Value
            App         = $m3164.Groups['app'].Value
            Message     = $m3164.Groups['msg'].Value
        }
    }

    return $null
}

function Get-SyslogWarnRate {
    <#
    .SYNOPSIS  Count Warning-or-worse events per minute over a recent window.
    .PARAMETER Path      e.g., 'F:\Logs\Syslog\*.log'
    .PARAMETER Minutes   Window size (default 10)
    .PARAMETER MinSeverity  One of: Emergency..Debug (default Warning)
    .PARAMETER TailLines Try only last N lines per file for speed (optional)
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Path,
        [int]$Minutes = 10,
        [ValidateSet('Emergency','Alert','Critical','Error','Warning','Notice','Informational','Debug')]
        [string]$MinSeverity = 'Warning',
        [int]$TailLines
    )
    $cutoff = (Get-Date).AddMinutes(-$Minutes)
    $minSevNum = [Array]::IndexOf($severityNames, $MinSeverity) # lower number = more severe

    $count = 0
    foreach ($f in (Get-ChildItem $Path -ErrorAction SilentlyContinue)) {
        $lines = if ($TailLines -gt 0) {
            Get-Content -Path $f.FullName -Tail $TailLines -ErrorAction SilentlyContinue
        } else {
            Get-Content -Path $f.FullName -ReadCount 2000 -ErrorAction SilentlyContinue
        }
        foreach ($line in $lines) {
            $rec = ConvertFrom-SyslogLine $line
            if ($rec -and $rec.Timestamp -ge $cutoff -and $rec.SeverityNum -le $minSevNum) {
                $count++
            }
        }
    }
    if ($Minutes -le 0) { return 0.0 }
    [double]($count / $Minutes)
}

# Drop-in sensor using the proper parser
$SensorSyslogWarn = New-Sensor -Name 'Syslog_WarnPerMin' -Getter {
    $rate = Get-SyslogWarnRate -Path 'F:\Logs\Syslog\*.log' -Minutes 10 -MinSeverity Warning -TailLines 5000
    if ($null -eq $rate) { return $null }
    [double]$rate
} -Normalizer {
    param([double]$raw)
    ConvertTo-NormalizedLessIsBetter -Value $raw -Target 0 -Worst 8
} -Weight 0.8
# Alternative simple sensor counting raw lines with "warn" or "error"
$SensorSyslogWarnSimple = New-Sensor -Name 'Syslog_WarnPerMin_Simple' -Getter {
    $files = Get-ChildItem 'F:\Logs\Syslog\*.log' -ErrorAction SilentlyContinue
    if (-not $files) { return $null }  # not applicable on this box

    [double]($count / 10.0)
} -Normalizer {
    param([double]$raw)
    ConvertTo-NormalizedLessIsBetter -Value $raw -Target 0 -Worst 8
} -Weight 0.8


# --- Profiles: different goals = different weights ----------------------------
$Profiles = @{
    FocusDay = @{
        Sensors = @($SensorCpu, $SensorMem, $SensorDiskQ, $SensorPingAvg)
    }
    VoiceReliability = @{
        Sensors = @($SensorPingAvg, $SensorPingJitter, $SensorSyslogWarn)
    }
}

function Start-MeasureLoop {
    <#
    .SYNOPSIS 
    Run a profile on an interval and print reward.
    
    .PARAMETER ProfileName   
    Key from $Profiles.
    
    .PARAMETER IntervalSec   
    Seconds between runs.
    
    .PARAMETER Iterations    
    How many loops (0 = infinite).
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][ValidateSet('FocusDay', 'VoiceReliability')][string]$ProfileName,
        [int]$IntervalSec = 10,
        [int]$Iterations = 12
    )
    
    $profile = $Profiles[$ProfileName]
    if (-not $profile) { throw "Unknown profile '$ProfileName'." }
    
    $i = 0
    while ($true) {
        $i++
        $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
        Write-Host "[$stamp] Measuring '$ProfileName' ..." -ForegroundColor Cyan
        $res = Measure-Reward -Sensors $profile.Sensors -VerboseOut
        
        $bar = ('#' * [math]::Round($res.Reward0to1 * 20)).PadRight(20, '.')
        Write-Host ("Reward={0:P0} [{1}]  (WeightSum={2})" -f $res.Reward0to1, $bar, $res.WeightTotal) -ForegroundColor Green
        Write-Log ("Profile '{0}' measured: Reward={1:P0}, WeightSum={2}" -f $ProfileName, $res.Reward0to1, $res.WeightTotal)
        
        if ($Iterations -gt 0 -and $i -ge $Iterations) { break }
        Start-Sleep -Seconds $IntervalSec
    }
}

# --- Example usage ------------------------------------------------------------
# Start-MeasureLoop -ProfileName 'FocusDay' -IntervalSec 30 -Iterations 5
# Start-MeasureLoop -ProfileName 'VoiceReliability' -IntervalSec 60 -Iterations 10
# -----------------------------------------------------------------------------