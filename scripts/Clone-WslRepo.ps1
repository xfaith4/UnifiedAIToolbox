<#
.SYNOPSIS
    Clone or update a GitHub repo inside WSL and run an orchestrator script with env-var pass-through.

.DESCRIPTION
    - Reads the repo from -Repo or $Env:MY_GITHUB_REPO.
    - Ensures MY_GITHUB_REPO (and optional GH_TOKEN) are passed into WSL via WSLENV using the /u flag.
    - Uses a single wsl.exe invocation (PowerShell-compatible, no heredocs) to clone/pull and run the orchestrator.
    - Writes a detailed log at <repo>/orchestration.log inside WSL.

.NOTES
    PowerShell 5.1+ compatible. Uses process-scoped env vars only (no setx).
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$Repo,

    [Parameter(Mandatory = $false)]
    [string]$WslDistro,

    [Parameter(Mandatory = $false)]
    [string]$WslWorkDir = "~/repos",

    [Parameter(Mandatory = $false)]
    [string]$OrchestratorPath = "scripts/orchestrator.sh"
)

$ErrorActionPreference = "Stop"

function Write-Status {
    param(
        [Parameter(Mandatory = $true)][string]$Message,
        [Parameter()][ValidateSet("Info","Success","Warning","Error")][string]$Level = "Info"
    )
    $timestamp = Get-Date -Format "HH:mm:ss"
    $color = switch ($Level) {
        "Success" { "Green" }
        "Warning" { "Yellow" }
        "Error"   { "Red" }
        default   { "Cyan" }
    }
    Write-Host "[$timestamp] $Message" -ForegroundColor $color
}

function Add-WslEnvEntry {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter()][string]$Flags = "/u"
    )
    $entries = @()
    if ($env:WSLENV) {
        $entries = $env:WSLENV -split ":" | Where-Object { $_ -ne "" }
    }
    $target = "$Name$Flags"
    $entries = $entries | Where-Object { $_ -notmatch "^$Name(/|$)" }
    $entries += $target
    $env:WSLENV = ($entries -join ":")
}

# Resolve repo source
if (-not $Repo -and [string]::IsNullOrWhiteSpace($Env:MY_GITHUB_REPO)) {
    throw "MY_GITHUB_REPO is not set and -Repo was not provided. Set the variable (e.g., `$env:MY_GITHUB_REPO='https://github.com/owner/repo.git'`) or pass -Repo."
}

if (-not $Repo) {
    $Repo = $Env:MY_GITHUB_REPO
}

# Ensure MY_GITHUB_REPO is set for this process so WSL can read it.
$env:MY_GITHUB_REPO = $Repo
Add-WslEnvEntry -Name "MY_GITHUB_REPO"

# Optional GH_TOKEN pass-through (masked in logs)
$ghTokenMasked = $null
if ($Env:GH_TOKEN) {
    Add-WslEnvEntry -Name "GH_TOKEN"
    if ($Env:GH_TOKEN.Length -ge 8) {
        $ghTokenMasked = "$($Env:GH_TOKEN.Substring(0,4))...$($Env:GH_TOKEN.Substring($Env:GH_TOKEN.Length-4))"
    } else {
        $ghTokenMasked = "[masked]"
    }
}

Write-Status "WSLENV: $($env:WSLENV)" "Info"
Write-Status "Repo source: $Repo" "Info"
if ($ghTokenMasked) {
    Write-Status "GH_TOKEN detected (masked: $ghTokenMasked)" "Info"
}

# Escape values for bash
function Escape-Bash {
    param([string]$Value)
    return $Value -replace "'", "'\"'\"'"
}

$bashWorkDir = Escape-Bash $WslWorkDir
$bashOrchPath = Escape-Bash $OrchestratorPath

$bashCommand = @"
set -euo pipefail

if ! command -v git >/dev/null 2>&1; then
  echo "[ERROR] git is not installed in WSL. Install with: sudo apt-get update && sudo apt-get install -y git" >&2
  exit 1
fi

repo="\${MY_GITHUB_REPO:-}"
if [ -z "\$repo" ]; then
  echo "[ERROR] MY_GITHUB_REPO is not set inside WSL. Ensure WSLENV includes MY_GITHUB_REPO/u." >&2
  exit 1
fi

workdir='$bashWorkDir'
if [ -z "\$workdir" ]; then
  workdir="\$HOME/repos"
fi
mkdir -p "\$workdir"

reponame="\$(basename "\$repo" .git)"
repodir="\$workdir/\$reponame"
log="\$repodir/orchestration.log"
mkdir -p "\$repodir"
mkdir -p "\$(dirname "\$log")"

log_msg() {
  ts=\$(date -Is)
  printf '[%s] %s\n' "\$ts" "\$1" | tee -a "\$log"
}

log_msg "Starting orchestration for \$repo"
if [ ! -d "\$repodir/.git" ]; then
  log_msg "Cloning repository into \$repodir"
  git clone "\$repo" "\$repodir"
else
  log_msg "Repository already exists; fetching latest changes"
  git -C "\$repodir" fetch --all --prune
  git -C "\$repodir" pull --ff-only
fi

orch_rel='$bashOrchPath'
orch_path="\$repodir/\$orch_rel"
if [ -f "\$orch_path" ]; then
  log_msg "Running orchestrator: \$orch_rel"
  chmod +x "\$orch_path" || true
  (cd "\$repodir" && "\$orch_path") | tee -a "\$log"
  log_msg "Orchestrator completed"
else
  log_msg "Orchestrator script not found at \$orch_rel; skipping run."
fi
"@

$wslArgs = @()
if ($WslDistro) {
    $wslArgs += @("-d", $WslDistro)
}
$wslArgs += @("--", "bash", "-lc", $bashCommand)

Write-Status "Invoking WSL..." "Info"
wsl.exe @wslArgs
Write-Status "WSL operation finished." "Success"
