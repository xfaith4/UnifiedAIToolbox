### BEGIN FILE: Orchestration\Invoke-AgentsSdkOrchestration.ps1
[CmdletBinding()]
param(
  # Default to current directory (repo root) if not provided.
  [Parameter()] [string] $RepoRoot = (Get-Location).Path,

  [Parameter(Mandatory)] [string] $AgentLibraryPath,
  [Parameter(Mandatory)] [string] $TargetFilePath,

  [Parameter()] [string] $OutputDir = ".\Orchestration\artifacts\agents-sdk",

  # Your original prompt, but make it overridable.
  [Parameter()] [string] $UserPrompt = "Update and enhance this file. Populate each field where it makes sense that would enhance this team of agents ability to work more effectively together and produce even higher quality output.",

  # Model used by Agents SDK (NOT Codex). Override if you want.
  [Parameter()] [string] $AgentsModel = $env:OPENAI_AGENTS_MODEL,

  # Write trace JSONL here (optional)
  [Parameter()] [string] $TraceFile = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-FullPath {
  param([Parameter(Mandatory)][string]$Base, [Parameter(Mandatory)][string]$Path)
  if ([System.IO.Path]::IsPathRooted($Path)) { return [System.IO.Path]::GetFullPath($Path) }
  return [System.IO.Path]::GetFullPath((Join-Path $Base $Path))
}

$repo = [System.IO.Path]::GetFullPath($RepoRoot)

# IMPORTANT: your screenshot shows router lives under Orchestration\agents
$orchRoot = Join-Path $repo "Orchestration"
$router = Join-Path $orchRoot "agents\agent_library_router.py"

$agentLib = Resolve-FullPath -Base $repo -Path $AgentLibraryPath
$target = Resolve-FullPath -Base $repo -Path $TargetFilePath
$outDir = Resolve-FullPath -Base $repo -Path $OutputDir

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

if (-not (Test-Path -LiteralPath $agentLib)) { throw "Agent library not found: $($agentLib)" }
if (-not (Test-Path -LiteralPath $target)) { throw "Target file not found: $($target)" }
if (-not (Test-Path -LiteralPath $router)) { throw "Missing router script at: $($router)" }

# Prefer repo-local venv if present; else fall back to python on PATH.
$venvPy = Join-Path $repo ".venv\Scripts\python.exe"
$python = if (Test-Path -LiteralPath $venvPy) { $venvPy } else { "python" }

# Ensure API key exists for Agents SDK runs.
if (-not $env:OPENAI_API_KEY) {
  throw "OPENAI_API_KEY is not set. Agents SDK needs an API key for model calls."
}

Write-Host "Agents SDK orchestration"
Write-Host "  RepoRoot:     $($repo)"
Write-Host "  AgentLibrary: $($agentLib)"
Write-Host "  TargetFile:   $($target)"
Write-Host "  OutputDir:    $($outDir)"

$tracePath = $null
if ($TraceFile -and $TraceFile.Trim()) {
  $tracePath = Resolve-FullPath -Base $repo -Path $TraceFile
  Write-Host "  TraceFile:    $($tracePath)"
}

$argList = @(
  $router,
  "--agent-library", $agentLib,
  "--target-file", $target,
  "--output-dir", $outDir,
  "--user-prompt", $UserPrompt
)

if ($AgentsModel -and $AgentsModel.Trim()) {
  $argList += @("--agents-model", $AgentsModel)
}

if ($tracePath) {
  $argList += @("--trace-file", $tracePath)
}

& $python @argList

$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
  throw "Agents SDK run failed with exit code $exitCode"
}


Write-Host "Done. Report: $((Join-Path $outDir 'run_report.md'))"
### END FILE
