#requires -version 5.1
<#
.SYNOPSIS
  Repairs PowerShellGet/PackageManagement bootstrap and installs PowerShell-Yaml.
.NOTES
  - Works in Windows PowerShell 5.1 and PowerShell 7+
  - Runs non-interactively (no prompts)
#>

$ErrorActionPreference = 'Stop'

# --- 1) Ensure TLS 1.2 so PSGallery bootstrap doesn't fail on old TLS defaults
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# --- 2) Relax execution policy for CurrentUser (safe default for module installs)
# Avoids the "Run only scripts that you trust" prompts for downloaded modules
Try {
    Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
} Catch {
    Write-Warning "Could not set execution policy for CurrentUser: $($_.Exception.Message)"
}

# --- 3) Unblock previously downloaded (Zone.Identifier) module files if present
# (No-op if files don't exist or you lack rights.)
$pathsToUnblock = @(
    "$env:ProgramFiles\PowerShell\7\Modules\PackageManagement",
    "$env:ProgramFiles\WindowsPowerShell\Modules\PackageManagement",
    "$env:ProgramFiles\PowerShell\7\Modules\PowerShellGet",
    "$env:ProgramFiles\WindowsPowerShell\Modules\PowerShellGet"
) | Where-Object { Test-Path $_ }
foreach ($p in $pathsToUnblock) {
    Get-ChildItem -Path $p -Recurse -Force -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue
}

# --- 4) Make sure PSGallery is registered and trusted
if (-not (Get-PSRepository -ErrorAction SilentlyContinue | Where-Object Name -eq 'PSGallery')) {
    Register-PSRepository -Name PSGallery -SourceLocation 'https://www.powershellgallery.com/api/v2' -InstallationPolicy Trusted
} else {
    Set-PSRepository -Name PSGallery -InstallationPolicy Trusted
}

# --- 5) Install/repair NuGet package provider (required by PowerShellGet)
# Use -ForceBootstrap to suppress prompts; -Scope CurrentUser where supported
Try {
    if (-not (Get-PackageProvider -ListAvailable -ErrorAction SilentlyContinue | Where-Object Name -eq 'NuGet')) {
        Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser -ForceBootstrap
    }
} Catch {
    Write-Warning "User-scoped NuGet provider failed: $($_.Exception.Message). Retrying without -Scope..."
    Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -ForceBootstrap
}

# --- 6) Ensure PackageManagement itself is healthy (optional but helpful)
Try {
    Install-Module PackageManagement -Repository PSGallery -Scope CurrentUser -Force -AllowClobber
} Catch {
    Write-Warning "PackageManagement install skipped/failed (may already be fine): $($_.Exception.Message)"
}

# --- 7) Install stable PowerShellGet v2 for broad compatibility (5.1 + 7.x)
# (PowerShellGet v3 is fine too, but many scripts still assume v2 cmdlets.)
Try {
    Install-Module PowerShellGet -Repository PSGallery -Scope CurrentUser -MinimumVersion 2.2.5 -Force -AllowClobber
} Catch {
    Write-Warning "PowerShellGet v2 install failed: $($_.Exception.Message)"
}

# --- 8) OPTIONAL: Also install PowerShellGet v3 if you want the newer cmdlets
# Comment out if you prefer to stay on v2-only
Try {
    Install-Module PowerShellGet -Repository PSGallery -Scope CurrentUser -Force -AllowClobber
} Catch {
    Write-Warning "PowerShellGet (latest) install failed (ok to ignore if v2 works): $($_.Exception.Message)"
}

# --- 9) Refresh the session's module path / commands (safe in PS7 and 5.1)
$env:PSModulePath = [System.Environment]::GetEnvironmentVariable('PSModulePath','Machine') + ';' +
                    [System.Environment]::GetEnvironmentVariable('PSModulePath','User')

# --- 10) Sanity check: can we see PSGallery and NuGet now?
$null = Get-PackageProvider -Name NuGet -ListAvailable
$null = Get-PSRepository -Name PSGallery

# --- 11) Finally, install PowerShell-Yaml (for ConvertFrom-Yaml / ConvertTo-Yaml)
Install-Module PowerShell-Yaml -Repository PSGallery -Scope CurrentUser -Force -AllowClobber

Write-Host "✅ PowerShellGet/PackageManagement repaired and PowerShell-Yaml installed." -ForegroundColor Green
Write-Host "   Open a NEW PowerShell window to ensure all changes are loaded." -ForegroundColor Yellow
