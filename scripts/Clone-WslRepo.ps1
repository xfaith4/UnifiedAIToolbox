param(
    [string]$Repo,
    [string]$WslDistro,
    [string]$WslWorkDir = "~/repos",
    [string]$OrchestratorPath = "orchestrator.sh"
)

function Mask-Token {
    param([string]$Token)
    if (-not $Token) { return "" }
    if ($Token.Length -le 8) { return ('*' * $Token.Length) }
    return "{0}****{1}" -f $Token.Substring(0, 4), $Token.Substring($Token.Length - 4)
}

if (-not $Repo) {
    $Repo = $Env:MY_GITHUB_REPO
}

if (-not $Repo) {
    throw "Repo was not provided. Set -Repo or define MY_GITHUB_REPO in the environment before running."
}

$Env:MY_GITHUB_REPO = $Repo
$Env:WSL_WORKDIR = $WslWorkDir
$Env:ORCHESTRATOR_PATH = $OrchestratorPath

$wslEnvEntries = @("MY_GITHUB_REPO/u", "WSL_WORKDIR/u", "ORCHESTRATOR_PATH/u")

if ($Env:GH_TOKEN) {
    $wslEnvEntries += "GH_TOKEN/u"
    Write-Output ("GH_TOKEN detected (masked): {0}" -f (Mask-Token $Env:GH_TOKEN))
}

$existingEnv = @()
if ($Env:WSLENV) {
    $existingEnv = $Env:WSLENV -split ":" | Where-Object { $_ }
}

$Env:WSLENV = ( @($existingEnv + $wslEnvEntries) | Select-Object -Unique ) -join ":"

$bashLines = @(
    'set -euo pipefail',
    'REPO="${MY_GITHUB_REPO:-}"',
    'if [ -z "$REPO" ]; then echo "MY_GITHUB_REPO is required inside WSL (owner/name or full URL)" >&2; exit 1; fi',
    'if [[ "$REPO" != *"://"* ]]; then REPO="https://github.com/${REPO}.git"; fi',
    'WORKDIR="${WSL_WORKDIR:-$HOME/repos}"',
    'if ! command -v git >/dev/null 2>&1; then echo "git is required inside WSL. Install with: sudo apt-get update && sudo apt-get install -y git" >&2; exit 1; fi',
    'mkdir -p "$WORKDIR"',
    'repo_name=$(basename "$REPO")',
    'repo_name="${repo_name%.git}"',
    'repo_dir="$WORKDIR/$repo_name"',
    'bootstrap_log="$WORKDIR/orchestration.log"',
    ': > "$bootstrap_log"',
    'repo_log="$repo_dir/orchestration.log"',
    'printf "[%s] stage=preflight repo=%s workdir=%s\n" "$(date -Iseconds)" "$REPO" "$WORKDIR" | tee -a "$bootstrap_log"',
    'if [ -d "$repo_dir/.git" ]; then',
    '  log_file="$repo_log"',
    '  cat "$bootstrap_log" >> "$log_file"',
    'else',
    '  log_file="$bootstrap_log"',
    'fi',
    'if [ ! -d "$repo_dir/.git" ]; then',
    '  printf "[%s] stage=clone action=git-clone dest=%s\n" "$(date -Iseconds)" "$repo_dir" | tee -a "$log_file"',
    '  git clone "$REPO" "$repo_dir" 2>&1 | tee -a "$log_file"',
    '  log_file="$repo_log"',
    '  cat "$bootstrap_log" >> "$log_file"',
    'else',
    '  printf "[%s] stage=update action=git-fetch\n" "$(date -Iseconds)" | tee -a "$log_file"',
    '  git -C "$repo_dir" fetch --all --prune 2>&1 | tee -a "$log_file"',
    '  git -C "$repo_dir" pull --ff-only 2>&1 | tee -a "$log_file"',
    'fi',
    'orchestrator="${ORCHESTRATOR_PATH:-orchestrator.sh}"',
    'candidate="$repo_dir/$orchestrator"',
    'if [ ! -f "$candidate" ] && [ "$orchestrator" = "orchestrator.sh" ] && [ -f "$repo_dir/scripts/orchestrator.sh" ]; then',
    '  candidate="$repo_dir/scripts/orchestrator.sh"',
    'fi',
    'if [ -f "$candidate" ]; then',
    '  printf "[%s] stage=orchestrator path=%s\n" "$(date -Iseconds)" "$candidate" | tee -a "$log_file"',
    '  chmod +x "$candidate"',
    '  (cd "$repo_dir" && "$candidate") | tee -a "$log_file"',
    'else',
    '  printf "[%s] stage=orchestrator status=missing detail=%s\n" "$(date -Iseconds)" "$candidate" | tee -a "$log_file"',
    'fi'
)

$bashCommand = ($bashLines -join ' && ')

$wslArgs = @()
if ($WslDistro) {
    $wslArgs += "-d"
    $wslArgs += $WslDistro
}
$wslArgs += "--"
$wslArgs += "bash"
$wslArgs += "-lc"
$wslArgs += $bashCommand

$distroLabel = if ($WslDistro) { $WslDistro } else { "default" }
Write-Output "Invoking WSL (distro: $distroLabel) with workdir $WslWorkDir and orchestrator $OrchestratorPath"
Write-Output "WSLENV=$($Env:WSLENV)"

$process = Start-Process -FilePath "wsl.exe" -ArgumentList $wslArgs -Wait -PassThru -NoNewWindow

if ($process.ExitCode -ne 0) {
    throw "WSL command failed with exit code $($process.ExitCode)"
}
