#Requires -Version 5.1
<#
.SYNOPSIS
    Starts the React/Vite dashboard (apps/dashboard).
.DESCRIPTION
    Convenience launcher for the dashboard with simple port management.
.PARAMETER Port
    Preferred port for the dashboard (default: 5173).
.PARAMETER MaxPort
    Highest port to probe if the preferred port is in use.
.PARAMETER Force
    If set, attempts to stop the process currently listening on the requested port.
.EXAMPLE
    .\Start-WebUI.ps1
.EXAMPLE
    .\Start-WebUI.ps1 -Port 5173 -Force
#>

[CmdletBinding()]
param (
    [int]$Port = 5173,
    [int]$MaxPort = 5273,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
$dashboardDir = Join-Path $repoRoot 'apps\dashboard'

function Test-PortInUse {
    param([int]$Port)
    try {
        $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
        return [bool]$connection
    } catch {
        return $false
    }
}

function Get-PortOwningProcess {
    param([int]$Port)
    try {
        $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($connection) {
            return Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
        }
    } catch {
        return $null
    }
    return $null
}

function Get-NextAvailablePort {
    param([int]$StartingPort, [int]$MaxPort)
    for ($candidate = $StartingPort; $candidate -le $MaxPort; $candidate++) {
        if (-not (Test-PortInUse -Port $candidate)) {
            return $candidate
        }
    }
    throw "No available ports found between $StartingPort and $MaxPort"
}

if (-not (Test-Path $dashboardDir)) {
    throw "Dashboard directory not found at: $dashboardDir"
}

if (Test-PortInUse -Port $Port) {
    $owner = Get-PortOwningProcess -Port $Port
    if ($Force -and $owner) {
        Write-Host "Stopping process $($owner.ProcessName) (PID $($owner.Id)) on port $Port..." -ForegroundColor Yellow
        Stop-Process -Id $owner.Id -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }

    if (Test-PortInUse -Port $Port) {
        $newPort = Get-NextAvailablePort -StartingPort ($Port + 1) -MaxPort $MaxPort
        Write-Host "Port $Port is in use; using $newPort instead." -ForegroundColor Yellow
        $Port = $newPort
    }
}

Push-Location $dashboardDir
try {
    if (-not (Test-Path 'node_modules')) {
        npm install --no-audit --no-fund
    }

    $apiBase = if ($env:VITE_API_BASE) { $env:VITE_API_BASE } else { 'http://localhost:8000' }
    $env:VITE_API_BASE = $apiBase
    $env:VITE_API_URL = $apiBase
    $env:VITE_PORT = $Port

    $url = "http://localhost:$Port"
    Write-Host "Starting dashboard at $url (API: $apiBase)" -ForegroundColor Green
    try { Start-Process $url } catch { }

    npm run dev -- --host 0.0.0.0 --port $Port
}
finally {
    Pop-Location
}

