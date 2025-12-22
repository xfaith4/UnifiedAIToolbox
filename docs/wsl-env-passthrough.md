# WSL env-var pass-through for Codex orchestration

## Why not `setx`?
`setx` writes to the user profile and requires opening a new session. The Codex orchestration path needs values immediately in the current PowerShell session, so environment variables are set process-scoped instead of persisted via `setx`.

## How `WSLENV` works
- `WSLENV` is a colon-delimited allowlist of variable names to pass into WSL.
- Use the `/u` flag to send values from Windows to WSL only (no round-trip back to Windows processes).
- Example: `WSLENV=MY_GITHUB_REPO/u:GH_TOKEN/u` will expose `MY_GITHUB_REPO` and `GH_TOKEN` inside WSL.

## Usage examples (PowerShell → WSL)
```powershell
# Set repo and (optionally) token in the current session
$env:MY_GITHUB_REPO="https://github.com/<owner>/<repo>.git"
# Optional: $env:GH_TOKEN="ghp_xxxx"  # only the first/last 4 chars are logged

# Invoke the pipeline (default workdir: ~/repos; default orchestrator: orchestrator.sh)
.\scripts\Clone-WslRepo.ps1

# Target a specific distro or custom workdir/orchestrator
.\scripts\Clone-WslRepo.ps1 -WslDistro "Ubuntu-22.04" -WslWorkDir "~/workspace" -OrchestratorPath "scripts/orchestrator.sh"
```

## Expected outputs
- WSL receives `MY_GITHUB_REPO` (verified in `orchestration.log`).
- Repository is cloned or updated under the chosen workdir.
- `scripts/orchestrator.sh` runs (or a clear message is logged if missing).
- Secrets are never printed; tokens are masked to first 4 + last 4 characters.
