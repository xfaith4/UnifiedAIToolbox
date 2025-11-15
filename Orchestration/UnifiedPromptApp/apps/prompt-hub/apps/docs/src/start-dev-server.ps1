# Development Server with Port Availability Checking
# PowerShell script to check for available ports and start a local development server

param(
    [int[]]$PreferredPorts = @(3000, 8000, 8080, 3001, 5000, 8001, 8888, 9000),
    [string]$Directory = $PWD.Path,
    [switch]$OpenBrowser
)

function Test-PortAvailability {
    param([int]$Port)

    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
        $listener.Start()
        $listener.Stop()
        return $true
    }
    catch {
        return $false
    }
}

function Find-AvailablePort {
    param([int[]]$Ports)

    foreach ($port in $Ports) {
        if (Test-PortAvailability -Port $port) {
            return $port
        }
        Write-Host "Port $port is already in use..." -ForegroundColor Yellow
    }
    return $null
}

function Start-DevServer {
    Write-Host "🔍 Checking for available ports..." -ForegroundColor Cyan

    $availablePort = Find-AvailablePort -Ports $PreferredPorts

    if ($null -eq $availablePort) {
        Write-Host "❌ No available ports found from the preferred list: $($PreferredPorts -join ', ')" -ForegroundColor Red
        Write-Host "💡 Try stopping other development servers or specify custom ports with -PreferredPorts parameter." -ForegroundColor Yellow
        exit 1
    }

    Write-Host "✅ Found available port: $availablePort" -ForegroundColor Green
    Write-Host "🚀 Starting development server..." -ForegroundColor Cyan

    # Change to the specified directory
    Push-Location $Directory

    try {
        Write-Host "📁 Serving files from: $Directory" -ForegroundColor Gray
        Write-Host "🌐 Local URL: http://localhost:$availablePort" -ForegroundColor Green
        Write-Host "🌐 Network URL: http://127.0.0.1:$availablePort" -ForegroundColor Green
        Write-Host ""
        Write-Host "📝 Available endpoints:" -ForegroundColor Cyan
        Write-Host "   • Main site:      http://localhost:$availablePort" -ForegroundColor Gray
        Write-Host "   • Prompts data:   http://localhost:$availablePort/prompts.json" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
        Write-Host ""

        # Open browser if requested
        if ($OpenBrowser) {
            Start-Process "http://localhost:$availablePort"
        }

        # Start the Python HTTP server
        python -m http.server $availablePort
    }
    catch {
        Write-Host "❌ Failed to start server: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
    finally {
        Pop-Location
    }
}

# Check if Python is available
try {
    $pythonVersion = python --version 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Python not found"
    }
    Write-Host "✅ Python detected: $pythonVersion" -ForegroundColor Green
}
catch {
    Write-Host "❌ Python is required but not found in PATH" -ForegroundColor Red
    Write-Host "💡 Please install Python or ensure it's in your PATH" -ForegroundColor Yellow
    exit 1
}

# Check if we're in the correct directory
$expectedFiles = @("index.html", "prompts.json", "js", "styles")
$missingFiles = $expectedFiles | Where-Object { -not (Test-Path (Join-Path $Directory $_)) }

if ($missingFiles.Count -gt 0) {
    Write-Host "⚠️  Warning: Some expected files/folders not found in $Directory" -ForegroundColor Yellow
    Write-Host "   Missing: $($missingFiles -join ', ')" -ForegroundColor Yellow
    Write-Host "   Make sure you're running this from the correct directory (apps/docs/src)" -ForegroundColor Yellow
    Write-Host ""
}

# Start the server
Start-DevServer
