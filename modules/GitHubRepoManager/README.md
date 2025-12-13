# GitHub Repo Manager

This module automates repository plumbing for the **UnifiedAIToolbox** workspace and exposes a production-ready WPF GUI wrapper. It manages the enforced directory model:

- `00_Templates`
- `10_Active`
- `20_Staging`
- `30_Archive`
- `99_Clones`

## Installation

```powershell
Import-Module <path-to-module>/modules/GitHubRepoManager/GitHubRepoManager.psm1
```

## Exported Functions

| Command | Purpose |
| --- | --- |
| `Initialize-AllRepos` | Ensures the directory structure exists and clones repositories owned by the authenticated GitHub user into `99_Clones`. Requires `GITHUB_TOKEN`. |
| `Update-AllRepos` | Fetches all remotes and fast-forward pulls the default branch in each clone. |
| `Sync-AllRepos` | Prunes stale remotes and realigns tracking branches for every repository. |
| `Export-RepoStatusReport` | Generates a CSV listing `Repo`, `Branch`, `Ahead`, `Behind`, `Date`, and `DaysOld`. |
| `Archive-InactiveRepos` | Zips repositories older than the specified `-DaysInactive` threshold from `10_Active` and `20_Staging` into `30_Archive`. |
| `Start-RepoManagerGUI` | Displays a WPF dashboard with color cues, inline controls, and STA enforcement. |

## Environment

- Place a valid token in `GITHUB_TOKEN` so that cloning owned repositories works.
- Logs are stored under `<Root>/Logs/GitHubRepoManager.log` and records each major action.

## Task Scheduler

A scheduled task XML named `GitHubRepoManager.TaskScheduler.xml` runs `Update-AllRepos` and `Export-RepoStatusReport` daily at 04:00. Import it using `schtasks /CREATE /XML ... /TN "GitHub Repo Manager"`.

## GUI Behavior

`Start-RepoManagerGUI` launches an STA-bound window with:
- A `DataGrid` showing repo metadata.
- Row colors: gray when `DaysOld>=9999`, dark red when exceeding `-StaleThreshold`, goldenrod when behind, otherwise dark green.
- Buttons for `Update`, `Sync`, `Export`, `Archive`, `Refresh`, and `Exit`.
- Automatic logging and Write-Progress output during operations.

## Logging and Progress

Each exported function logs to the centralized log file and emits `Write-Progress` / `Write-Verbose` so automation scripts can visualize progress.
