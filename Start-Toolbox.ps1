<#
.SYNOPSIS
    UnifiedAIToolbox - Simple Launcher for Windows

.DESCRIPTION
    Launches the UnifiedAIToolbox FastAPI backend and Next.js web portal.

.EXAMPLE
    .\Start-Toolbox.ps1
    # Launches all services

.NOTES
    Requires: Python 3.12+, Node.js 18+, PowerShell 7+
#>

[CmdletBinding()]
param(
    [int]$RunSeconds = 0,
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$ProjectRoot = $PSScriptRoot

function Test-IsEnvPlaceholder([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
    $trimmed = $Value.Trim()
    if ($trimmed -match '^\$\(\$(env:)?[A-Za-z_][A-Za-z0-9_]*\)$') { return $true } # PowerShell: $($VAR), $($env:VAR)
    if ($trimmed -match '^\$\{(env:)?[A-Za-z_][A-Za-z0-9_]*\}$') { return $true } # Shell/PS: ${VAR}, ${env:VAR}
    if ($trimmed -match '^\$(env:)?[A-Za-z_][A-Za-z0-9_]*$') { return $true }      # Shell/PS: $VAR, $env:VAR
    return $false
}

function Resolve-EnvPlaceholder([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) { return $Value }
    $trimmed = $Value.Trim()

    $name = $null
    if ($trimmed -match '^\$\(\$(env:)?(?<name>[A-Za-z_][A-Za-z0-9_]*)\)$') {
        $name = $matches['name']
    } elseif ($trimmed -match '^\$\{(env:)?(?<name>[A-Za-z_][A-Za-z0-9_]*)\}$') {
        $name = $matches['name']
    } elseif ($trimmed -match '^\$(env:)?(?<name>[A-Za-z_][A-Za-z0-9_]*)$') {
        $name = $matches['name']
    }

    if (-not $name) { return $trimmed }
    $resolved = (Get-Item "Env:$name" -ErrorAction SilentlyContinue).Value
    if ([string]::IsNullOrWhiteSpace($resolved)) { return $trimmed }
    return $resolved
}

function Get-PythonCommand {
    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) {
        return [PSCustomObject]@{
            Path = $pyLauncher.Source
            PrefixArgs = @("-3")
            DisplayName = "py -3"
        }
    }

    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($pythonCommand) {
        return [PSCustomObject]@{
            Path = $pythonCommand.Source
            PrefixArgs = @()
            DisplayName = "python"
        }
    }

    throw "Python executable not found. Install Python 3.12+ and ensure 'py' or 'python' is available on PATH."
}

function Assert-PythonVersion([object]$PythonCommand) {
    $versionProbe = 'import sys; print(f"{sys.version_info[0]}.{sys.version_info[1]}.{sys.version_info[2]}")'
    $versionOutput = & $PythonCommand.Path @($PythonCommand.PrefixArgs + @("-c", $versionProbe)) 2>$null
    if ([string]::IsNullOrWhiteSpace($versionOutput)) {
        throw "Unable to determine Python version from '$($PythonCommand.DisplayName)'."
    }

    $detectedVersionText = $versionOutput.Trim()
    [version]$detectedVersion = $detectedVersionText
    Write-Host "Detected Python ($($PythonCommand.DisplayName)): $detectedVersionText" -ForegroundColor Gray
    if ($detectedVersion -lt [version]"3.12.0") {
        throw "Python 3.12 or newer is required. Found $detectedVersionText via '$($PythonCommand.DisplayName)'."
    }
}

Write-Host "UnifiedAIToolbox Launcher" -ForegroundColor Cyan
Write-Host ""

# Check for .env file
$envFile = Join-Path $ProjectRoot ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "WARNING: .env file not found. Creating from template..." -ForegroundColor Yellow
    Copy-Item (Join-Path $ProjectRoot ".env.example") $envFile
    Write-Host "Please edit .env and add your OPENAI_API_KEY" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to continue after editing .env"
}

# Load environment variables
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^([^#][^=]+)=(.*)$') {
        $key = $matches[1].Trim()
        $value = $matches[2].Trim()

        # Support inline comments like: KEY=value  # comment
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        } else {
            $value = ($value -replace '\s+#.*$', '').Trim()
        }

        $value = Resolve-EnvPlaceholder $value
        [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
}

# Check for OpenAI API key
if (
    [string]::IsNullOrEmpty($env:OPENAI_API_KEY) -or
    (Test-IsEnvPlaceholder $env:OPENAI_API_KEY) -or
    $env:OPENAI_API_KEY -eq "sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
) {
    Write-Host "ERROR: OPENAI_API_KEY not set in .env" -ForegroundColor Red
    Write-Host "   Please edit .env and add a real OpenAI API key (not a placeholder like `$(`$OPENAI_API_KEY))." -ForegroundColor Red
    exit 1
}
if ([string]::IsNullOrWhiteSpace($env:NEXT_PUBLIC_API_KEY) -and [string]::IsNullOrWhiteSpace($env:NEXT_PUBLIC_OPENAI_API_KEY)) {
    Write-Host "WARNING: Browser AI features are disabled until you provide a dedicated NEXT_PUBLIC_* key." -ForegroundColor Yellow
    Write-Host "   The launcher no longer mirrors OPENAI_API_KEY into browser-exposed variables." -ForegroundColor Yellow
}

$ApiPort = if ($env:API_PORT) { [int]$env:API_PORT } else { 8000 }
$WebPort = if ($env:WEB_PORT) { [int]$env:WEB_PORT } else { 3000 }
if ([string]::IsNullOrWhiteSpace($env:PROMPT_API_HOST)) {
    # Keep API loopback-bound by default to reduce accidental LAN exposure.
    $env:PROMPT_API_HOST = "127.0.0.1"
}

# ---------------------------------------------------------------------------
# Port helpers
# ---------------------------------------------------------------------------

function Get-ExcludedPortRanges {
    <#
    .SYNOPSIS
        Returns TCP port ranges reserved by Windows (e.g. by Hyper-V, WSL2, WinNAT, Docker).
        These ranges cause bind() to fail with "access denied" even though no process is
        actively listening, which is why netstat shows nothing for those ports.
    #>
    $ranges = @()
    try {
        $output = & netsh int ipv4 show excludedportrange protocol=tcp 2>$null
        foreach ($line in $output) {
            if ($line -match '^\s*(\d+)\s+(\d+)') {
                $ranges += [PSCustomObject]@{ Start = [int]$Matches[1]; End = [int]$Matches[2] }
            }
        }
    } catch { }
    return $ranges
}

function Get-PortOwner([int]$Port) {
    <#
    .SYNOPSIS
        Return a human-readable description of the process (or reservation) blocking Port.
    #>
    try {
        $matches2 = netstat -ano 2>$null |
            Select-String -Pattern ":$Port\s" |
            Where-Object { $_ -match 'LISTENING' }
        if ($matches2) {
            $pid2 = ($matches2[0].ToString().Trim() -split '\s+')[-1]
            $proc = Get-Process -Id $pid2 -ErrorAction SilentlyContinue
            if ($proc) { return "$($proc.ProcessName) (PID $pid2)" }
            return "PID $pid2"
        }
    } catch { }
    # No LISTENING process found - check whether Windows has reserved this port range.
    # Hyper-V, WSL2, and Docker Desktop reserve port ranges on startup; attempts to bind
    # those ports fail with "access denied" even though no user-space process holds them.
    try {
        foreach ($r in (Get-ExcludedPortRanges)) {
            if ($Port -ge $r.Start -and $Port -le $r.End) {
                return "Windows port reservation (range $($r.Start)-$($r.End); typically reserved by Hyper-V, WSL2, or Docker Desktop)"
            }
        }
    } catch { }
    return "unknown process"
}

function Test-PortFree([int]$Port) {
    <#
    .SYNOPSIS
        Returns $true when Port is available to bind.
    #>
    try {
        $tcp = [System.Net.Sockets.TcpListener]::new(
            [System.Net.IPAddress]::Loopback, $Port)
        $tcp.Start()
        $tcp.Stop()
        return $true
    } catch {
        return $false
    }
}

function Test-PortInExcludedRange([int]$Port, [object[]]$ExcludedRanges) {
    <#
    .SYNOPSIS
        Returns $true when Port falls within any of the supplied Windows-excluded ranges.
    #>
    foreach ($r in $ExcludedRanges) {
        if ($Port -ge $r.Start -and $Port -le $r.End) { return $true }
    }
    return $false
}

function Find-AvailablePort([int]$BasePort, [string]$ServiceName, [int]$MaxAttempts = 10) {
    <#
    .SYNOPSIS
        Return the first free TCP port at or above BasePort.
        Emits a warning for each occupied port, identifying its owner.
        When all ports fail due to Windows OS reservations (Hyper-V/WSL2/Docker) rather
        than actual listening processes, prints an actionable diagnostic with fix steps.
    #>
    $maxPort = $BasePort + $MaxAttempts - 1
    for ($i = 0; $i -lt $MaxAttempts; $i++) {
        $candidate = $BasePort + $i
        if (Test-PortFree $candidate) {
            if ($candidate -ne $BasePort) {
                Write-Host "  Using port $candidate for $ServiceName." -ForegroundColor Gray
            }
            return $candidate
        }
        $owner = Get-PortOwner $candidate
        Write-Warning "Port $candidate (for $ServiceName) is in use by: $owner"
    }

    # Determine whether the failures are caused by Windows port exclusions rather than
    # real listening processes.  When Hyper-V, WSL2, or Docker Desktop is enabled,
    # Windows reserves whole port ranges at the OS level.  bind() fails with
    # "access denied" so no process appears in netstat, yet the ports are unusable.
    try {
        $excluded = Get-ExcludedPortRanges
        if ($excluded.Count -gt 0) {
            $reservedCount = 0
            for ($i = 0; $i -lt $MaxAttempts; $i++) {
                if (Test-PortInExcludedRange ($BasePort + $i) $excluded) { $reservedCount++ }
            }
            if ($reservedCount -gt 0) {
                Write-Host ""
                Write-Host "  HINT: Port(s) in the range $BasePort-$maxPort are reserved by" -ForegroundColor Yellow
                Write-Host "  Windows and cannot be bound, even though no process is listening on them." -ForegroundColor Yellow
                Write-Host "  This is typically caused by Hyper-V, WSL2, or Docker Desktop reserving" -ForegroundColor Yellow
                Write-Host "  dynamic port ranges on startup." -ForegroundColor Yellow
                Write-Host ""
                Write-Host "  To see all currently reserved ranges, run:" -ForegroundColor Cyan
                Write-Host "    netsh int ipv4 show excludedportrange protocol=tcp" -ForegroundColor Cyan
                Write-Host ""
                Write-Host "  REMEDIATION - choose one option:" -ForegroundColor Green
                Write-Host "    1. Set a different base port in your .env file (e.g. API_PORT=9000)" -ForegroundColor Green
                Write-Host "       then rerun this script." -ForegroundColor Green
                Write-Host "    2. (Advanced) Disable and re-enable the Hyper-V/WSL2/Docker service" -ForegroundColor Green
                Write-Host "       to force Windows to pick a different exclusion range, or run" -ForegroundColor Green
                Write-Host "       'netsh int ipv4 delete excludedportrange ...' in an elevated" -ForegroundColor Green
                Write-Host "       PowerShell to remove the conflicting reservation." -ForegroundColor Green
                Write-Host ""
            }
        }
    } catch { }

    throw "No available port found for $ServiceName in range $BasePort–$maxPort."
}

Write-Host "Installing dependencies..." -ForegroundColor Cyan

# Create virtual environment (prefer repo-root .venv, fall back to .uaitoolbox/.venv when .venv is locked)
$primaryVenvPath = Join-Path $ProjectRoot ".venv"
$fallbackVenvPath = [System.IO.Path]::Combine($ProjectRoot, ".uaitoolbox", ".venv")
$venvPath = $primaryVenvPath
$pythonCommand = Get-PythonCommand
Assert-PythonVersion -PythonCommand $pythonCommand

function Test-VenvOk([string]$Path) {
    $venvPythonLocal = Join-Path $Path "Scripts\python.exe"
    $pipExeLocal = Join-Path $Path "Scripts\pip.exe"
    return (Test-Path $Path) -and (Test-Path $venvPythonLocal) -and (Test-Path (Join-Path $Path "pyvenv.cfg")) -and (Test-Path $pipExeLocal)
}

if ((Test-Path $venvPath) -and (-not (Test-VenvOk $venvPath))) {
    Write-Host "  WARNING: Detected an incomplete .venv. Recreating it..." -ForegroundColor Yellow
    try {
        Remove-Item -Recurse -Force $venvPath
    } catch {
        Write-Host "  WARNING: Could not remove $venvPath (it may be in use). Using $fallbackVenvPath instead." -ForegroundColor Yellow
        $venvPath = $fallbackVenvPath
    }
}

if ($SkipInstall -and (-not (Test-VenvOk $venvPath))) {
    if (Test-VenvOk $fallbackVenvPath) {
        $venvPath = $fallbackVenvPath
    } else {
        throw "SkipInstall requested but no usable virtual environment was found. Rerun without -SkipInstall to create and install dependencies."
    }
}

if (-not (Test-Path $venvPath)) {
    $venvParent = Split-Path -Parent $venvPath
    if (-not (Test-Path $venvParent)) {
        New-Item -ItemType Directory -Path $venvParent | Out-Null
    }

    Write-Host "  -> Creating Python virtual environment..." -ForegroundColor Gray
    # Create venv without pip to avoid ensurepip hang on Windows
    & $pythonCommand.Path @($pythonCommand.PrefixArgs + @("-m", "venv", "--without-pip", $venvPath))

    # Install pip using get-pip.py (more reliable on Windows)
    Write-Host "  -> Installing pip..." -ForegroundColor Gray
    $venvPython = Join-Path $venvPath "Scripts\python.exe"
    $getPipUrl = "https://bootstrap.pypa.io/get-pip.py"
    $getPipPath = Join-Path $env:TEMP "get-pip.py"
    try {
        Invoke-WebRequest -Uri $getPipUrl -OutFile $getPipPath -UseBasicParsing
        & $venvPython $getPipPath --quiet
        Remove-Item $getPipPath -ErrorAction SilentlyContinue
    } catch {
        Write-Host "  WARNING: Could not download get-pip.py, trying ensurepip..." -ForegroundColor Yellow
        & $venvPython -m ensurepip --upgrade
    }
}

# Refresh paths after potential recreation / fallback
$venvPython = Join-Path $venvPath "Scripts\python.exe"
$pipExe = Join-Path $venvPath "Scripts\pip.exe"
if (-not (Test-Path $venvPython) -or -not (Test-Path $pipExe)) {
    throw "Python virtual environment is missing expected executables. Delete '$venvPath' and rerun Start-Toolbox.ps1."
}

# Install Python dependencies
if ($SkipInstall) {
    Write-Host "  -> Skipping Python package install (-SkipInstall)." -ForegroundColor Gray
} else {
    $requirementsToInstall = @(
        [PSCustomObject]@{
            Label = "root requirements"
            Path = Join-Path $ProjectRoot "requirements.txt"
        },
        [PSCustomObject]@{
            Label = "prompt-api requirements"
            Path = [System.IO.Path]::Combine($ProjectRoot, "apps", "UnifiedPromptApp", "services", "prompt-api", "requirements.txt")
        }
    )

    foreach ($req in $requirementsToInstall) {
        if (Test-Path $req.Path) {
            Write-Host "  -> Installing Python packages from $($req.Label): $($req.Path)" -ForegroundColor Gray
            & $venvPython -m pip install -q -r $req.Path
        } else {
            Write-Host "  WARNING: Requirements file not found for $($req.Label): $($req.Path). Skipping." -ForegroundColor Yellow
        }
    }
}

# Install Node dependencies
$webappPath = Join-Path $ProjectRoot "apps\unifiedtoolbox.webapp"
if ($SkipInstall) {
    Write-Host "  -> Skipping Node package install (-SkipInstall)." -ForegroundColor Gray
} else {
    Write-Host "  -> Installing Node packages..." -ForegroundColor Gray
    Push-Location $webappPath
    try {
        if (Test-Path "package-lock.json") {
            npm ci --no-audit --no-fund
        } else {
            npm install --no-audit --no-fund
        }
    } finally {
        Pop-Location
    }
}

# Setup Swarms engine (optional but enabled by default for orchestration + UI)
try {
    Write-Host "  -> Ensuring Swarms engine..." -ForegroundColor Gray
    $swarmsPython = [System.IO.Path]::Combine($ProjectRoot, ".uaitoolbox", "swarms", ".venv", "Scripts", "python.exe")
    if (-not (Test-Path $swarmsPython)) {
        $setupScript = [System.IO.Path]::Combine($ProjectRoot, "scripts", "Setup-Swarms.ps1")
        if (Test-Path $setupScript) {
            $resolved = & $setupScript -Quiet
            if ($resolved) { $swarmsPython = $resolved }
        }
    }
    if (Test-Path $swarmsPython) {
        $env:SWARMS_PYTHON_BIN = $swarmsPython
    } else {
        Write-Host "  WARNING: Swarms engine not available (missing venv). Run: pwsh ./scripts/Setup-Swarms.ps1" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  WARNING: Swarms engine setup failed: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Checking port availability..." -ForegroundColor Cyan
Write-Host ""

$ActualApiPort = Find-AvailablePort -BasePort $ApiPort -ServiceName "Prompt API"
$ActualWebPort = Find-AvailablePort -BasePort $WebPort -ServiceName "Web Portal"

Write-Host ""
Write-Host "Starting services..." -ForegroundColor Cyan
Write-Host ""

# Best-effort cleanup helper (kills child processes like Uvicorn reload + Next.js dev server trees)
function Stop-ProcessTree([int]$procid) {
    if ($procid -le 0) { return }
    try { & taskkill.exe /PID $procid /T /F | Out-Null } catch { }
}

$apiProc = $null
$webProc = $null

try {
# Create logs directory
$logsDir = Join-Path $ProjectRoot "logs"
if (-not (Test-Path $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir | Out-Null
}

# Start API in background
Write-Host "  -> Starting API (port $ActualApiPort)..." -ForegroundColor Gray
$apiPath = Join-Path $ProjectRoot "apps\UnifiedPromptApp\services\prompt-api"
$apiOutLog = Join-Path $logsDir "api.log"
$apiErrLog = Join-Path $logsDir "api.err.log"

if ([string]::IsNullOrWhiteSpace($env:PYTHONPATH)) {
    $env:PYTHONPATH = "$ProjectRoot"
} else {
    $env:PYTHONPATH = "$ProjectRoot;$env:PYTHONPATH"
}
$env:PROMPT_API_PORT = "$ActualApiPort"

$apiProc = Start-Process `
    -FilePath $venvPython `
    -ArgumentList @("app.py") `
    -WorkingDirectory $apiPath `
    -RedirectStandardOutput $apiOutLog `
    -RedirectStandardError $apiErrLog `
    -NoNewWindow `
    -PassThru

Start-Sleep -Seconds 3

# Start Web Portal in background
Write-Host "  -> Starting Web Portal (port $ActualWebPort)..." -ForegroundColor Gray
$webOutLog = Join-Path $logsDir "webapp.log"
$webErrLog = Join-Path $logsDir "webapp.err.log"

$env:PORT = "$ActualWebPort"
$env:NEXT_PUBLIC_API_BASE = "http://localhost:$ActualApiPort"

# Prefer the Windows batch wrapper so Start-Process can launch it reliably.
# (Get-Command npm) often resolves to npm.ps1, which is not a Win32 executable.
$npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($null -ne $npmCmd) {
    $npmPath = $npmCmd.Source
    $npmArgs = @("run", "dev")
} else {
    $npmCommand = Get-Command npm -ErrorAction Stop
    if (($npmCommand.CommandType -eq "ExternalScript") -and ($npmCommand.Source -like "*.ps1")) {
        $pwshPath = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
        if (-not $pwshPath) { $pwshPath = (Get-Command powershell -ErrorAction Stop).Source }
        $npmPath = $pwshPath
        $npmArgs = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $npmCommand.Source, "run", "dev")
    } else {
        $npmPath = $npmCommand.Source
        $npmArgs = @("run", "dev")
    }
}
$webProc = Start-Process `
    -FilePath $npmPath `
    -ArgumentList $npmArgs `
    -WorkingDirectory $webappPath `
     -RedirectStandardOutput $webOutLog `
     -RedirectStandardError $webErrLog `
     -NoNewWindow `
     -PassThru

Start-Sleep -Seconds 5

Write-Host ""
Write-Host "UnifiedAIToolbox is running!" -ForegroundColor Green
Write-Host ""
Write-Host "  Web Portal:  http://localhost:$ActualWebPort" -ForegroundColor Cyan
Write-Host "  API Docs:    http://localhost:$ActualApiPort/docs" -ForegroundColor Cyan
Write-Host "  Health:      http://localhost:$ActualApiPort/health" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Logs:        Get-Content logs\\*.log -Tail 50" -ForegroundColor Gray
Write-Host ""
Write-Host "Press Ctrl+C to stop all services." -ForegroundColor Yellow
Write-Host ""

    # Keep script running
    $startedAt = Get-Date
    while ($true) {
        Start-Sleep -Seconds 1

        if ($RunSeconds -gt 0) {
            $elapsed = (Get-Date) - $startedAt
            if ($elapsed.TotalSeconds -ge $RunSeconds) {
                Write-Host "RunSeconds elapsed; stopping services..." -ForegroundColor Yellow
                break
            }
        }

        if (($null -eq $apiProc) -or ($null -eq $webProc) -or $apiProc.HasExited -or $webProc.HasExited) {
            Write-Host "WARNING: A service stopped unexpectedly. Check logs for details." -ForegroundColor Yellow
            break
        }
    }
} finally {
    Write-Host ""
    Write-Host "Stopping services..." -ForegroundColor Yellow

    if ($null -ne $webProc) { Stop-ProcessTree $webProc.Id }
    if ($null -ne $apiProc) { Stop-ProcessTree $apiProc.Id }
}
