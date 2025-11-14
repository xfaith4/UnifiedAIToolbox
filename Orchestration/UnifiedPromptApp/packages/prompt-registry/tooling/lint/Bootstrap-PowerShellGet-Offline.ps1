#requires -version 5.1
<#
.SYNOPSIS
  Side-loads PackageManagement + PowerShellGet modules without a working provider,
  then bootstraps NuGet, registers PSGallery, and installs PowerShell-Yaml.

.NOTES
  - Safe for Windows PowerShell 5.1 and PowerShell 7+
  - Installs into *user* module paths (no admin needed)
  - Fixes "Unable to find module providers (PowerShellGet)" loop
#>

$ErrorActionPreference = 'Stop'

# --- 0) Harden TLS so HTTPS fetches don't fail on older defaults
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {}

# --- 1) Resolve per-user module paths for both PS 5.1 and PS 7+
$UserPs7Path  = Join-Path $HOME 'Documents\PowerShell\Modules'
$UserPs51Path = Join-Path $HOME 'Documents\WindowsPowerShell\Modules'
$TargetModuleRoots = @($UserPs7Path, $UserPs51Path) | Where-Object { $_ -and (Test-Path (Split-Path $_ -Parent)) }

# Ensure module dirs exist
$null = $TargetModuleRoots | ForEach-Object { New-Item -Type Directory -Path $_ -Force | Out-Null }

# --- 2) Direct package URLs (nupkg = zip)
$packages = @(
    @{ Name = 'PackageManagement'; Version = '1.4.8.1';  Url = 'https://www.powershellgallery.com/api/v2/package/PackageManagement/1.4.8.1' },
    @{ Name = 'PowerShellGet';     Version = '2.2.5.1'; Url = 'https://www.powershellgallery.com/api/v2/package/PowerShellGet/2.2.5.1' }
)

# --- 3) Download and expand each nupkg into *both* user module roots
Add-Type -AssemblyName System.IO.Compression.FileSystem

$Temp = New-Item -ItemType Directory -Path ([IO.Path]::Combine([IO.Path]::GetTempPath(), "PSGetBootstrap_$([guid]::NewGuid())")) -Force
try {
    foreach ($pkg in $packages) {
        $nupkg = Join-Path $Temp "$($pkg.Name).$($pkg.Version).nupkg"
        Write-Host "Downloading $($pkg.Name) $($pkg.Version)..." -ForegroundColor Cyan
        Invoke-WebRequest -UseBasicParsing -Uri $pkg.Url -OutFile $nupkg

        foreach ($root in $TargetModuleRoots) {
            $dest = Join-Path $root $pkg.Name
            $verDir = Join-Path $dest $pkg.Version
            New-Item -ItemType Directory -Path $verDir -Force | Out-Null

            Write-Host "Expanding $($pkg.Name) -> $verDir" -ForegroundColor DarkCyan
            [IO.Compression.ZipFile]::ExtractToDirectory($nupkg, $verDir)

            # Unblock in case Zone.Identifier is set
            Get-ChildItem -Path $verDir -Recurse -Force | ForEach-Object {
                try { Unblock-File -Path $_.FullName -ErrorAction SilentlyContinue } catch {}
            }
        }
    }
}
finally {
    # Best effort cleanup
    try { Remove-Item -Recurse -Force $Temp } catch {}
}

# --- 4) Refresh module discovery for this session
$env:PSModulePath = ($TargetModuleRoots -join ';') + ';' + $env:PSModulePath

# --- 5) Import the side-loaded modules explicitly (prefer our user copies)
#     Import order matters: PackageManagement first, then PowerShellGet
Import-Module PackageManagement -MinimumVersion 1.4.8.1 -Force
Import-Module PowerShellGet     -MinimumVersion 2.2.5.1 -Force

# --- 6) Set execution policy for CurrentUser to avoid prompts on downloaded modules
try {
    Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
} catch {
    Write-Warning "ExecutionPolicy change skipped: $($_.Exception.Message)"
}

# --- 7) Bootstrap NuGet provider (now that PackageManagement is healthy)
if (-not (Get-PackageProvider -ListAvailable -ErrorAction SilentlyContinue | Where-Object Name -eq 'NuGet')) {
    Write-Host "Bootstrapping NuGet provider..." -ForegroundColor Cyan
    Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser -ForceBootstrap
}

# --- 8) Register PSGallery and trust it
if (-not (Get-PSRepository -ErrorAction SilentlyContinue | Where-Object Name -eq 'PSGallery')) {
    Write-Host "Registering PSGallery..." -ForegroundColor Cyan
    Register-PSRepository -Name PSGallery -SourceLocation 'https://www.powershellgallery.com/api/v2' -ScriptSourceLocation 'https://www.powershellgallery.com/api/v2' -InstallationPolicy Trusted
} else {
    Set-PSRepository -Name PSGallery -InstallationPolicy Trusted
}

# --- 9) Final sanity: can we query the Gallery?
$null = Find-Module PowerShellGet -Repository PSGallery -ErrorAction Stop

# --- 10) Install PowerShell-Yaml (used by your validator flow)
Write-Host "Installing PowerShell-Yaml..." -ForegroundColor Cyan
Install-Module PowerShell-Yaml -Repository PSGallery -Scope CurrentUser -Force -AllowClobber

Write-Host "✅ Bootstrap complete. Open a NEW PowerShell window to load fresh paths." -ForegroundColor Green
