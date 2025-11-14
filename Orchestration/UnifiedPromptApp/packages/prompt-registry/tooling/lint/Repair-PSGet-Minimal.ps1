#requires -version 5.1
$ErrorActionPreference = 'Stop'

# --- Use TLS 1.2 for gallery calls
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# --- Make downloaded scripts runnable without AllSigned prompts (user scope only)
# Tip: If policy is locked by corporate GPO, this will silently fail and that's ok.
try {
    Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
} catch {
    Write-Warning "ExecutionPolicy (CurrentUser) unchanged: $($_.Exception.Message)"
}

# --- Unblock the Microsoft-signed modules so AuthorizationManager stops nagging
$pmDir  = 'C:\Program Files\PowerShell\7\Modules\PackageManagement\1.4.8.1'
$psgDir = 'C:\Program Files\PowerShell\7\Modules\PowerShellGet\2.2.5'

foreach ($path in @($pmDir, $psgDir)) {
    if (Test-Path $path) {
        try {
            Get-ChildItem -Path $path -Recurse -Force | Unblock-File -ErrorAction SilentlyContinue
        } catch {
            Write-Warning "Unblock failed on $path (try running once as Administrator)"
        }
    }
}

# --- Import the modules you *do* have; don't pin a version you don't have
Import-Module PackageManagement -Force
Import-Module PowerShellGet     -MinimumVersion 2.2.5 -Force

# --- Ensure NuGet provider exists (Install-Module depends on it)
if (-not (Get-PackageProvider -ListAvailable -ErrorAction SilentlyContinue | Where-Object Name -eq 'NuGet')) {
    try {
        Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Scope CurrentUser -Force -ForceBootstrap
    } catch {
        Write-Warning "User-scope NuGet bootstrap failed: $($_.Exception.Message). Retrying machine-scope..."
        Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -ForceBootstrap
    }
}

# --- Register and trust PSGallery (PowerShellGet cmdlets now available)
if (-not (Get-PSRepository -ErrorAction SilentlyContinue | Where-Object Name -eq 'PSGallery')) {
    try {
        Register-PSRepository -Default
    } catch {
        # Fallback to explicit endpoints if -Default refuses
        Register-PSRepository -Name PSGallery `
          -SourceLocation 'https://www.powershellgallery.com/api/v2' `
          -ScriptSourceLocation 'https://www.powershellgallery.com/api/v2' `
          -InstallationPolicy Trusted
    }
} else {
    Set-PSRepository -Name PSGallery -InstallationPolicy Trusted
}

# --- Smoke test: these should now succeed without prompts
Write-Host "`nProviders:" -ForegroundColor Cyan
Get-PackageProvider -ListAvailable | Where-Object Name -in 'NuGet','PowerShellGet' | Format-Table Name,Version

Write-Host "`nRepositories:" -ForegroundColor Cyan
Get-PSRepository | Format-Table Name,InstallationPolicy,SourceLocation

Write-Host "`nFind-Module (no install):" -ForegroundColor Cyan
Find-Module PowerShell-Yaml -Repository PSGallery | Select-Object Name,Version | Format-Table -AutoSize

Write-Host "`n✅ Repair complete. Open a NEW pwsh window before using Install-Module." -ForegroundColor Green
