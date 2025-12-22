#requires -Version 7
<#
.SYNOPSIS
    Convenience wrapper that runs the canonical prompt validation task.
.DESCRIPTION
    Prefers `uv run validate-prompts` inside `packages/prompt-registry`. If `uv`
    is not available it falls back to `python -m prompt_registry.cli lint`.
.PARAMETER ProjectPath
    Override the prompt-registry package directory (defaults to repo copy).
.PARAMETER PythonExe
    Python executable to use for the fallback path.
.EXAMPLE
    ./tools/Validate-Prompts.ps1
.EXAMPLE
    ./tools/Validate-Prompts.ps1 -PythonExe "C:\Python313\python.exe"
#>

param(
    [string]$ProjectPath = (Join-Path $PSScriptRoot "..\\packages\\prompt-registry"),
    [string]$PythonExe = "python"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$resolvedProject = Resolve-Path -Path $ProjectPath
if (-not (Test-Path -LiteralPath $resolvedProject)) {
    throw "Prompt registry path not found: $ProjectPath"
}

Push-Location $resolvedProject
try {
    $uv = Get-Command uv -ErrorAction SilentlyContinue
    if ($uv) {
        & $uv.Path run validate-prompts
        return
    }

    Write-Warning "uv not found. Falling back to python -m prompt_registry.cli lint."
    $srcPath = Join-Path $resolvedProject "src"
    $prevPyPath = $env:PYTHONPATH
    $env:PYTHONPATH = $srcPath
    try {
        & $PythonExe -m prompt_registry.cli lint
    }
    finally {
        if ($null -ne $prevPyPath) {
            $env:PYTHONPATH = $prevPyPath
        }
        else {
            Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue
        }
    }
}
finally {
    Pop-Location
}
