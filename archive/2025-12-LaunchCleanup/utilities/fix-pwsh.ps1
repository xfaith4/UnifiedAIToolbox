<#
.SYNOPSIS
    Fixes PowerShell 7 installation issues by installing the standalone version.
#>

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "This script requires administrator privileges. Please run as administrator." -ForegroundColor Red
    Start-Process "powershell" "-NoProfile -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`"" -Verb RunAs
    exit
}

Write-Host "=== PowerShell 7 Installation Fix ===" -ForegroundColor Cyan

# 1. Uninstall Windows Store version if it exists
Write-Host "`n1. Checking for Windows Store PowerShell 7..." -ForegroundColor Yellow
$storeApp = Get-AppxPackage -Name "Microsoft.PowerShell" | Where-Object { $_.Name -eq "Microsoft.PowerShell" }
if ($storeApp) {
    Write-Host "   Found Windows Store PowerShell version $($storeApp.Version)" -ForegroundColor Yellow
    $choice = Read-Host "   Uninstall Windows Store PowerShell 7? (Y/N)"
    if ($choice -eq 'Y' -or $choice -eq 'y') {
        try {
            Write-Host "   Uninstalling Windows Store PowerShell..." -ForegroundColor Yellow
            Get-AppxPackage -Name "Microsoft.PowerShell" | Remove-AppxPackage -ErrorAction Stop
            Write-Host "   Successfully uninstalled Windows Store PowerShell" -ForegroundColor Green
        } catch {
            Write-Host "   Failed to uninstall Windows Store PowerShell: $_" -ForegroundColor Red
        }
    }
} else {
    Write-Host "   Windows Store PowerShell not found" -ForegroundColor Green
}

# 2. Install standalone PowerShell 7 using winget
Write-Host "`n2. Installing standalone PowerShell 7..." -ForegroundColor Yellow
try {
    # Check if winget is available
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host "   Installing PowerShell 7 using winget..." -ForegroundColor Cyan
        winget install --id Microsoft.PowerShell --scope machine --force
    } else {
        Write-Host "   winget not found. Downloading PowerShell 7 installer..." -ForegroundColor Yellow
        $url = "https://github.com/PowerShell/PowerShell/releases/download/v7.4.2/PowerShell-7.4.2-win-x64.msi"
        $installer = "$env:TEMP\PowerShell-7.4.2-win-x64.msi"
        
        Write-Host "   Downloading installer from $url ..." -ForegroundColor Cyan
        Invoke-WebRequest -Uri $url -OutFile $installer
        
        Write-Host "   Running installer..." -ForegroundColor Cyan
        Start-Process -Wait -FilePath "msiexec.exe" -ArgumentList "/i `"$installer`" /qn ADD_EXPLORER_CONTEXT_MENU_OPENPOWERSHELL=1 ADD_FILE_CONTEXT_MENU_RUNPOWERSHELL=1 ENABLE_PSREMOTING=1 REGISTER_MANIFEST=1"
        
        # Add to PATH
        $currentPath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
        $pwshPath = 'C:\Program Files\PowerShell\7'
        if ($currentPath -notlike "*$pwshPath*") {
            [Environment]::SetEnvironmentVariable('Path', "$currentPath;$pwshPath", 'Machine')
            $env:Path += ";$pwshPath"
        }
    }
    
    # Verify installation
    $pwshPath = "C:\Program Files\PowerShell\7\pwsh.exe"
    if (Test-Path $pwshPath) {
        $version = & $pwshPath -Command '$PSVersionTable.PSVersion.ToString()'
        Write-Host "   Successfully installed PowerShell $version" -ForegroundColor Green
    } else {
        throw "PowerShell installation failed"
    }
} catch {
    Write-Host "   Failed to install PowerShell 7: $_" -ForegroundColor Red
    Write-Host "   Please download and install it manually from:" -ForegroundColor Yellow
    Write-Host "   https://aka.ms/powershell-release" -ForegroundColor Cyan
    exit 1
}

# 3. Set up environment variables
Write-Host "`n3. Setting up environment..." -ForegroundColor Yellow
try {
    # Add PowerShell to PATH if not already there
    $pwshDir = "C:\Program Files\PowerShell\7"
    $currentPath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    if ($currentPath -notlike "*$pwshDir*") {
        [Environment]::SetEnvironmentVariable('Path', "$currentPath;$pwshDir", 'Machine')
        $env:Path += ";$pwshDir"
        Write-Host "   Added PowerShell to system PATH" -ForegroundColor Green
    } else {
        Write-Host "   PowerShell is already in PATH" -ForegroundColor Green
    }
    
    # Set PSModulePath if needed
    $modulePath = "C:\Program Files\PowerShell\7\Modules"
    $currentModulePath = [Environment]::GetEnvironmentVariable('PSModulePath', 'Machine')
    if ($currentModulePath -notlike "*$modulePath*") {
        [Environment]::SetEnvironmentVariable('PSModulePath', "$currentModulePath;$modulePath", 'Machine')
        $env:PSModulePath += ";$modulePath"
        Write-Host "   Updated PSModulePath" -ForegroundColor Green
    }
} catch {
    Write-Host "   Warning: Failed to set up environment: $_" -ForegroundColor Yellow
}

Write-Host "`n=== Setup Complete ===" -ForegroundColor Green
Write-Host "Please restart any open terminal windows for changes to take effect." -ForegroundColor Cyan
Write-Host "You can then run the launch script again." -ForegroundColor Cyan

# Check if we should restart the launch process
$choice = Read-Host "`nLaunch the application now? (Y/N)"
if ($choice -eq 'Y' -or $choice -eq 'y') {
    & "$PSScriptRoot\Launch.ps1"
}