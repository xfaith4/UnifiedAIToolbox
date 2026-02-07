# Command policy helpers for repo_context enforcement
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Normalize-Command {
    param([Parameter(Mandatory = $true)][string]$Command)
    $trimmed = $Command.Trim()
    if ([string]::IsNullOrWhiteSpace($trimmed)) { return "" }
    $normalized = ($trimmed -replace "\s+", " ")
    return $normalized
}

function Get-RepoContextCommands {
    [CmdletBinding()]
    param(
        [string]$RepoContextPath,
        [object]$RepoContext
    )

    $context = $RepoContext
    if (-not $context) {
        if (-not $RepoContextPath) {
            throw "RepoContextPath or RepoContext object is required"
        }
        if (-not (Test-Path -LiteralPath $RepoContextPath)) {
            throw "Repo context not found: $RepoContextPath"
        }
        $context = Get-Content -Raw -LiteralPath $RepoContextPath | ConvertFrom-Json -Depth 50
    }

    $commands = @()
    if ($context -and $context.discovery -and $context.discovery.commands) {
        $commands = @($context.discovery.commands)
    }

    return $commands
}

function Test-CommandAllowed {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [string]$RepoContextPath,
        [object]$RepoContext
    )

    $normalized = Normalize-Command -Command $Command
    if ([string]::IsNullOrWhiteSpace($normalized)) { return $false }

    $allowed = Get-RepoContextCommands -RepoContextPath $RepoContextPath -RepoContext $RepoContext
    foreach ($entry in $allowed) {
        if (-not $entry) { continue }
        $allowedCmd = Normalize-Command -Command ([string]$entry.command)
        if ($allowedCmd -eq $normalized) {
            return $true
        }
    }
    return $false
}

function Assert-CommandAllowed {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Command,
        [string]$RepoContextPath,
        [object]$RepoContext
    )

    if (-not (Test-CommandAllowed -Command $Command -RepoContextPath $RepoContextPath -RepoContext $RepoContext)) {
        throw "Command '$Command' is not present in repo_context.commands"
    }
}

function Select-ApprovedCommands {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][array]$Commands,
        [double]$ConfidenceThreshold = 0.7,
        [bool]$AllowConvention = $false
    )

    $approved = @()
    foreach ($cmd in $Commands) {
        if (-not $cmd) { continue }
        $confidence = 0.0
        if ($null -ne $cmd.confidence) {
            try { $confidence = [double]$cmd.confidence } catch { $confidence = 0.0 }
        }
        $source = [string]$cmd.source
        if (-not $AllowConvention -and $source -eq "convention") { continue }
        if ($confidence -lt $ConfidenceThreshold) { continue }
        $approved += $cmd
    }
    return $approved
}
