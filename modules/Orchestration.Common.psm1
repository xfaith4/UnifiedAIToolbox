#requires -Version 5.1

Set-StrictMode -Version Latest

function Test-OrchCli {
    <#
    .SYNOPSIS
        Returns $true when the specified command can be resolved on PATH.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Command
    )

    try {
        $null -ne (Get-Command -Name $Command -ErrorAction SilentlyContinue)
    }
    catch {
        $false
    }
}

function Get-OrchGoalSummary {
    <#
    .SYNOPSIS
        Loads a goal text file and returns trimmed metadata.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Goal file not found: $Path"
    }

    $raw = Get-Content -LiteralPath $Path -Raw
    $lines = ($raw -split '\r?\n').Where({$_}, 'SkipNulls')
    @{
        Path        = (Resolve-Path -LiteralPath $Path).ProviderPath
        Preview     = ($lines | Select-Object -First 5) -join [Environment]::NewLine
        WordCount   = ($raw -split '\s+' | Where-Object { $_ }) | Measure-Object | Select-Object -ExpandProperty Count
        LastUpdated = (Get-Item -LiteralPath $Path).LastWriteTimeUtc.ToString('O')
        Raw         = $raw
    }
}

Export-ModuleMember -Function Test-OrchCli, Get-OrchGoalSummary
