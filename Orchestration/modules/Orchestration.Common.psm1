<#
.SYNOPSIS
  Shared helper functions for AI orchestration scripts.
.DESCRIPTION
  Provides reusable utilities for command discovery, file globbing,
  and baseline workspace preparation. Centralizes logic that was
  previously duplicated across orchestration entry points.
#>

function Test-OrchCli {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Name
    )

    try {
        $command = Get-Command -Name $Name -ErrorAction SilentlyContinue
        return [bool]$command
    }
    catch {
        return $false
    }
}

function Get-OrchMatchedFiles {
    <#
      .SYNOPSIS
        Returns a narrowed file list based on include/exclude wildcards.
      .DESCRIPTION
        Normalizes path separators, supports doublestar globs, and removes
        duplicates to give stable file scopes across orchestrators.
    #>
    [CmdletBinding()]
    param(
        [string[]]$AllFiles,
        [string[]]$IncludeGlobs,
        [string[]]$ExcludeGlobs
    )

    if (-not $AllFiles) { return @() }

    $normalized = $AllFiles | ForEach-Object { ($_ -replace '\\','/').Trim() }
    $include    = $IncludeGlobs | ForEach-Object { ($_ -replace '\\','/').Replace('**','*') }
    $exclude    = $ExcludeGlobs | ForEach-Object { ($_ -replace '\\','/').Replace('**','*') }

    $candidates = if ($include -and $include.Count -gt 0) {
        foreach ($glob in $include) { $normalized | Where-Object { $_ -like $glob } }
    } else {
        $normalized
    }

    foreach ($glob in $exclude) {
        $candidates = $candidates | Where-Object { $_ -notlike $glob }
    }

    return ($candidates | Select-Object -Unique)
}

function Ensure-OrchDirectory {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Path
    )

    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    if (-not (Test-Path $Path)) {
        Write-Host "📁 Creating missing directory: $Path" -ForegroundColor Yellow
        New-Item -ItemType Directory -Force -Path $Path | Out-Null
    }
}

function Ensure-OrchJsonFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Path
    )

    if ([string]::IsNullOrWhiteSpace($Path)) { return }

    if (-not (Test-Path $Path)) {
        Write-Host "🪶 Creating new JSON file: $Path" -ForegroundColor Yellow
        "[]" | Out-File -Encoding utf8 $Path
        return
    }

    try {
        $null = Get-Content -Raw -Path $Path | ConvertFrom-Json -ErrorAction Stop
    }
    catch {
        Write-Warning "⚠️ Invalid JSON detected in $Path — resetting to empty array."
        "[]" | Out-File -Encoding utf8 $Path
    }
}

Set-Alias -Name Test-Cli -Value Test-OrchCli
Set-Alias -Name Get-MatchedFiles -Value Get-OrchMatchedFiles
Set-Alias -Name Ensure-Directory -Value Ensure-OrchDirectory
Set-Alias -Name Ensure-JsonFile -Value Ensure-OrchJsonFile

Export-ModuleMember -Function Test-OrchCli,Get-OrchMatchedFiles,Ensure-OrchDirectory,Ensure-OrchJsonFile -Alias Test-Cli,Get-MatchedFiles,Ensure-Directory,Ensure-JsonFile
