#requires -Version 7
<#
.SYNOPSIS
    Runs the prompt-registry pytest suite with the expected interpreter.
.DESCRIPTION
    Sets PYTHONPATH to the package src directory, then calls pytest using
    the provided Python executable (defaults to C:\Python313\python.exe).
.PARAMETER PythonExe
    Path to the Python interpreter you want to use.
.PARAMETER AdditionalArgs
    Optional extra arguments to pass through to pytest.
.EXAMPLE
    ./scripts/Test-PromptRegistry.ps1
.EXAMPLE
    ./scripts/Test-PromptRegistry.ps1 -PythonExe "C:\Python313\python.exe" -AdditionalArgs "-k PromptSpec"
#>

param(
    [string]$PythonExe = "C:\Python313\python.exe",
    [string[]]$AdditionalArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path -Path (Join-Path $PSScriptRoot "..")
$srcPath = Join-Path $repoRoot "src"
$testPath = Join-Path $repoRoot "tests" "test_registry.py"

if (-not (Test-Path -LiteralPath $PythonExe)) {
    throw "Python executable not found: $PythonExe"
}

if (-not (Test-Path -LiteralPath $testPath)) {
    throw "Test file not found: $testPath"
}

$prevPyPath = $env:PYTHONPATH
$env:PYTHONPATH = $srcPath

try {
    & $PythonExe -m pytest $testPath @AdditionalArgs
}
finally {
    if ($null -ne $prevPyPath) {
        $env:PYTHONPATH = $prevPyPath
    } else {
        Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue
    }
}
