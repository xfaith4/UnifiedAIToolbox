#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

# --- Diagnostics: see what this session knows
Write-Host "PS Version: $($PSVersionTable.PSVersion)" -ForegroundColor Cyan
Write-Host "Edition: $($PSVersionTable.PSEdition)" -ForegroundColor Cyan
Write-Host "`nUser module roots in PSModulePath:" -ForegroundColor Cyan
$env:PSModulePath -split ';' | Where-Object { $_ -match 'Documents\\(WindowsPowerShell|PowerShell)\\Modules' } | ForEach-Object { "  - $_" }

Write-Host "`nInstalled PowerShellGet/PackageManagement modules visible on disk:" -ForegroundColor Cyan
Get-Module -ListAvailable PowerShellGet,PackageManagement | Select-Object Name,Version,ModuleBase | Format-Table -AutoSize

Write-Host "`nAvailable package providers (should list NuGet):" -ForegroundColor Cyan
Get-PackageProvider -ListAvailable | Select-Object Name,Version | Format-Table -AutoSize

Write-Host "`nRegistered repositories (should list PSGallery):" -ForegroundColor Cyan
Get-PSRepository | Format-Table -AutoSize

# --- If NuGet provider is missing, bootstrap it (non-interactive)
try {
    if (-not (Get-PackageProvider -ListAvailable -ErrorAction SilentlyContinue | Where-Object Name -eq 'NuGet')) {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Write-Host "`nBootstrapping NuGet provider..." -ForegroundColor Yellow
        Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser -ForceBootstrap
    }
} catch {
    Write-Warning "NuGet provider bootstrap failed at user scope: $($_.Exception.Message). Retrying without -Scope..."
    Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -ForceBootstrap
}

# --- Ensure PowerShellGet cmdlets are loaded from a known-good version (v2 is safest baseline)
if (-not (Get-Module PowerShellGet -ListAvailable)) {
    Write-Host "`nPowerShellGet not found on disk. Side-loading v2.2.5.1..." -ForegroundColor Yellow
    $temp = Join-Path $env:TEMP ("psget_" + [Guid]::NewGuid())
    New-Item $temp -ItemType Directory | Out-Null
    $urlPsGet = 'https://www.powershellgallery.com/api/v2/package/PowerShellGet/2.2.5.1'
    $urlPkgMg = 'https://www.powershellgallery.com/api/v2/package/PackageManagement/1.4.8.1'
    Invoke-WebRequest -UseBasicParsing -Uri $urlPsGet -OutFile (Join-Path $temp 'PowerShellGet.2.2.5.1.nupkg')
    Invoke-WebRequest -UseBasicParsing -Uri $urlPkgMg -OutFile (Join-Path $temp 'PackageManagement.1.4.8.1.nupkg')
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $destUser1 = Join-Path $HOME 'Documents\PowerShell\Modules'
    $destUser2 = Join-Path $HOME 'Documents\WindowsPowerShell\Modules'
    foreach ($pair in @(
        @{Name='PowerShellGet'; Ver='2.2.5.1'; File='PowerShellGet.2.2.5.1.nupkg'},
        @{Name='PackageManagement'; Ver='1.4.8.1'; File='PackageManagement.1.4.8.1.nupkg'}
    )) {
        foreach ($root in @($destUser1,$destUser2)) {
            if ($root) {
                $verDir = Join-Path (Join-Path $root $pair.Name) $pair.Ver
                New-Item -ItemType Directory -Path $verDir -Force | Out-Null
                [IO.Compression.ZipFile]::ExtractToDirectory((Join-Path $temp $pair.File), $verDir)
                Get-ChildItem $verDir -Recurse -Force | Unblock-File -ErrorAction SilentlyContinue
            }
        }
    }
    Remove-Item $temp -Recurse -Force
}

# --- Import in correct order: PackageManagement -> PowerShellGet
Import-Module PackageManagement -MinimumVersion 1.4.8.1 -Force
Import-Module PowerShellGet     -MinimumVersion 2.2.5.1 -Force

# --- Register and trust PSGallery if missing
if (-not (Get-PSRepository -ErrorAction SilentlyContinue | Where-Object Name -eq 'PSGallery')) {
    Write-Host "`nRegistering PSGallery..." -ForegroundColor Yellow
    Register-PSRepository -Name PSGallery `
        -SourceLocation 'https://www.powershellgallery.com/api/v2' `
        -ScriptSourceLocation 'https://www.powershellgallery.com/api/v2' `
        -InstallationPolicy Trusted
} else {
    Set-PSRepository -Name PSGallery -InstallationPolicy Trusted
}

Write-Host "`n✅ Providers repaired. You can now use Find-Module / Install-Module." -ForegroundColor Green

# --- Optional smoke test (no install): should succeed now
Write-Host "`nSmoke test: Find-Module PowerShellGet/PowerShell-Yaml..." -ForegroundColor Cyan
Find-Module PowerShellGet,PowerShell-Yaml -Repository PSGallery | Select-Object Name,Version | Format-Table -AutoSize
