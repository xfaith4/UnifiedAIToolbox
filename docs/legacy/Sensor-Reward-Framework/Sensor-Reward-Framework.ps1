<#
.SYNOPSIS
    Pluggable "sensor → normalize → reward" framework.
.DESCRIPTION
    - Define sensors as scriptblocks that return raw numbers.
    - Normalize to 0..1 (where 1 = good) via helper normalizers.
    - Combine with weights to compute a scalar "Reward".
    - Swap profiles (weights) to optimize for different goals.
.NOTES
    Tested on PowerShell 7+. Keep thresholds honest; don't sugar-coat.
#>

Set-StrictMode -Version Latest

# --- Helpers: numeric clamps and normalizers ----------------------------------

function ConvertTo-NormalizedRange {
    <#
    .SYNOPSIS  Normalize a value to 0..1 using a linear range.
    .PARAMETER Value Raw numeric value.
    .PARAMETER Min   Lower bound for "bad".
    .PARAMETER Max   Upper bound for "good".
    .PARAMETER Invert If set, flips so "less is better".
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][double]$Value,
        [Parameter(Mandatory)][double]$Min,
        [Parameter(Mandatory)][double]$Max,
        [switch]$Invert
    )
    if ($Min -eq $Max) { return 0.0 } # avoid divide-by-zero
    $t = [math]::Min(1.0, [math]::Max(0.0, ($Value - $Min) / ($Max - $Min)))
    if ($Invert) { $t = 1.0 - $t }
    return [math]::Round($t, 4)
}

function ConvertTo-NormalizedLessIsBetter {
    <#
    .SYNOPSIS  Normalize where smaller values are better.
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
    .SYNOPSIS  Create a sensor definition.
    .PARAMETER Name       Unique sensor name.
    .PARAMETER Getter     ScriptBlock returning a raw [double] or [int].
    .PARAMETER Normalizer ScriptBlock that accepts (raw) and returns 0..1.
    .PARAMETER Weight     Relative importance in reward (default 1.0).
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
    param([Parameter(Mandatory, ValueFromPipeline)][pscustomobject]$Sensor)
    process {
        try {
            $raw = & $Sensor.Getter

            # If getter returns $null → treat as "not applicable": zero its weight so it doesn't tank the score
            if ($null -eq $raw) {
                return [pscustomobject]@{
                    Name=$Sensor.Name; Raw=[double]::NaN; Normalized=0.0; Weight=0.0;  # << weight zeroed
                }
            }

            # Accept numeric strings by TryParse; otherwise require a ValueType
            if ($raw -isnot [ValueType]) {
                if (-not [double]::TryParse([string]$raw, [ref]([double]$raw))) {
                    throw "Sensor '$($Sensor.Name)' returned non-numeric."
                }
            }

            $norm = & $Sensor.Normalizer ([double]$raw)
            [pscustomobject]@{
                Name=$Sensor.Name; Raw=[double]$raw; Normalized=[double]$norm; Weight=[double]$Sensor.Weight
            }
        } catch {
            Write-Warning ("Sensor '{0}' failed: {1}" -f $Sensor.Name, $_.Exception.Message)
            [pscustomobject]@{
                Name=$Sensor.Name; Raw=[double]::NaN; Normalized=0.0; Weight=[double]$Sensor.Weight
            }
        }
    }
}
# --- Reward computation -------------------------------------------------------

function Measure-Reward {
    <#
    .SYNOPSIS  Run sensors, compute weighted reward, and emit a breakdown.
    .PARAMETER Sensors    Array of sensor definitions.
    .PARAMETER VerboseOut Show per-sensor details.
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
            Contribution= [math]::Round(($r.Normalized * $r.Weight), 4)
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
    # Single-sample quick read; adjust if you want multi-sample smoothing.
    (Get-Counter '\Processor(_Total)\% Processor Time' -ErrorAction Stop
    ).CounterSamples[0].CookedValue
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
    $usedPct = (1.0 - ($free / $total)) * 100.0
    $usedPct
} -Normalizer {
    param([double]$raw)
    ConvertTo-NormalizedLessIsBetter -Value $raw -Target 60 -Worst 95
} -Weight 1.0

# Disk queue length. Lower is better; tweak for your storage.
$SensorDiskQ = New-Sensor -Name 'Disk_Queue' -Getter {
    (Get-Counter '\PhysicalDisk(_Total)\Avg. Disk Queue Length' -ErrorAction Stop
    ).CounterSamples[0].CookedValue
} -Normalizer {
    param([double]$raw)
    ConvertTo-NormalizedLessIsBetter -Value $raw -Target 1.0 -Worst 10.0
} -Weight 0.8

# Ping latency (ms) to a key host (e.g., api.usw2.pure.cloud or your router).
$SensorPingAvg = New-Sensor -Name ("Ping_{0}_AvgMs" -f $script:TargetHost) -Getter {
    # Collect a few samples; if ping fails, return a big number (bad) not NaN
    $p = Test-Connection -TargetName $script:TargetHost -Count 5 -ErrorAction SilentlyContinue
    if (-not $p) { return 9999.0 }  # fail "open" into the normalizer
    # Cast to double to satisfy strict mode
    [double](($p | Measure-Object -Property Latency -Average).Average)
} -Normalizer {
    param([double]$raw)
    # 15ms is great, 150ms is bad; tune for your WAN reality
    ConvertTo-NormalizedLessIsBetter -Value $raw -Target 15 -Worst 150
} -Weight 1.3

$SensorPingJitter = New-Sensor -Name ("Ping_{0}_JitterMs" -f $script:TargetHost) -Getter {
    $p = Test-Connection -TargetName $script:TargetHost -Count 5 -ErrorAction SilentlyContinue
    if (-not $p) { return 9999.0 }
    $samples = $p.Latency | ForEach-Object { [double]$_ }
    $avg = ($samples | Measure-Object -Average).Average
    # Population stddev (close enough for 5 samples)
    $variance = ($samples | ForEach-Object { ($_ - $avg) * ($_ - $avg) } | Measure-Object -Sum).Sum / [math]::Max(1, ($samples.Count - 1))
    [double][math]::Sqrt($variance)
} -Normalizer {
    param([double]$raw)
    ConvertTo-NormalizedLessIsBetter -Value $raw -Target 2 -Worst 25
} -Weight 1.0

# Windows Event error rate (System log) in last 5 minutes. Lower is better.
$SensorSysErr = New-Sensor -Name 'System_ErrorsPerMin' -Getter {
    $start = (Get-Date).AddMinutes(-5)
    $count = (Get-WinEvent -FilterHashtable @{LogName='System'; Level=2; StartTime=$start} -ErrorAction SilentlyContinue | Measure-Object).Count
    # errors per minute
    [double]($count / 5.0)
} -Normalizer {
    param([double]$raw)
    ConvertTo-NormalizedLessIsBetter -Value $raw -Target 0 -Worst 4
} -Weight 0.9

# Wi-Fi RSSI via netsh (percent). Higher is better.
$SensorWifiSignal = New-Sensor -Name 'WiFi_SignalPct' -Getter {
    $out = netsh wlan show interfaces 2>$null
    # If there is no WLAN interface or not connected, return $null so we can zero the weight dynamically
    if (-not $out -or -not ($out -match '^\s*State\s*:\s*connected' -im)) { return $null }

    $m = ($out | Select-String -Pattern '^\s*Signal\s*:\s*(\d+)%' -AllMatches).Matches
    if ($m.Count -eq 0) { return $null }
    [double]$m[0].Groups[1].Value
} -Normalizer {
    param([double]$raw)
    ConvertTo-NormalizedRange -Value $raw -Min 40 -Max 100
} -Weight 0.6


# Example: Merlin/syslog warn rate from file(s) in last 10 minutes (tune path).
$SensorSyslogWarn = New-Sensor -Name 'Syslog_WarnPerMin' -Getter {
    $path = 'F:\Logs\Syslog\*.log' # adjust to your SolarWinds syslog path
    $since = (Get-Date).AddMinutes(-10)
    $count = Get-ChildItem $path -ErrorAction SilentlyContinue |
        Get-Content -ErrorAction SilentlyContinue |
        Where-Object {
            # naive scan: timestamps + 'warn'/'err' tokens; replace with your format
            ($_ -match 'warn|error|crit') -and ($_ -match '\d{4}-\d{2}-\d{2}') 
        } | Measure-Object | Select-Object -ExpandProperty Count
    [double]($count / 10.0)
} -Normalizer {
    param([double]$raw)
    ConvertTo-NormalizedLessIsBetter -Value $raw -Target 0 -Worst 8
} -Weight 0.8

# Placeholder: Genesys MOS≤3.5 rate per 100 calls (swap in your API/Elastic query).
$SensorMosDegrade = New-Sensor -Name 'Genesys_MOSBadPer100' -Getter {
    # EXAMPLE: read a cached metric your report generator exported to JSON.
    $cache = 'G:\Storage\BenStuff\Development\Reports\mos_metrics.json'
    if (Test-Path $cache) {
        $obj = Get-Content $cache | ConvertFrom-Json -ErrorAction Stop
        return [double]$obj.BadPer100
    } else {
        return 5.0  # neutral-ish fallback
    }
} -Normalizer {
    param([double]$raw)
    # 0–2 per 100 is great; 15 per 100 is bad.
    ConvertTo-NormalizedLessIsBetter -Value $raw -Target 2 -Worst 15
} -Weight 1.4

# --- Profiles: different goals = different weights ----------------------------

$Profiles = @{
    # Keep the workstation and WAN snappy for dev & meetings.
    FocusDay = @{
        Sensors = @($SensorCpu, $SensorMem, $SensorDiskQ, $SensorPingAvg, $SensorPingJitter, $SensorSysErr, $SensorWifiSignal)
    }
    # SRE-ish: bias toward network stability + Genesys voice quality + syslog calm.
    VoiceReliability = @{
        Sensors = @($SensorPingAvg, $SensorPingJitter, $SensorSyslogWarn, $SensorSysErr, $SensorMosDegrade)
    }
}

function Start-MeasureLoop {
    <#
    .SYNOPSIS  Run a profile on an interval and print reward.
    .PARAMETER ProfileName   Key from $Profiles.
    .PARAMETER IntervalSec   Seconds between runs.
    .PARAMETER Iterations    How many loops (0 = infinite).
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][ValidateSet('FocusDay','VoiceReliability')][string]$ProfileName,
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

        if ($Iterations -gt 0 -and $i -ge $Iterations) { break }
        Start-Sleep -Seconds $IntervalSec
    }
}
# --- Example usage ------------------------------------------------------------
# Start-MeasureLoop -ProfileName 'FocusDay' -IntervalSec 30 -Iterations 5
# Start-MeasureLoop -ProfileName 'VoiceReliability' -IntervalSec 60 -Iterations 10
# ------------------------------------------------------------------------------


# =========================
#  Asuswrt-Merlin Add-on
# =========================
# Requirements:
# - Uses built-in Windows/OpenSSH `ssh.exe` with key auth by default.
# - If you want password auth instead, install Posh-SSH and extend Invoke-MerlinSshRaw accordingly.
# - Assumes BusyBox/ash on router. Commands chosen for broad Merlin compatibility.

# --- Config & cache -----------------------------------------------------------

$script:MerlinConfig = [pscustomobject]@{
    Host              = '192.168.50.1'  # your router IP or hostname
    User              = 'xfaith'          # your admin username
    Port              = 1099                # your common custom port
    SshKeyPath        = 'G:\Storage\BenStuff\Development\keys\public'
    TimeoutSec        = 5
    AcceptNewHostKey  = $true               # first-run convenience; set $false once known hosts is populated
    CacheTtlSec       = 5
}
$script:MerlinCache = [pscustomobject]@{
    Stamp = Get-Date '1970-01-01'
    Data  = $null
}

function Set-MerlinConnection {
    <#
    .SYNOPSIS  Configure SSH connection settings for your Merlin router.
    .EXAMPLE  Set-MerlinConnection -Host 192.168.50.1 -User admin -SshKeyPath "$env:USERPROFILE\.ssh\id_ed25519"
    #>
    [CmdletBinding()]
    param(
        [string]$Router = '192.168.50.1',
        [string]$User ='xfaith',
        [int]$Port = 1099,
        [string]$SshKeyPath = 'G:\Storage\BenStuff\Development\keys\public',
        [int]$TimeoutSec = 5,
        [int]$CacheTtlSec = 5,
        [switch]$AcceptNewHostKey
    )
    $script:MerlinConfig.Host = $Router
    $script:MerlinConfig.User = $User
    $script:MerlinConfig.Port = $Port
    $script:MerlinConfig.SshKeyPath = $SshKeyPath
    $script:MerlinConfig.TimeoutSec = $TimeoutSec
    $script:MerlinConfig.CacheTtlSec = $CacheTtlSec
    if ($PSBoundParameters.ContainsKey('AcceptNewHostKey')) {
        $script:MerlinConfig.AcceptNewHostKey = [bool]$AcceptNewHostKey
    }
}

# --- Low-level SSH runner (key-based via ssh.exe) -----------------------------

function Invoke-MerlinSshRaw {
    <#
    .SYNOPSIS  Run a command on the router and return stdout as a single string.
    .NOTES     Uses ssh.exe; for passwords, prefer key auth or add a Posh-SSH branch.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Command
    )

    if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
        throw "ssh.exe not found. Enable Windows OpenSSH Client (Optional Features) or install Git for Windows (includes ssh)."
    }
    if (-not $script:MerlinConfig.Host -or -not $script:MerlinConfig.User) {
        throw "Merlin connection not configured. Call Set-MerlinConnection first."
    }

    $args = @(
        '-o', 'BatchMode=yes'
    )
    $args += @('-o', "ConnectTimeout=$($script:MerlinConfig.TimeoutSec)")
    $args += if ($script:MerlinConfig.AcceptNewHostKey) { @('-o','StrictHostKeyChecking=accept-new') } else { @('-o','StrictHostKeyChecking=yes') }
    $args += @('-p', "$($script:MerlinConfig.Port)")
    if ($script:MerlinConfig.SshKeyPath) {
        $args += @('-i', $script:MerlinConfig.SshKeyPath)
    }
    $args += @("$($script:MerlinConfig.User)@$($script:MerlinConfig.Host)", $Command)

    # Use ProcessStartInfo to capture stdout/stderr reliably
    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = 'ssh'
    foreach ($a in $args) { $null = $psi.ArgumentList.Add($a) }
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError  = $true
    $psi.UseShellExecute        = $false
    $proc = [System.Diagnostics.Process]::Start($psi)
    try {
        $stdout = $proc.StandardOutput.ReadToEnd()
        $stderr = $proc.StandardError.ReadToEnd()
        $ok = $proc.WaitForExit(($script:MerlinConfig.TimeoutSec + 5) * 1000)
        if (-not $ok) { try { $proc.Kill() } catch {} ; throw "ssh timed out." }
        if ($proc.ExitCode -ne 0) { throw "ssh exit $($proc.ExitCode): $stderr" }
        return $stdout
    } finally {
        $proc.Dispose()
    }
}

# --- Snapshot collector (one SSH hit, many metrics) --------------------------

function Resolve-AsuswrtMerlin {
    <#
    .SYNOPSIS  Collect a health snapshot from Asuswrt-Merlin in one round-trip.
    .OUTPUTS   PSCustomObject with numeric fields suitable for sensors.
    .NOTES     Returns defaults on missing fields to fail closed conservatively.
    #>
    [CmdletBinding()]
    param()

    # One-liner on the router: emit KEY=VALUE lines we can parse cleanly.
    $remote = @'
WAN_STATE=$(nvram get wan0_state_t 2>/dev/null); 
WAN_IF=$(nvram get wan0_ifname 2>/dev/null);
LOAD1=$(cut -d" " -f1 /proc/loadavg);
MEMUSED=$(awk "/MemTotal/ {t=\$2} /MemAvailable/ {a=\$2} END {printf \"%.2f\", (t-a)/t*100}" /proc/meminfo);
UPTIME=$(cut -d" " -f1 /proc/uptime);
if [ -n "$WAN_IF" ]; then 
  IFCONF=$(ifconfig $WAN_IF 2>/dev/null);
  RX=$(echo "$IFCONF" | awk "/RX packets/ {print \$2}"); RX=${RX#packets:};
  RXE=$(echo "$IFCONF" | awk "/RX packets/ {print \$3}"); RXE=${RXE#errors:};
  TX=$(echo "$IFCONF" | awk "/TX packets/ {print \$2}"); TX=${TX#packets:};
  TXE=$(echo "$IFCONF" | awk "/TX packets/ {print \$3}"); TXE=${TXE#errors:};
fi;
LOSS=$(ping -c 5 -w 5 1.1.1.1 2>/dev/null | awk -F"," "/packet loss/ {gsub(/%/,\"\",\$3); gsub(/ /,\"\",\$3); print \$3}");
echo "WAN_STATE=$WAN_STATE";
echo "WAN_IF=$WAN_IF";
echo "LOAD1=$LOAD1";
echo "MEMUSED=$MEMUSED";
echo "UPTIME=$UPTIME";
echo "RX_PACKETS=${RX:-}";
echo "RX_ERRORS=${RXE:-}";
echo "TX_PACKETS=${TX:-}";
echo "TX_ERRORS=${TXE:-}";
echo "PING_LOSS=${LOSS:-100}";
'@

    $raw = Invoke-MerlinSshRaw -Command $remote

    # Parse KEY=VALUE lines into a dictionary
    $kv = @{}
    foreach ($line in ($raw -split "`n")) {
        $line = $line.Trim()
        if (-not $line -or -not ($line -match '=')) { continue }
        $k, $v = $line.Split('=',2)
        $kv[$k] = $v
    }

    # Convert & guard
    $wanConnected = if ($kv['WAN_STATE'] -eq 'connected') { 1.0 } else { 0.0 }
    $load1        = [double]::TryParse($kv['LOAD1'], [ref]([double]$null)) ? [double]$kv['LOAD1'] : [double]::NaN
    $memUsedPct   = [double]::TryParse($kv['MEMUSED'], [ref]([double]$null)) ? [double]$kv['MEMUSED'] : [double]::NaN
    $uptimeSec    = [double]::TryParse($kv['UPTIME'], [ref]([double]$null)) ? [double]$kv['UPTIME'] : [double]::NaN
    $rxPackets    = [double]::TryParse($kv['RX_PACKETS'], [ref]([double]$null)) ? [double]$kv['RX_PACKETS'] : 0.0
    $txPackets    = [double]::TryParse($kv['TX_PACKETS'], [ref]([double]$null)) ? [double]$kv['TX_PACKETS'] : 0.0
    $rxErrors     = [double]::TryParse($kv['RX_ERRORS'], [ref]([double]$null)) ? [double]$kv['RX_ERRORS'] : 0.0
    $txErrors     = [double]::TryParse($kv['TX_ERRORS'], [ref]([double]$null)) ? [double]$kv['TX_ERRORS'] : 0.0
    $lossPct      = [double]::TryParse($kv['PING_LOSS'], [ref]([double]$null)) ? [double]$kv['PING_LOSS'] : 100.0

    # Derived metric: errors per 1000 packets across RX+TX
    $totalPkts    = [math]::Max(1.0, $rxPackets + $txPackets)
    $errPerK      = 1000.0 * (($rxErrors + $txErrors) / $totalPkts)

    [pscustomobject]@{
        WanConnected = $wanConnected      # 1.0 connected, 0.0 disconnected
        Load1        = $load1             # 1-min loadavg
        MemUsedPct   = $memUsedPct        # %
        UptimeSec    = $uptimeSec         # seconds
        RxPackets    = $rxPackets
        TxPackets    = $txPackets
        RxErrors     = $rxErrors
        TxErrors     = $txErrors
        ErrPerK      = $errPerK           # errors per 1k packets
        PingLossPct  = $lossPct           # % packet loss from router to 1.1.1.1
        WanIf        = $kv['WAN_IF']
        WanStateRaw  = $kv['WAN_STATE']
    }
}

function Get-MerlinSnapshot {
    <#
    .SYNOPSIS  Cached access to router snapshot to avoid multiple SSH hits per loop.
    #>
    [CmdletBinding()]
    param()
    $age = (Get-Date) - $script:MerlinCache.Stamp
    if ($null -eq $script:MerlinCache.Data -or $age.TotalSeconds -ge $script:MerlinConfig.CacheTtlSec) {
        $script:MerlinCache.Data  = Resolve-AsuswrtMerlin
        $script:MerlinCache.Stamp = Get-Date
    }
    return $script:MerlinCache.Data
}

# --- Sensors backed by the snapshot ------------------------------------------

$SensorMerlinWan = New-Sensor -Name 'Merlin_WAN_Connected' -Getter {
    # 1 if connected, 0 if not. Directly maps to normalized value.
    (Get-MerlinSnapshot).WanConnected
} -Normalizer {
    param([double]$raw)
    # Clamp just in case.
    [math]::Min(1.0, [math]::Max(0.0, $raw))
} -Weight 1.6

$SensorMerlinPingLoss = New-Sensor -Name 'Merlin_PingLossPct' -Getter {
    (Get-MerlinSnapshot).PingLossPct
} -Normalizer {
    param([double]$raw)
    # 0% ideal; 40%+ is effectively broken.
    ConvertTo-NormalizedLessIsBetter -Value $raw -Target 0 -Worst 40
} -Weight 1.3

$SensorMerlinLoad1 = New-Sensor -Name 'Merlin_Load1' -Getter {
    (Get-MerlinSnapshot).Load1
} -Normalizer {
    param([double]$raw)
    # Tweak for your SoC/cores; this keeps things conservative.
    ConvertTo-NormalizedLessIsBetter -Value $raw -Target 0.7 -Worst 2.5
} -Weight 0.8

$SensorMerlinMemUsed = New-Sensor -Name 'Merlin_MemUsedPct' -Getter {
    (Get-MerlinSnapshot).MemUsedPct
} -Normalizer {
    param([double]$raw)
    # 65% or less is comfy; 95% is starving.
    ConvertTo-NormalizedLessIsBetter -Value $raw -Target 65 -Worst 95
} -Weight 0.8

$SensorMerlinWanErr = New-Sensor -Name 'Merlin_WAN_ErrPerK' -Getter {
    (Get-MerlinSnapshot).ErrPerK
} -Normalizer {
    param([double]$raw)
    # Near-zero is normal. Penalize quickly after ~2 per 1k packets.
    ConvertTo-NormalizedLessIsBetter -Value $raw -Target 0.5 -Worst 10
} -Weight 1.1

# Optional convenience profile focused on the router/WAN path:
$Profiles['HomeLabWAN'] = @{
    Sensors = @(
        $SensorMerlinWan,
        $SensorMerlinPingLoss,
        $SensorMerlinWanErr,
        $SensorMerlinLoad1,
        $SensorMerlinMemUsed
    )
}
# --- Example usage ------------------------------------------------------------
# Start-MeasureLoop -ProfileName 'HomeLabWAN' -IntervalSec 30 -Iterations 5
# Start-MeasureLoop -ProfileName 'FocusDay' -IntervalSec 30 -Iterations 5
# Start-MeasureLoop -ProfileName 'VoiceReliability' -IntervalSec 60 -Iterations 10
# ------------------------------------------------------------------------------
# ------------------------------------------------------------------------------



