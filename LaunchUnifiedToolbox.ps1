[CmdletBinding()]
param(
    [string]$PythonExe = "python",
    [int]$FrontendPort = 5173,
    [int]$ApiPort = 8000,
    [int]$WorkbenchPort = 8501,
    [int]$DocsPort = 5174,
    [switch]$SkipInstall,
    [switch]$FrontendOnly,
    [switch]$BackendOnly,
    [switch]$EnableStreamlit,
    [string]$Model = "gpt-4o-mini",
    [string]$FrontendPassthru = "",
    [switch]$RunBridgeWorker,
    [ValidateSet("api","local","both")]
    [string]$BridgeSource = "both",
    [string]$BridgeWorkerPassthru = "",
    [switch]$SkipHealthChecks,
    [int]$HealthTimeoutSeconds = 90,
    [int]$HealthRetrySeconds = 3
)

<#
.SYNOPSIS
    All-in-one launcher for the Unified AI Toolbox (React Dashboard + Prompt API).

.DESCRIPTION
    - Validates prerequisites (Node/NPM + Python).
    - Ensures dependencies for both the prompt hub frontend and the prompt API backend.
    - Starts FastAPI (uvicorn) and the React/Vite dashboard with coordinated ports.
    - Streamlit workbench is deprecated (use -EnableStreamlit to launch it).
    - Keeps track of launched processes so they can be terminated when this script exits.

.EXAMPLES
    pwsh .\LaunchUnifiedToolbox.ps1
    pwsh .\LaunchUnifiedToolbox.ps1 -FrontendPort 5180 -ApiPort 8100 -SkipInstall
    pwsh .\LaunchUnifiedToolbox.ps1 -FrontendOnly -FrontendPassthru "--open"
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($FrontendOnly -and $BackendOnly) {
    throw "Cannot specify -FrontendOnly and -BackendOnly together."
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$dashboardDir = Join-Path $repoRoot "apps\dashboard"
$apiDir = Join-Path $repoRoot "services\prompt-api"
$bridgeDir = Join-Path $repoRoot "apps\orchestration-bridge"
$backendVenvName = if ($IsWindows) { ".venv" } else { ".venv-linux" }
$backendVenv = Join-Path $apiDir $backendVenvName
$frontendPackage = Join-Path $dashboardDir "package.json"
$backendApp = Join-Path $apiDir "app.py"

if (-not (Test-Path $frontendPackage)) {
    throw "Prompt hub app not found at $dashboardDir."
}

if (-not (Test-Path $backendApp)) {
    throw "Prompt API app not found at $apiDir."
}

function Test-Command {
    param([Parameter(Mandatory)][string]$Name)
    Write-Verbose "Checking for command: $Name"
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Missing required command: $Name. Please ensure it is installed and in your PATH."
    }
    Write-Verbose "Command found: $Name"
}

function Test-PortAvailable {
    param([Parameter(Mandatory)][int]$Port)
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        $listener.Stop()
        return $true
    } catch {
        return $false
    }
}

function Write-ErrorWithContext {
    param(
        [Parameter(Mandatory)][string]$Message,
        [System.Management.Automation.ErrorRecord]$ErrorRecord
    )
    Write-Host "ERROR: $Message" -ForegroundColor Red
    if ($ErrorRecord) {
        Write-Host "  Details: $($ErrorRecord.Exception.Message)" -ForegroundColor Red
        if ($VerbosePreference -eq 'Continue') {
            Write-Host "  Stack Trace: $($ErrorRecord.ScriptStackTrace)" -ForegroundColor DarkRed
        }
    }
}

function Resolve-Port {
    param(
        [Parameter(Mandatory)][int]$PreferredPort,
        [string]$ServiceName,
        [int]$MaxAttempts = 20
    )

    $port = $PreferredPort
    for ($attempt = 0; $attempt -lt $MaxAttempts; $attempt++) {
        if (Test-PortAvailable -Port $port) {
            if ($port -ne $PreferredPort) {
                Write-Warning ("{0}: Port {1} is busy. Using {2} instead." -f $ServiceName, $PreferredPort, $port)
            }
            return $port
        }
        $port++
    }

    throw ("{0}: Unable to find an available port starting from {1} (checked {2} ports)." -f $ServiceName, $PreferredPort, $MaxAttempts)
}

# Validate prerequisites
Write-Host "Validating prerequisites..." -ForegroundColor Cyan

$pythonCandidates = @($PythonExe)
if ($PythonExe -eq "python") {
    $pythonCandidates += "python3"
}

$resolvedPython = $null
foreach ($candidate in $pythonCandidates) {
    if (Get-Command $candidate -ErrorAction SilentlyContinue) {
        $resolvedPython = $candidate
        break
    }
}

if (-not $resolvedPython) {
    throw "Missing required command: python/python3. Please ensure one is installed and in your PATH."
}

$PythonExe = $resolvedPython
Test-Command -Name $PythonExe
Test-Command -Name "npm"
$script:NpmExecutable = "npm"

# Validate ports are available (with fallback)
Write-Verbose "Checking port availability..."
if (-not $BackendOnly) {
    $FrontendPort = Resolve-Port -PreferredPort $FrontendPort -ServiceName "Prompt Hub"
}
if (-not $FrontendOnly) {
    $ApiPort = Resolve-Port -PreferredPort $ApiPort -ServiceName "Prompt API"
    if ($EnableStreamlit) {
        $WorkbenchPort = Resolve-Port -PreferredPort $WorkbenchPort -ServiceName "Prompt Workbench UI"
    }
}
$portSummary = @()
if (-not $BackendOnly) {
    $portSummary += "Frontend=$FrontendPort"
}
if (-not $FrontendOnly) {
    $portSummary += "API=$ApiPort"
    if ($EnableStreamlit) {
        $portSummary += "Workbench=$WorkbenchPort"
    }
}
if ($portSummary.Count -gt 0) {
    Write-Host ("Ports resolved. {0}" -f ($portSummary -join ", ")) -ForegroundColor Green
}

$docsPortAvailable = Test-PortAvailable -Port $DocsPort
if ($docsPortAvailable) {
    Write-Host ("Docs preview port {0} is available." -f $DocsPort) -ForegroundColor DarkGreen
} else {
    Write-Warning ("Docs preview port {0} is currently in use. If you plan to run the docs app, specify an alternate port with -DocsPort." -f $DocsPort)
}

function Invoke-CommandSafe {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$ArgumentList = @(),
        [string]$WorkingDirectory,
        [int]$MaxRetries = 1,
        [int]$RetryDelaySeconds = 2
    )

    # For simple command names (like "npm", "python"), use direct invocation
    # For full paths, check if they need special handling
    $useDirectInvocation = $false
    if (-not [System.IO.Path]::IsPathRooted($FilePath)) {
        # Not a full path - it's a command name like "npm" or "python"
        $useDirectInvocation = $true
    }

    $attempt = 0
    $lastError = $null

    while ($attempt -lt $MaxRetries) {
        $attempt++
        try {
            if ($useDirectInvocation) {
                # Use Invoke-Expression with proper working directory handling
                $originalLocation = Get-Location
                if ($WorkingDirectory) {
                    Set-Location $WorkingDirectory
                }
                try {
                    # Build argument string properly escaped
                    $argString = ""
                    foreach ($arg in $ArgumentList) {
                        if ($arg -match '\s') {
                            $argString += " `"$arg`""
                        } else {
                            $argString += " $arg"
                        }
                    }
                    $fullCommand = "$FilePath$argString"
                    Write-Verbose "Executing (attempt $attempt/$MaxRetries): $fullCommand"
                    Invoke-Expression $fullCommand
                    $exitCode = $LASTEXITCODE
                    if ($null -eq $exitCode) { $exitCode = 0 }
                    if ($exitCode -ne 0) {
                        throw ("Command {0} exited with code {1}" -f $FilePath, $exitCode)
                    }
                    return # Success
                } finally {
                    Set-Location $originalLocation
                }
            } else {
                # Full path - use Start-Process for executables
                Write-Verbose "Executing (attempt $attempt/$MaxRetries): $FilePath $($ArgumentList -join ' ')"
                $psi = @{
                    FilePath = $FilePath
                    ArgumentList = $ArgumentList
                    NoNewWindow = $true
                    Wait = $true
                    PassThru = $true
                }
                if ($WorkingDirectory) {
                    $psi.WorkingDirectory = $WorkingDirectory
                }
                $process = Start-Process @psi
                if ($process.ExitCode -ne 0) {
                    throw ("Command {0} exited with code {1}" -f $FilePath, $process.ExitCode)
                }
                return # Success
            }
        } catch {
            $lastError = $_
            if ($attempt -lt $MaxRetries) {
                Write-Warning "Command failed (attempt $attempt/$MaxRetries): $($_.Exception.Message). Retrying in $RetryDelaySeconds seconds..."
                Start-Sleep -Seconds $RetryDelaySeconds
            }
        }
    }

    # All retries failed
    throw $lastError
}

function Ensure-FrontendDeps {
    if ($SkipInstall) { return }
    $nodeModules = Join-Path $dashboardDir "node_modules"
    if (Test-Path $nodeModules) { return }
    Write-Host "Installing npm dependencies for Prompt Hub..." -ForegroundColor Cyan
    Invoke-CommandSafe -FilePath $script:NpmExecutable -ArgumentList @("install") -WorkingDirectory $dashboardDir
}

function Ensure-BackendDeps {
    $venvScriptsFolder = if ($IsWindows) { "Scripts" } else { "bin" }
    $pythonExecutableName = if ($IsWindows) { "python.exe" } else { "python" }
    $pipExecutableName = if ($IsWindows) { "pip.exe" } else { "pip" }

    $pythonPath = Join-Path $backendVenv (Join-Path $venvScriptsFolder $pythonExecutableName)
    $pipPath = Join-Path $backendVenv (Join-Path $venvScriptsFolder $pipExecutableName)

    if (-not (Test-Path $pythonPath) -or -not (Test-Path $pipPath)) {
        if (Test-Path $backendVenv) {
            Write-Host "Existing Prompt API virtual environment is incompatible with this platform. Recreating..." -ForegroundColor Yellow
            Remove-Item -Recurse -Force $backendVenv
        }
        Write-Host "Creating Prompt API virtual environment..." -ForegroundColor Cyan
        Invoke-CommandSafe -FilePath $PythonExe -ArgumentList @("-m","venv",$backendVenv) -WorkingDirectory $apiDir

        $pythonPath = Join-Path $backendVenv (Join-Path $venvScriptsFolder $pythonExecutableName)
        $pipPath = Join-Path $backendVenv (Join-Path $venvScriptsFolder $pipExecutableName)
    }

    if (-not (Test-Path $pipPath)) {
        throw "pip not found under $backendVenv. Delete the folder and rerun."
    }
    if (-not (Test-Path $pythonPath)) {
        throw "python executable not found under $backendVenv. Delete the folder and rerun."
    }

    if (-not $SkipInstall) {
        $requirements = Join-Path $apiDir "requirements.txt"
        Write-Host "Upgrading backend dependencies..." -ForegroundColor Cyan
        Invoke-CommandSafe -FilePath $pythonPath -ArgumentList @("-m","pip","install","--upgrade","pip")
        Invoke-CommandSafe -FilePath $pipPath -ArgumentList @("install","-r",$requirements)
        if ($EnableStreamlit) {
            Invoke-CommandSafe -FilePath $pipPath -ArgumentList @("install","streamlit")
        }
    }
    return @{
        Python = $pythonPath
        Pip    = $pipPath
    }
}

function Convert-CommandLineToArgs {
    param([string]$Line)
    if (-not $Line) { return @() }
    $null = $null
    $tokens = [System.Management.Automation.PSParser]::Tokenize($Line, [ref]$null)
    return $tokens |
        Where-Object { $_.Type -in @("CommandArgument","String") } |
        ForEach-Object { $_.Content }
}

function Start-ChildProcess {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$ArgumentList = @(),
        [string]$WorkingDirectory,
        [hashtable]$Environment = @{}
    )

    Write-Verbose "Starting child process: $Name"
    Write-Verbose "  FilePath: $FilePath"
    Write-Verbose "  Arguments: $($ArgumentList -join ' ')"
    Write-Verbose "  WorkingDirectory: $WorkingDirectory"

    # Check if this is a simple command name (like "npm") vs a full path
    $useDirectInvocation = -not [System.IO.Path]::IsPathRooted($FilePath)

    try {
        if ($useDirectInvocation) {
            # For command names like "npm", build a PowerShell script block to run in background
            $argString = ""
            foreach ($arg in $ArgumentList) {
                if ($arg -match '\s') {
                    $argString += " `"$arg`""
                } else {
                    $argString += " $arg"
                }
            }

            # Build environment variable setters
            $envString = ""
            foreach ($key in $Environment.Keys) {
                $envString += "`$env:$key='$($Environment[$key])'; "
            }

            # Create a script block that sets environment and runs the command
            $scriptBlock = [ScriptBlock]::Create("$envString Set-Location '$WorkingDirectory'; $FilePath$argString")

            # Start as a background job that we can track
            $proc = Start-Process pwsh -ArgumentList @("-NoProfile", "-Command", $scriptBlock.ToString()) -PassThru

            # Verify process started successfully
            Start-Sleep -Milliseconds 500
            if ($proc.HasExited) {
                throw "Process exited immediately with code $($proc.ExitCode)"
            }

            Write-Host ("Started {0} (PID {1})." -f $Name, $proc.Id) -ForegroundColor Green
            return $proc
        } else {
            # For full paths (executables), use Start-Process
            $psi = @{
                FilePath = $FilePath
                ArgumentList = $ArgumentList
                PassThru = $true
            }
            if ($WorkingDirectory) { $psi.WorkingDirectory = $WorkingDirectory }
            if ($Environment.Count -gt 0) { $psi.Environment = $Environment }

            $proc = Start-Process @psi

            # Verify process started successfully
            Start-Sleep -Milliseconds 500
            if ($proc.HasExited) {
                throw "Process exited immediately with code $($proc.ExitCode)"
            }

            Write-Host ("Started {0} (PID {1})." -f $Name, $proc.Id) -ForegroundColor Green
            return $proc
        }
    } catch {
        Write-ErrorWithContext -Message "Failed to start $Name" -ErrorRecord $_
        throw
    }
}function Wait-ForEndpoint {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Url,
        [int]$TimeoutSeconds = 60,
        [int]$RetrySeconds = 2
    )
    Write-Verbose "Waiting for $Name to be ready at $Url (timeout: ${TimeoutSeconds}s)..."
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $attempt = 0
    $lastError = $null

    while ((Get-Date) -lt $deadline) {
        $attempt++
        try {
            $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec ([Math]::Min(10, $RetrySeconds * 2)) -ErrorAction Stop
            if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
                Write-Host ("Health check passed for {0} ({1}) after {2} attempts" -f $Name, $Url, $attempt) -ForegroundColor Green
                return $true
            }
        } catch {
            $lastError = $_.Exception.Message
            Write-Verbose "Health check attempt $attempt failed: $lastError"
            # swallow and retry
        }
        Start-Sleep -Seconds $RetrySeconds
    }

    $errorMsg = "Timed out waiting for $Name to respond at $Url after $attempt attempts"
    if ($lastError) {
        $errorMsg += ". Last error: $lastError"
    }
    Write-Host $errorMsg -ForegroundColor Red
    return $false
}

$launched = New-Object System.Collections.Generic.List[object]
$healthCheckFailed = $false

# Register cleanup handler for Ctrl+C
$null = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
    Write-Host "`nShutdown signal received, cleaning up..." -ForegroundColor Yellow
}

try {
    if (-not $FrontendOnly) {
        Write-Host "`nSetting up backend services..." -ForegroundColor Cyan

        try {
            $backend = Ensure-BackendDeps
            $pyExe = $backend.Python
        } catch {
            Write-ErrorWithContext -Message "Failed to setup backend dependencies" -ErrorRecord $_
            throw
        }

        if (-not $env:OPENAI_API_KEY) {
            Write-Warning "OPENAI_API_KEY is not set. API requests that hit OpenAI will fail."
            Write-Host "  Set it with: `$env:OPENAI_API_KEY='your-api-key'" -ForegroundColor Yellow
        }

        $envBackend = @{
            "PROMPT_API_PORT" = "$ApiPort"
            "OPENAI_MODEL"    = $Model
            "FRONTEND_PORT"   = "$FrontendPort"
            "WORKBENCH_PORT"  = "$WorkbenchPort"
        }

        $backendProc = Start-ChildProcess -Name "Prompt API" -FilePath $pyExe -ArgumentList @("app.py") -WorkingDirectory $apiDir -Environment $envBackend
        $launched.Add([pscustomobject]@{ Name="Prompt API"; Process=$backendProc })

        if ($EnableStreamlit) {
            $envWorkbench = @{
                "WORKBENCH_API" = "http://localhost:$ApiPort"
                "OPENAI_MODEL"  = $Model
            }
            $streamlitArgs = @("-m","streamlit","run","streamlit_app.py","--server.port",$WorkbenchPort)
            $streamlitProc = Start-ChildProcess -Name "Prompt Workbench UI" -FilePath $pyExe -ArgumentList $streamlitArgs -WorkingDirectory $apiDir -Environment $envWorkbench
            $launched.Add([pscustomobject]@{ Name="Prompt Workbench UI"; Process=$streamlitProc })
        }

        if ($RunBridgeWorker) {
            $bridgeScript = Join-Path $bridgeDir "bridge.py"
            if (-not (Test-Path $bridgeScript)) {
                throw "Orchestration bridge script not found at $bridgeScript."
            }
            $bridgeArgs = @($bridgeScript, "run-supervisor", "--source", $BridgeSource)
            $bridgeArgs += Convert-CommandLineToArgs -Line $BridgeWorkerPassthru
            $bridgeEnv = @{
                "PROMPT_API_URL" = "http://localhost:$ApiPort"
            }
            $bridgeProc = Start-ChildProcess -Name "Orchestration Bridge" -FilePath $pyExe -ArgumentList $bridgeArgs -WorkingDirectory $bridgeDir -Environment $bridgeEnv
            $launched.Add([pscustomobject]@{ Name="Orchestration Bridge"; Process=$bridgeProc })
        }
    }

    if (-not $BackendOnly) {
        Ensure-FrontendDeps
        $frontArgs = @("run","dev","--","--port",$FrontendPort)
        $frontArgs += Convert-CommandLineToArgs -Line $FrontendPassthru
        $frontProc = Start-ChildProcess -Name "Prompt Hub" -FilePath $script:NpmExecutable -ArgumentList $frontArgs -WorkingDirectory $dashboardDir -Environment @{ "VITE_PORT" = "$FrontendPort" }
        $launched.Add([pscustomobject]@{ Name="Prompt Hub"; Process=$frontProc })
    }

    if ($launched.Count -eq 0) {
        Write-Warning "No processes were started (did you specify mutually exclusive switches?)."
        return
    }

    Write-Host ""
    Write-Host "Unified AI Toolbox is running:" -ForegroundColor Cyan
    if (-not $BackendOnly) {
        Write-Host ("  Dashboard:  http://localhost:{0}" -f $FrontendPort) -ForegroundColor Green
    }
    if (-not $FrontendOnly) {
        Write-Host ("  API:        http://localhost:{0}" -f $ApiPort)
        if ($EnableStreamlit) {
            Write-Host ("  Workbench:  http://localhost:{0} (deprecated)" -f $WorkbenchPort) -ForegroundColor Yellow
        }
    }
    Write-Host ""
    Write-Host "Press Ctrl+C to stop everything..." -ForegroundColor Yellow

    if (-not $SkipHealthChecks) {
        Write-Host "`nPerforming health checks..." -ForegroundColor Cyan

        $apiBaseUrl = "http://127.0.0.1:$ApiPort"
        $frontendBaseUrl = "http://127.0.0.1:$FrontendPort"
        $workbenchBaseUrl = "http://127.0.0.1:$WorkbenchPort"

        if (-not $FrontendOnly) {
            if (-not (Wait-ForEndpoint -Name "Prompt API" -Url "$apiBaseUrl/health" -TimeoutSeconds $HealthTimeoutSeconds -RetrySeconds $HealthRetrySeconds)) {
                $healthCheckFailed = $true
                Write-Warning "Prompt API health check failed. The service may not be functioning correctly."
            }
            if ($EnableStreamlit) {
                if (-not (Wait-ForEndpoint -Name "Prompt Workbench UI" -Url $workbenchBaseUrl -TimeoutSeconds $HealthTimeoutSeconds -RetrySeconds $HealthRetrySeconds)) {
                    $healthCheckFailed = $true
                    Write-Warning "Prompt Workbench UI health check failed. The service may not be functioning correctly."
                }
            }
        }
        if (-not $BackendOnly) {
            if (-not (Wait-ForEndpoint -Name "Prompt Hub" -Url $frontendBaseUrl -TimeoutSeconds $HealthTimeoutSeconds -RetrySeconds $HealthRetrySeconds)) {
                $healthCheckFailed = $true
                Write-Warning "Prompt Hub health check failed. The service may not be functioning correctly."
            }
        }

        if ($healthCheckFailed) {
            Write-Host "`nWARNING: Some services failed health checks. Check the logs above for details." -ForegroundColor Yellow
            Write-Host "The script will continue running, but functionality may be impaired." -ForegroundColor Yellow
        } else {
            Write-Host "`nAll health checks passed successfully!" -ForegroundColor Green
        }
    }

    # Monitor processes
    Write-Verbose "Monitoring child processes..."
    $checkInterval = 2
    $lastCheck = Get-Date

    while ($launched.Process | Where-Object { -not $_.HasExited }) {
        Start-Sleep -Seconds $checkInterval

        # Periodically check if any process has died unexpectedly
        if (((Get-Date) - $lastCheck).TotalSeconds -ge 10) {
            $lastCheck = Get-Date
            foreach ($entry in $launched) {
                if ($entry.Process.HasExited) {
                    Write-Warning ("{0} (PID {1}) has exited unexpectedly with code {2}" -f $entry.Name, $entry.Process.Id, $entry.Process.ExitCode)
                }
            }
        }
    }

    Write-Host "`nAll services have stopped." -ForegroundColor Yellow
} catch {
    Write-ErrorWithContext -Message "An error occurred during execution" -ErrorRecord $_
    throw
} finally {
    Write-Host "`nCleaning up processes..." -ForegroundColor Yellow

    foreach ($entry in $launched) {
        $proc = $entry.Process
        if ($proc) {
            try {
                if (-not $proc.HasExited) {
                    Write-Verbose "Attempting to stop $($entry.Name) gracefully..."
                    $proc.CloseMainWindow() | Out-Null

                    # Wait up to 5 seconds for graceful shutdown
                    $shutdownDeadline = (Get-Date).AddSeconds(5)
                    while (-not $proc.HasExited -and (Get-Date) -lt $shutdownDeadline) {
                        Start-Sleep -Milliseconds 250
                    }

                    if (-not $proc.HasExited) {
                        Write-Verbose "Forcefully terminating $($entry.Name)..."
                        $proc.Kill()
                        Start-Sleep -Milliseconds 500
                    }

                    Write-Host ("Stopped {0} (PID {1})." -f $entry.Name, $proc.Id) -ForegroundColor DarkGray
                } else {
                    Write-Verbose "$($entry.Name) (PID $($proc.Id)) already exited with code $($proc.ExitCode)"
                }
            } catch {
                Write-Warning ("Failed to stop {0} (PID {1}): {2}" -f $entry.Name, $proc.Id, $_.Exception.Message)
            }
        }
    }

    # Unregister event handler
    try {
        Unregister-Event -SourceIdentifier PowerShell.Exiting -ErrorAction SilentlyContinue
    } catch {
        # Ignore errors during cleanup
    }

    Write-Host "Cleanup complete." -ForegroundColor Green
}
