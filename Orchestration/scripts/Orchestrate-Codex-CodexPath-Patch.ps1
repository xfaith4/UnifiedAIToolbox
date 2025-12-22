# In Orchestrate-Codex.ps1, update the param block:
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$RepoRoot,
    [string]$Model = 'gpt-5-codex',
    [int]$MaxParallel = 3,
    [string]$WorkDir = '.codex_out',
    [string]$CodexPath = 'codex'   # NEW: 'codex' or 'npx' (to use npx @openai/codex)
)

# Add/replace this helper near the top:
function Test-Cli {
    param([Parameter(Mandatory)][string]$Name)
    try { return [bool](Get-Command $Name -ErrorAction Stop) } catch { return $false }
}

# Replace the current codex detection block with this:
# --- Resolve Codex command and pre-args --------------------------------------
$CodexCmd   = $null
$CodexPreArgs = @()

if ($CodexPath -ieq 'npx') {
    # Use npx to run the package without a global install
    if (-not (Test-Cli 'npx')) { throw "Requested CodexPath 'npx' but 'npx' isn't on PATH." }
    $CodexCmd     = 'npx'
    $CodexPreArgs = @('@openai/codex')
} else {
    # Use a direct CLI name/path (e.g., 'codex' or 'C:\Tools\codex.exe')
    if (-not (Test-Cli $CodexPath)) { throw "Codex CLI not found: $CodexPath" }
    $CodexCmd = $CodexPath
}

# In Invoke-CodexAgent(), replace the build of $args and the invocation:
$args = @() + $CodexPreArgs + @(
    'run','--model',$Model,
    '--repo','.',
    '--files', $fileList,
    '--prompt-file', $PromptPath,
    '--out', $out
)
$log = Join-Path $out 'codex.log'
& $CodexCmd @args *>&1 | Tee-Object -FilePath $log | Out-Null

# And in the Start-Job scriptblock, pass CodexPath bits through and mirror the above logic:
# (1) Add to -ArgumentList: ... , $CodexCmd, $CodexPreArgs
# (2) Inside the job param list: ..., $codexCmd, $codexPre
# (3) Build $args in the job with: $args = @() + $codexPre + @('run','--model', $model, '--repo','.', '--files',$scopePath, '--prompt-file',$prompt, '--out',$out)
# (4) Invoke: & $codexCmd @args *>&1 | Tee-Object -FilePath $log | Out-Null
