#Requires -Version 5.1
<#
.SYNOPSIS
    Launches the React/Vite Dashboard with advanced port and process management.
.DESCRIPTION
    This script starts the dashboard web interface with the following features:
    - Automatically finds an available port if the default is in use
    - Can terminate processes using the target port (with confirmation)
    - Validates all dependencies before starting
    - Provides detailed logging and error handling
    - Supports custom port ranges and timeouts
.NOTES
    Component: apps/dashboard (React + Vite + TypeScript)
    Default Port: 5173
    Prerequisites: Node.js 18+
#>

[CmdletBinding()]
param (
    [Parameter(HelpMessage="Starting port number")]
    [int]$Port = 8000,

    [Parameter(HelpMessage="Maximum port number to try")]
    [int]$MaxPort = 8100,

    [Parameter(HelpMessage="Skip the build step")]
    [switch]$SkipBuild = $false,

    [Parameter(HelpMessage="Automatically terminate processes using the port")]
    [switch]$Force
)

# Set verbosity
$VerbosePreference = if ($Verbose) { 'Continue' } else { 'SilentlyContinue' }

# Initialize
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$dashboardDir = Join-Path $projectRoot 'apps\dashboard'
$originalPort = $Port

# Check if required commands are available
function Test-CommandExists {
    param($command)
    return $null -ne (Get-Command $command -ErrorAction SilentlyContinue)
}

# Function to test if a port is available
function Test-PortAvailable {
    param([int]$Port)
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        $listener.Stop()
        return $true
    } catch {
        return $false
    }
}

# Function to get process using a port
function Get-ProcessUsingPort {
    param([int]$Port)
    try {
        return Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
               Select-Object -ExpandProperty OwningProcess -First 1
    } catch {
        return $null
    }
}

# Ensure required modules are available
$requiredModules = @('NetTCPIP')
foreach ($module in $requiredModules) {
    if (-not (Get-Module -ListAvailable -Name $module)) {
        Write-Warning "Module $module is required. Attempting to install..."
        try {
            Install-Module -Name $module -Force -Scope CurrentUser -AllowClobber
            Import-Module $module -Force
        } catch {
            Write-Error "Failed to install/import required module $module. Error: $_"
            exit 1
        }
    }
}

# Check Node.js installation and version
try {
    $nodeVersion = (node --version) -replace 'v', '' -as [version]
    if (-not $nodeVersion) {
        throw "Node.js is not installed or not in PATH"
    }

    $requiredVersion = [version]'18.0.0'
    if ($nodeVersion -lt $requiredVersion) {
        throw "Node.js 18.0.0 or later is required. Found version $nodeVersion"
    }

    Write-Verbose "✅ Node.js version $nodeVersion detected"
} catch {
    Write-Error "❌ Node.js check failed: $_"
    Write-Host "Please install Node.js 18 or later from https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Function to check if a port is available
function Test-PortInUse {
    param([int]$Port)
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        $listener.Stop()
        $listener = $null
        return $false
    } catch {
        return $true
    }
}

# Port management
Write-Host "🔍 Checking port availability..." -ForegroundColor Cyan

# Check if the requested port is available
$portAvailable = Test-PortAvailable -Port $Port
$processId = $null

if (-not $portAvailable) {
    $processId = Get-ProcessUsingPort -Port $Port
    $processInfo = if ($processId) { (Get-Process -Id $processId -ErrorAction SilentlyContinue) } else { $null }

    Write-Warning "Port $Port is currently in use"
    if ($processInfo) {
        Write-Host "  Process: $($processInfo.ProcessName) (PID: $processId)" -ForegroundColor Yellow
        Write-Host "  Path: $($processInfo.Path)" -ForegroundColor Yellow
    }

    if ($Force) {
        Write-Host "🚫 Force flag is set. Attempting to terminate process..." -ForegroundColor Red
        try {
            Stop-Process -Id $processId -Force -ErrorAction Stop
            Start-Sleep -Seconds 1  # Give it a moment to release the port
            $portAvailable = Test-PortAvailable -Port $Port
            if ($portAvailable) {
                Write-Host "✅ Successfully terminated process" -ForegroundColor Green
            }
        } catch {
            Write-Warning "Failed to terminate process: $_"
        }
    } else {
        # Try to find an alternative port
        $originalPort = $Port
        $Port++

        while ($Port -le $MaxPort) {
            $portAvailable = Test-PortAvailable -Port $Port
            if ($portAvailable) {
                Write-Host "🔀 Port $originalPort is in use, using alternative port $Port" -ForegroundColor Yellow
                break
            }
            $Port++
        }

        if (-not $portAvailable) {
            Write-Error "❌ Could not find an available port between $originalPort and $MaxPort"
            Write-Host "Try one of these solutions:" -ForegroundColor Yellow
            Write-Host "1. Close the application using port $originalPort"
            Write-Host "2. Use a different port with -Port parameter"
            Write-Host "3. Use -Force to terminate the process using the port"
            exit 1
        }
    }
}

Write-Host "✅ Port $Port is available" -ForegroundColor Green

# Start the web server
Push-Location $dashboardDir

try {
    # Install dependencies if needed
    if (-not (Test-Path 'node_modules')) {
        Write-Host "📦 Installing dependencies..." -ForegroundColor Cyan
        npm install --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to install dependencies"
        }
    }

    # Build the project if needed
    if (-not $SkipBuild) {
        Write-Host "🔨 Building project..." -ForegroundColor Cyan
        npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "Build failed"
        }
    }

    # Set the port and start the server (Vite uses VITE_PORT)
    $env:VITE_PORT = $Port
    $env:PORT = $Port
    $url = "http://localhost:$Port"

    Write-Host "\n" + ("*" * 60) -ForegroundColor Green
    Write-Host "🚀 Starting Dashboard (React/Vite)" -ForegroundColor Green
    Write-Host "🌐 URL: $url" -ForegroundColor Cyan
    Write-Host "📁 Directory: $dashboardDir" -ForegroundColor Cyan
    Write-Host ("*" * 60) -ForegroundColor Green
    Write-Host "🛑 Press Ctrl+C to stop the server\n" -ForegroundColor Yellow

    # Try to open the browser
    try {
        Start-Process $url
    } catch {
        Write-Warning "Could not open browser automatically. Please visit $url"
    }

    # Start the dev server
    npm run dev

} catch {
    Write-Error "❌ Failed to start the web server: $_"
    Write-Host "Troubleshooting tips:" -ForegroundColor Yellow
    Write-Host "1. Make sure no other server is running on port $Port"
    Write-Host "2. Try running with -Verbose for more details"
    Write-Host "3. Check the Node.js and npm versions"
    exit 1
} finally {
    Pop-Location
}
