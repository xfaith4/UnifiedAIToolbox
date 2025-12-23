# WSL env-var pass-through for Codex orchestration

## Why not use `setx`?
- `setx` writes to the registry and only applies to future sessions. Orchestration needs the value immediately.
- Process-scoped environment variables (`$env:VAR='value'` in PowerShell) are sufficient for the current run and avoid polluting the global environment.

## How WSLENV works
- `WSLENV` is a colon-delimited allowlist of variables that should flow between Windows and WSL.
- Add entries as `NAME` with optional flags:
  - `/u` — pass from Windows to WSL only (no round trip back to Windows processes).
  - `/p` — convert Windows paths to WSL paths on the way in.
- Example: `WSLENV=MY_GITHUB_REPO/u:GH_TOKEN/u` ensures both variables are visible inside WSL, but not written back.

## Workflow overview
1. Set your repo source in PowerShell: ` $env:MY_GITHUB_REPO="https://github.com/owner/repo.git" `
2. Run the launcher: `.\scripts\Clone-WslRepo.ps1`
3. The script:
   - Adds `MY_GITHUB_REPO` (and optional `GH_TOKEN`) to `WSLENV` with `/u`.
   - Invokes `wsl.exe -- bash -lc "<single command>"` to clone or update the repo under `~/repos`.
   - Runs `scripts/orchestrator.sh` inside the repo if present.
   - Appends logs to `<repo>/orchestration.log` proving the env var reached WSL.

## Example session (PowerShell)
```powershell
$env:MY_GITHUB_REPO="https://github.com/owner/repo.git"
.\scripts\Clone-WslRepo.ps1
```

Expected WSL-side verification (run inside WSL):
```bash
echo "$MY_GITHUB_REPO"            # shows the repo URL
ls ~/repos/repo                   # repo exists
tail -n 50 ~/repos/repo/orchestration.log
```

If `GH_TOKEN` is set, it is passed with `/u` but masked in PowerShell logs and never printed in full.
