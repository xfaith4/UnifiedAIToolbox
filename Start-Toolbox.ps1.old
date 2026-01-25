<#
.SYNOPSIS
    Unified entry point for the Unified AI Toolbox.

.DESCRIPTION
    This script provides an interactive menu to launch different components of the
    Unified AI Toolbox, including the API, Dashboard, Web Portal, and orchestration.

    It consolidates functionality from multiple legacy launch scripts into a single,
    user-friendly interface.

.PARAMETER NonInteractive
    Skip the interactive menu and launch all services.

.EXAMPLE
    .\Start-Toolbox.ps1
    # Shows interactive menu

.EXAMPLE
    .\Start-Toolbox.ps1 -NonInteractive
    # Launches all services without prompting

.NOTES
    This script supersedes: Launch.ps1, Start-WebUI.ps1, Run-Prompt.ps1
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [switch]$NonInteractive,

    [Parameter(Mandatory = $false)]
    [ValidateSet("FullStack", "Api", "Dashboard", "WebPortal", "HtmlPortal", "Orchestration", "Docker")]
    [string]$Mode,

    [Parameter(Mandatory = $false)]
    [string]$Goal,

    [Parameter(Mandatory = $false)]
    [ValidateSet("gpt-4o-mini", "gpt-4", "gpt-3.5-turbo")]
    [string]$Model = "gpt-4o-mini",

    [Parameter(Mandatory = $false)]
    [ValidateSet("Info", "Debug", "Warning", "Error")]
    [string]$LogLevel = "Info",

    [Parameter(Mandatory = $false)]
    [switch]$NoWait
)

$ErrorActionPreference = "Stop"
$Script:ProjectRoot = $PSScriptRoot

# Ensure GitHub token propagates to child processes (and WSL if used).
function Initialize-GitHubToken {
    if ([string]::IsNullOrWhiteSpace($env:GITHUB_TOKEN)) {
        Write-Status "⚠️ GITHUB_TOKEN is not set. GitHub orchestration may fail to clone or create PRs." -Level "Warning"
        return
    }

    $tokenEntry = "GITHUB_TOKEN/up"
    if ([string]::IsNullOrWhiteSpace($env:WSLENV)) {
        $env:WSLENV = $tokenEntry
    }
    elseif ($env:WSLENV -notmatch '(^|:)GITHUB_TOKEN(/[^:]*)?($|:)') {
        $env:WSLENV = "$($env:WSLENV):$tokenEntry"
    }

    Write-Status "✅ GITHUB_TOKEN detected and will be passed to child processes (and WSL when invoked)." -Level "Info"
}

# Color-coded status messages
function Write-Status {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message,
        [Parameter(Mandatory = $false)]
        [ValidateSet("Info", "Success", "Warning", "Error", "Debug")]
        [string]$Level = "Info"
    )

    $timestamp = Get-Date -Format "HH:mm:ss"
    $color = switch ($Level) {
        "Success" { "Green" }
        "Warning" { "Yellow" }
        "Error" { "Red" }
        "Debug" { "Gray" }
        default { "Cyan" }
    }

    Write-Host "[$timestamp] " -NoNewline -ForegroundColor Gray
    Write-Host $Message -ForegroundColor $color
}

function Ensure-OrchestrationBridgePythonDeps {
    $bridgeDir = Join-Path $ProjectRoot "apps\orchestration-bridge"
    $requirements = Join-Path $bridgeDir "requirements.txt"
    if (-not (Test-Path $requirements)) {
        return
    }

    Write-Status "Checking orchestration-bridge Python dependencies..." -Level "Info"
    try {
        python -m pip install --quiet --disable-pip-version-check -r $requirements
        Write-Status "orchestration-bridge Python dependencies are installed" -Level "Success"
    }
    catch {
        Write-Status "Failed to install orchestration-bridge Python dependencies: $_" -Level "Warning"
    }
}

# Check if a service is running on a port
function Test-PortInUse {
    param([int]$Port)

    # Prefer using Get-NetTCPConnection for accurate IPv4/IPv6 coverage
    try {
        $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        if ($connection) {
            return $true
        }
    }
    catch {
        # Ignore if cmdlet unavailable
    }

    # Fallback to binding attempts if NetTCPConnection is not available
    foreach ($address in @([System.Net.IPAddress]::Loopback, [System.Net.IPAddress]::IPv6Loopback)) {
        try {
            $listener = [System.Net.Sockets.TcpListener]::new($address, $Port)
            $listener.Server.SetSocketOption([System.Net.Sockets.SocketOptionLevel]::Socket, [System.Net.Sockets.SocketOptionName]::ReuseAddress, $false)
            $listener.Start()
            $listener.Stop()
        }
        catch [System.Net.Sockets.SocketException] {
            return $true
        }
        catch {
            continue
        }
    }

    return $false
}

function Get-PortOwningProcess {
    param([int]$Port)

    try {
        $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($connection) {
            return Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
        }
    }
    catch {
        # Fallback on older PowerShell versions without Get-NetTCPConnection
        try {
            $pattern = "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)$"
            $match = netstat -ano -p tcp | Select-String -Pattern $pattern | Select-Object -First 1
            if ($match) {
                $processId = [int]$match.Matches[0].Groups[1].Value
                return Get-Process -Id $processId -ErrorAction SilentlyContinue
            }
        }
        catch {
            return $null
        }
    }

    return $null
}

$Script:DefaultApiPort = 8000
$Script:DefaultDashboardPort = 5173
$Script:DefaultWebPortalPort = 3000

$Script:PromptApiPort = $null
$Script:PromptApiBaseUrl = $null
$Script:DashboardPort = $null
$Script:WebPortalPort = $null
$Script:LastWebPortalUrlOpened = $null

function Get-NextAvailablePort {
    param(
        [int]$StartingPort,
        [int]$MaxPort = 65535
    )

    for ($port = $StartingPort; $port -le $MaxPort; $port++) {
        if (-not (Test-PortInUse -Port $port)) {
            return $port
        }
    }

    throw "No available ports could be found between $StartingPort and $MaxPort"
}

function Resolve-ServicePort {
    param(
        [Parameter(Mandatory = $true)][string]$ServiceName,
        [Parameter(Mandatory = $true)][int]$DefaultPort,
        [int]$MaxPort = 0
    )

    if ($MaxPort -le 0 -or $MaxPort -gt 65535) {
        $MaxPort = [math]::Min($DefaultPort + 100, 65535)
    }

    if (-not (Test-PortInUse -Port $DefaultPort)) {
        return $DefaultPort
    }

    $owner = Get-PortOwningProcess -Port $DefaultPort
    $ownerDesc = if ($owner) { "$($owner.ProcessName) (PID $($owner.Id))" } else { "another process" }
    Write-Status "⚠️ $ServiceName default port $DefaultPort is already in use by $ownerDesc. Looking for a free port..." -Level "Warning"

    try {
        $newPort = Get-NextAvailablePort -StartingPort ($DefaultPort + 1) -MaxPort $MaxPort
        Write-Status "ℹ️ $ServiceName will run on port $newPort" -Level "Info"
        return $newPort
    }
    catch {
        throw "Unable to find an available port for $ServiceName around $DefaultPort"
    }
}

function Get-ApiBaseUrl {
    if ($Script:PromptApiBaseUrl) {
        return $Script:PromptApiBaseUrl
    }
    if ($env:NEXT_PUBLIC_API_BASE) {
        return $env:NEXT_PUBLIC_API_BASE
    }

    if ($env:VITE_API_BASE) {
        return $env:VITE_API_BASE
    }

    if ($env:PROMPT_API_BASE) {
        return $env:PROMPT_API_BASE
    }

    if ($env:PROMPT_API_PORT) {
        return "http://localhost:$($env:PROMPT_API_PORT)"
    }

    return "http://localhost:$($Script:DefaultApiPort)"
}

function Get-NextJsDevProcesses {
    try {
        return Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -and $_.CommandLine -match '\bnext\b.*\bdev\b' }
    }
    catch {
        return @()
    }
}

function Stop-ExistingNextJsDevProcesses {
    $processes = Get-NextJsDevProcesses
    if (-not $processes) {
        return $false
    }

    foreach ($proc in $processes) {
        try {
            Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
            Write-Status "🛑 Stopped existing Next.js dev process (PID $($proc.ProcessId))" -Level "Info"
        }
        catch {
            Write-Status "⚠️ Unable to stop Next.js dev process (PID $($proc.ProcessId)): $_" -Level "Warning"
        }
    }

    Start-Sleep -Seconds 1
    return $true
}

function Open-WebPortalBrowser {
    if (-not $Script:WebPortalPort) {
        return
    }

    $url = "http://localhost:$($Script:WebPortalPort)"
    if ($Script:LastWebPortalUrlOpened -eq $url) {
        return
    }

    try {
        Start-Process $url
        Write-Status "🌐 Opened web portal in the default browser at $url" -Level "Success"
        $Script:LastWebPortalUrlOpened = $url
    }
    catch {
        Write-Status "⚠️ Failed to open $url in the browser: $_" -Level "Warning"
    }
}

# Clean up stale Next.js lock files
function Clear-NextLockFile {
    param([string]$ProjectPath)

    $lockFile = Join-Path $ProjectPath ".next\dev\lock"

    if (-not (Test-Path $lockFile)) {
        return $true
    }

    Write-Status "🧹 Clearing stale Next.js dev lock file..." -Level "Info"

    $attempt = 0
    $stoppedExisting = $false

    while ($attempt -lt 2) {
        $attempt++
        try {
            Remove-Item -Path $lockFile -Force -ErrorAction Stop
            Write-Status "🧹 Removed stale Next.js dev lock file" -Level "Info"
            return $true
        }
        catch {
            if (-not $stoppedExisting) {
                $stoppedExisting = Stop-ExistingNextJsDevProcesses
                if ($stoppedExisting) {
                    Start-Sleep -Seconds 1
                    continue
                }
            }
            Write-Status "⚠️  Could not remove lock file: $_" -Level "Warning"
            return $false
        }
    }

    return $true
}

# Display the main menu
function Show-Menu {
    Clear-Host
    Write-Host "`n╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║          🚀 Unified AI Toolbox - Launch Portal            ║" -ForegroundColor Cyan
    Write-Host "╚════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

    # Check service status
    $apiPortForStatus = if ($Script:PromptApiPort) { $Script:PromptApiPort } else { $Script:DefaultApiPort }
    $dashboardPortForStatus = if ($Script:DashboardPort) { $Script:DashboardPort } else { $Script:DefaultDashboardPort }
    $webPortForStatus = if ($Script:WebPortalPort) { $Script:WebPortalPort } else { $Script:DefaultWebPortalPort }

    $apiRunning = Test-PortInUse -Port $apiPortForStatus
    $dashboardRunning = Test-PortInUse -Port $dashboardPortForStatus
    $webRunning = Test-PortInUse -Port $webPortForStatus

    Write-Host "  Current Status:" -ForegroundColor White
    Write-Host "    API ($apiPortForStatus):       " -NoNewline
    Write-Host $(if ($apiRunning) { "🟢 Running" } else { "⚫ Stopped" }) -ForegroundColor $(if ($apiRunning) { "Green" } else { "Gray" })
    Write-Host "    Dashboard ($dashboardPortForStatus): " -NoNewline
    Write-Host $(if ($dashboardRunning) { "🟢 Running" } else { "⚫ Stopped" }) -ForegroundColor $(if ($dashboardRunning) { "Green" } else { "Gray" })
    Write-Host "    Web Portal ($webPortForStatus):" -NoNewline
    Write-Host $(if ($webRunning) { "🟢 Running" } else { "⚫ Stopped" }) -ForegroundColor $(if ($webRunning) { "Green" } else { "Gray" })

    Write-Host "`n  Launch Options:" -ForegroundColor White
    Write-Host "    1. 🌐 Launch Full Stack (API + Dashboard + Web Portal)" -ForegroundColor Yellow
    Write-Host "    2. 🔌 Launch API Only" -ForegroundColor Yellow
    Write-Host "    3. 📊 Launch Dashboard Only" -ForegroundColor Yellow
    Write-Host "    4. 🌍 Launch Web Portal Only" -ForegroundColor Yellow
    Write-Host "    5. 🎯 Open HTML Launch Portal" -ForegroundColor Yellow
    Write-Host "    6. 🤖 Run Orchestration" -ForegroundColor Yellow
    Write-Host "    7. 🐳 Launch with Docker" -ForegroundColor Yellow
    Write-Host "    8. ❌ Exit" -ForegroundColor Red

    Write-Host "`n  Select an option (1-8): " -NoNewline -ForegroundColor White
}

# Launch the FastAPI backend
function Start-API {
    Write-Status "🚀 Starting FastAPI Backend..." -Level "Info"
    Initialize-GitHubToken
    Ensure-OrchestrationBridgePythonDeps

    $locationPushed = $false
    try {
        $apiPort = Resolve-ServicePort -ServiceName "Prompt API" -DefaultPort $Script:DefaultApiPort
        $apiBaseUrl = "http://localhost:$apiPort"
        $Script:PromptApiPort = $apiPort
        $Script:PromptApiBaseUrl = $apiBaseUrl
        $env:PROMPT_API_PORT = $apiPort

        $wslExe = Get-Command wsl.exe -ErrorAction SilentlyContinue
        if ($wslExe) {
            $wslRoot = $null
            try {
                $wslRootOutput = & wsl.exe wslpath -a "$ProjectRoot" 2>$null
                $wslRootOutputText = [string]($wslRootOutput | Out-String)
                $wslRootOutputText = $wslRootOutputText.Trim()
                if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($wslRootOutputText)) {
                    if ($wslRootOutputText -notmatch '^(?i)wslpath:') {
                        $wslRoot = $wslRootOutputText
                    }
                }
            }
            catch {
                $wslRoot = $null
            }

            if ($wslRoot) {
                $wslScript = "$wslRoot/scripts/start-prompt-api.sh"
                wsl.exe --exec bash -lc "chmod +x '$wslScript'" | Out-Null
                $process = Start-Process -NoNewWindow -PassThru -FilePath "wsl.exe" `
                    -ArgumentList "--exec", "bash", "-lc", "PROMPT_API_PORT=$apiPort '$wslScript'"
                Start-Sleep -Seconds 3

                if (Test-PortInUse -Port $apiPort) {
                    Write-Status "✅ API running at http://localhost:$apiPort (WSL)" -Level "Success"
                    Write-Status "   📖 API Docs: http://localhost:$apiPort/docs" -Level "Info"
                    return $process
                }

                Write-Status "⚠️  API may still be starting on http://localhost:$apiPort (WSL)" -Level "Warning"
                return $process
            }

            Write-Status "⚠️  WSL path resolution failed; falling back to Windows launch." -Level "Warning"
        }

        $apiDir = Join-Path $ProjectRoot "apps\UnifiedPromptApp\services\prompt-api"
        if (-not (Test-Path $apiDir)) {
            Write-Status "❌ API directory not found at: $apiDir" -Level "Error"
            return $null
        }

        Push-Location $apiDir
        $locationPushed = $true

        # Create virtual environment if needed
        $venvDir = Join-Path $apiDir ".venv"
        if (-not (Test-Path $venvDir)) {
            Write-Status "Creating Python virtual environment..." -Level "Info"
            python -m venv $venvDir
        }

        # Activate and install dependencies
        $activateScript = Join-Path $venvDir "Scripts\Activate.ps1"
        if (Test-Path $activateScript) {
            & $activateScript
            pip install -q -r requirements.txt
        }

        # Set environment variables
        $env:ORCHESTRATOR_PS1 = "MilestoneController.ps1"
        $env:POF_PS1 = $env:ORCHESTRATOR_PS1

        # Start the server
        $process = Start-Process -NoNewWindow -PassThru -FilePath "python" `
            -ArgumentList "-m", "uvicorn", "app:app", "--reload", "--host", "0.0.0.0", "--port", "$apiPort" `
            -WorkingDirectory $apiDir
        Start-Sleep -Seconds 3

        if (Test-PortInUse -Port $apiPort) {
            Write-Status "✅ API running at http://localhost:$apiPort" -Level "Success"
            Write-Status "   📖 API Docs: http://localhost:$apiPort/docs" -Level "Info"
            return $process
        }
        else {
            Write-Status "⚠️  API may still be starting on http://localhost:$apiPort" -Level "Warning"
            return $process
        }
    }
    catch {
        Write-Status "❌ Error starting API: $_" -Level "Error"
        return $null
    }
    finally {
        if ($locationPushed) {
            Pop-Location
        }
    }
}

# Launch the Vite dashboard
function Start-Dashboard {
    Write-Status "🚀 Starting Vite Dashboard..." -Level "Info"

    $dashboardDir = Join-Path $ProjectRoot "apps\dashboard"
    if (-not (Test-Path $dashboardDir)) {
        Write-Status "❌ Dashboard directory not found at: $dashboardDir" -Level "Error"
        return $null
    }

    try {
        Push-Location $dashboardDir

        $packageJsonPath = Join-Path $dashboardDir "package.json"
        if (-not (Test-Path -Path $packageJsonPath -PathType Leaf)) {
            Write-Status "⚠️ Dashboard is not configured as a Vite/Node app (missing package.json) at: $dashboardDir" -Level "Warning"
            Write-Status "   apps/dashboard currently appears to be Docker-only; skipping Dashboard launch." -Level "Info"
            return $null
        }

        try {
            $pkg = Get-Content -Raw -Path $packageJsonPath | ConvertFrom-Json -ErrorAction Stop
        }
        catch {
            Write-Status "❌ Failed to parse dashboard package.json: $_" -Level "Error"
            return $null
        }

        $scriptNames = @()
        if ($pkg.scripts) {
            $scriptNames = @($pkg.scripts.PSObject.Properties.Name)
        }

        if (-not ($scriptNames -contains "dev")) {
            $available = if ($scriptNames.Count -gt 0) { $scriptNames -join ", " } else { "<none>" }
            Write-Status "❌ Dashboard package.json has no \"dev\" script. Available scripts: $available" -Level "Error"
            Write-Status "   Fix: add a dev script, or update Start-Toolbox.ps1 to use the correct script." -Level "Info"
            return $null
        }

        # Install dependencies if needed
        if (-not (Test-Path "node_modules")) {
            Write-Status "Installing dependencies..." -Level "Info"
            npm install --silent
        }

        # Set environment variables
        $dashboardPort = Resolve-ServicePort -ServiceName "Vite Dashboard" -DefaultPort $Script:DefaultDashboardPort
        $Script:DashboardPort = $dashboardPort
        $apiBaseUrl = Get-ApiBaseUrl

        $env:VITE_PORT = $dashboardPort
        $env:VITE_API_URL = $apiBaseUrl
        $env:VITE_API_BASE = $apiBaseUrl

        # Start the dev server
        $comspec = $env:ComSpec
        $process = Start-Process -FilePath $comspec `
            -ArgumentList "/c", "npm run dev -- -p $dashboardPort" `
            -WorkingDirectory $dashboardDir -NoNewWindow -PassThru

        Start-Sleep -Seconds 3
        if ($process.HasExited) {
            Write-Status "❌ Dashboard process exited immediately (ExitCode: $($process.ExitCode)). See npm output above." -Level "Error"
            return $null
        }

        if (Test-PortInUse -Port $dashboardPort) {
            Write-Status "✅ Dashboard running at http://localhost:$dashboardPort" -Level "Success"
        }
        else {
            Write-Status "⚠️ Dashboard process started, but port $dashboardPort is not listening yet. Check terminal output for errors." -Level "Warning"
        }

        return $process
    }
    catch {
        Write-Status "❌ Error starting dashboard: $_" -Level "Error"
        return $null
    }
    finally {
        Pop-Location
    }
}

# Launch the Next.js web portal
function Start-WebPortal {
    Write-Status "🚀 Starting Next.js Web Portal..." -Level "Info"

    $webDir = Join-Path $ProjectRoot "apps\unifiedtoolbox.webapp"
    if (-not (Test-Path $webDir)) {
        Write-Status "❌ Web portal directory not found at: $webDir" -Level "Error"
        return $null
    }

    try {
        Push-Location $webDir

        # Ensure no stray Next.js dev process is holding the port
        $stoppedNextJs = Stop-ExistingNextJsDevProcesses
        if ($stoppedNextJs) {
            Start-Sleep -Seconds 1
        }

        # Clean up any stale lock files
        Clear-NextLockFile -ProjectPath $webDir | Out-Null

        # Install dependencies if needed
        if (-not (Test-Path "node_modules")) {
            Write-Status "Installing dependencies..." -Level "Info"
            npm install --silent
        }

        # Set environment variables
        $webPort = Resolve-ServicePort -ServiceName "Next.js Web Portal" -DefaultPort $Script:DefaultWebPortalPort
        $Script:WebPortalPort = $webPort
        $apiBaseUrl = Get-ApiBaseUrl

        $env:NEXT_PUBLIC_API_BASE = $apiBaseUrl
        $env:PORT = $webPort

        # Start the dev server
        $comspec = $env:ComSpec
        $process = Start-Process -FilePath $comspec `
            -ArgumentList "/c", "npm run dev -- --hostname 0.0.0.0 --port $webPort" `
            -WorkingDirectory $webDir -NoNewWindow -PassThru

        Start-Sleep -Seconds 3
        Write-Status "✅ Web Portal starting at http://localhost:$webPort" -Level "Success"
        Open-WebPortalBrowser

        return $process
    }
    catch {
        Write-Status "❌ Error starting web portal: $_" -Level "Error"
        return $null
    }
    finally {
        Pop-Location
    }
}

# Open the HTML launch portal
function Open-HTMLPortal {
    $portalFile = Join-Path $ProjectRoot "launch-portal.html"
    if (Test-Path $portalFile) {
        Write-Status "🎯 Opening HTML Launch Portal..." -Level "Info"
        Start-Process $portalFile
        Write-Status "✅ Portal opened in default browser" -Level "Success"
    }
    else {
        Write-Status "❌ HTML portal not found at: $portalFile" -Level "Error"
    }
}

# Run orchestration
function Start-Orchestration {
    Write-Status "🤖 Starting Orchestration..." -Level "Info"
    Initialize-GitHubToken
    Ensure-OrchestrationBridgePythonDeps

    $orchestrationScript = Join-Path $ProjectRoot "Orchestration\MilestoneController.ps1"
    if (-not (Test-Path $orchestrationScript)) {
        Write-Status "❌ Orchestration script not found at: $orchestrationScript" -Level "Error"
        return
    }

    $effectiveGoal = $Goal
    if ([string]::IsNullOrWhiteSpace($effectiveGoal)) {
        $effectiveGoal = Read-Host "Enter orchestration goal (or press Enter for default)"
        if ([string]::IsNullOrWhiteSpace($effectiveGoal)) {
            $effectiveGoal = "Run a complete analysis of the current project state"
        }
    }

    $outputDir = Join-Path $ProjectRoot "apps\orchestration-bridge\runs"
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

    $arguments = @(
        "-NoLogo"
        "-NoProfile"
        "-ExecutionPolicy", "Bypass"
        "-File", "`"$orchestrationScript`""
        "-Goal", "`"$effectiveGoal`""
        "-Model", $Model
        "-OutputDir", "`"$outputDir`""
        "-LogLevel", $LogLevel
    )

    Start-Process -FilePath "pwsh.exe" -ArgumentList $arguments -Wait -NoNewWindow
    Write-Status "✅ Orchestration completed" -Level "Success"
}

# Launch with Docker
function Start-Docker {
    Write-Status "🐳 Launching with Docker Compose..." -Level "Info"

    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Status "❌ Docker is not installed or not in PATH" -Level "Error"
        return
    }

    try {
        docker compose up -d
        Write-Status "✅ Docker services started" -Level "Success"
        Write-Status "   Use 'docker compose logs -f' to view logs" -Level "Info"
        Write-Status "   Use 'docker compose down' to stop services" -Level "Info"
    }
    catch {
        Write-Status "❌ Error starting Docker: $_" -Level "Error"
    }
}

# Main execution
try {
    $runningProcesses = @()

    if ($Mode) {
        Write-Host "`n=== 🚀 Unified AI Toolbox - $Mode ===`n" -ForegroundColor Cyan

        switch ($Mode) {
            "FullStack" {
                $apiProcess = Start-API
                if ($apiProcess) { $runningProcesses += $apiProcess }
                $dashboardProcess = Start-Dashboard
                if ($dashboardProcess) { $runningProcesses += $dashboardProcess }
                $webProcess = Start-WebPortal
                if ($webProcess) { $runningProcesses += $webProcess }
            }
            "Api" {
                $apiProcess = Start-API
                if ($apiProcess) { $runningProcesses += $apiProcess }
            }
            "Dashboard" {
                $dashboardProcess = Start-Dashboard
                if ($dashboardProcess) { $runningProcesses += $dashboardProcess }
            }
            "WebPortal" {
                $webProcess = Start-WebPortal
                if ($webProcess) { $runningProcesses += $webProcess }
            }
            "HtmlPortal" {
                Open-HTMLPortal
            }
            "Orchestration" {
                Start-Orchestration
            }
            "Docker" {
                Start-Docker
            }
        }

        if (-not $NoWait) {
            Write-Host "Press Ctrl+C to stop..." -ForegroundColor Yellow
            while ($true) {
                Start-Sleep -Seconds 60
            }
        }

        exit 0
    }

    if ($NonInteractive) {
        Write-Host "`n=== 🚀 Unified AI Toolbox - Non-Interactive Launch ===`n" -ForegroundColor Cyan
        $apiProcess = Start-API
        $dashboardProcess = Start-Dashboard
        $webProcess = Start-WebPortal
        if ($apiProcess) { $runningProcesses += $apiProcess }
        if ($dashboardProcess) { $runningProcesses += $dashboardProcess }
        if ($webProcess) { $runningProcesses += $webProcess }

        Write-Host "`n=== ✅ All Services Started ===`n" -ForegroundColor Green
        Write-Host "Press Ctrl+C to stop all services..." -ForegroundColor Yellow

        while ($true) {
            Start-Sleep -Seconds 60
        }
    }
    else {
        while ($true) {
            Show-Menu
            $choice = Read-Host

            switch ($choice) {
                "1" {
                    Write-Host ""
                    $apiProcess = Start-API
                    if ($apiProcess) { $runningProcesses += $apiProcess }

                    $dashboardProcess = Start-Dashboard
                    if ($dashboardProcess) { $runningProcesses += $dashboardProcess }

                    $webProcess = Start-WebPortal
                    if ($webProcess) { $runningProcesses += $webProcess }

                    Write-Host "`n✅ All services started! Press any key to return to menu..." -ForegroundColor Green
                    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
                }
                "2" {
                    Write-Host ""
                    $apiProcess = Start-API
                    if ($apiProcess) { $runningProcesses += $apiProcess }
                    Write-Host "`nPress any key to return to menu..." -ForegroundColor Gray
                    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
                }
                "3" {
                    Write-Host ""
                    $dashboardProcess = Start-Dashboard
                    if ($dashboardProcess) { $runningProcesses += $dashboardProcess }
                    Write-Host "`nPress any key to return to menu..." -ForegroundColor Gray
                    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
                }
                "4" {
                    Write-Host ""
                    $webProcess = Start-WebPortal
                    if ($webProcess) { $runningProcesses += $webProcess }
                    Write-Host "`nPress any key to return to menu..." -ForegroundColor Gray
                    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
                }
                "5" {
                    Write-Host ""
                    Open-HTMLPortal
                    Write-Host "`nPress any key to return to menu..." -ForegroundColor Gray
                    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
                }
                "6" {
                    Write-Host ""
                    Start-Orchestration
                    Write-Host "`nPress any key to return to menu..." -ForegroundColor Gray
                    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
                }
                "7" {
                    Write-Host ""
                    Start-Docker
                    Write-Host "`nPress any key to return to menu..." -ForegroundColor Gray
                    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
                }
                "8" {
                    Write-Host "`n👋 Exiting... Stopping any running services..." -ForegroundColor Yellow
                    foreach ($proc in $runningProcesses) {
                        if ($proc -and -not $proc.HasExited) {
                            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                        }
                    }
                    Write-Host "✅ Goodbye!`n" -ForegroundColor Green
                    exit 0
                }
                default {
                    Write-Host "`n❌ Invalid choice. Please select 1-8." -ForegroundColor Red
                    Start-Sleep -Seconds 2
                }
            }
        }
    }
}
catch {
    Write-Status "❌ Error: $_" -Level "Error"
    Write-Status $_.ScriptStackTrace -Level "Error"
    exit 1
}
finally {
    # Cleanup on Ctrl+C
    if ($runningProcesses -and $runningProcesses.Count -gt 0) {
        Write-Host "`n🛑 Stopping services..." -ForegroundColor Yellow
        foreach ($proc in $runningProcesses) {
            if ($proc -and -not $proc.HasExited) {
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            }
        }
        Write-Status "All services stopped." -Level "Success"
    }
}
