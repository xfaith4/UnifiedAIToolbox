#requires -Version 7
<#
.SYNOPSIS
    Builds (and optionally publishes) the prompt-registry package.
.DESCRIPTION
    Runs `uv build` when available so we get sdist + wheel artifacts under `dist/`.
    Falls back to `python -m build` when uv is not installed. If a feed URL is
    provided the script will invoke `uv publish --index <feed>` and pass the token
    via `UV_PUBLISH_TOKEN`.
.PARAMETER ProjectPath
    Path to the prompt-registry project (defaults to the repo copy).
.PARAMETER PythonExe
    Python executable used for the fallback build command.
.PARAMETER FeedUrl
    Optional package index URL. When supplied, `uv publish` is executed.
.PARAMETER ApiToken
    API token passed to `UV_PUBLISH_TOKEN` for publishing. If omitted, the script
    uses the current `UV_PUBLISH_TOKEN` environment variable.
.PARAMETER BuildOnly
    Skip publishing even if `FeedUrl` is supplied.
.EXAMPLE
    pwsh ./scripts/Publish-PromptRegistry.ps1
.EXAMPLE
    pwsh ./scripts/Publish-PromptRegistry.ps1 -FeedUrl https://pkgs.example.com/simple `
        -ApiToken $env:UNIFIED_PROMPT_FEED_TOKEN
#>

param(
    [string]$ProjectPath = (Join-Path $PSScriptRoot ".."),
    [string]$PythonExe = "python",
    [string]$FeedUrl,
    [string]$ApiToken,
    [switch]$BuildOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$resolvedProject = Resolve-Path -Path $ProjectPath
Write-Host "[prompt-registry] using project path: $resolvedProject"

Push-Location $resolvedProject
try {
    $uv = Get-Command uv -ErrorAction SilentlyContinue

    if ($uv) {
        Write-Host "[prompt-registry] running 'uv build'"
        & $uv.Path build
    }
    else {
        Write-Warning "uv not found. Falling back to '$PythonExe -m build'. Ensure the 'build' module is installed."
        & $PythonExe -m build
    }

    if ($BuildOnly -or -not $FeedUrl) {
        if ($FeedUrl -and $BuildOnly) {
            Write-Host "[prompt-registry] build complete (publish skipped by BuildOnly)."
        }
        else {
            Write-Host "[prompt-registry] build complete."
        }
        return
    }

    if (-not $uv) {
        throw "Publishing requires 'uv'. Install it (https://github.com/astral-sh/uv) or rerun with -BuildOnly."
    }

    $token = if ($ApiToken) { $ApiToken } else { $env:UV_PUBLISH_TOKEN }
    if (-not $token) {
        throw "Provide -ApiToken or set UV_PUBLISH_TOKEN before publishing."
    }

    $previousToken = $env:UV_PUBLISH_TOKEN
    $env:UV_PUBLISH_TOKEN = $token
    try {
        Write-Host "[prompt-registry] publishing to $FeedUrl"
        & $uv.Path publish --index $FeedUrl
    }
    finally {
        if ($previousToken) {
            $env:UV_PUBLISH_TOKEN = $previousToken
        }
        else {
            Remove-Item Env:UV_PUBLISH_TOKEN -ErrorAction SilentlyContinue
        }
    }
}
finally {
    Pop-Location
}
