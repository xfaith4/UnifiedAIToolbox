Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-AgentRoster {
    [CmdletBinding()]
    param(
        [ValidateSet("full", "thin")]
        [string]$Mode = "thin",

        [string]$CanonicalPath = (Join-Path $PSScriptRoot "..\agents\agent-library.json")
    )

    if (-not (Test-Path -LiteralPath $CanonicalPath)) {
        throw "Canonical agent registry not found: $CanonicalPath"
    }

    $raw = Get-Content -Raw -LiteralPath $CanonicalPath | ConvertFrom-Json -Depth 100
    if (-not ($raw -is [System.Collections.IEnumerable])) {
        throw "Canonical registry must be a JSON array: $CanonicalPath"
    }

    $agents = @($raw)
    if ($Mode -eq "full") {
        return $agents
    }

    $thin = @()
    foreach ($agent in ($agents | Sort-Object -Property name)) {
        if (-not $agent.name) { continue }
        if (-not $agent.prompt) { continue }

        $thin += [ordered]@{
            name   = [string]$agent.name
            role   = if ($agent.role) { [string]$agent.role } else { "system" }
            prompt = [string]$agent.prompt
        }
    }

    return $thin
}

Export-ModuleMember -Function Get-AgentRoster
