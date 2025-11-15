### BEGIN: PromptLibrary-SeedBackup.ps1
param(
  [string]$DashboardDir = ".\",
  [string]$SeedFile     = ".\prompt-library.starter.json"
)

# Path to the localStorage file is browser-managed; simplest is to keep a working copy in repo and import via UI.
# This helper just keeps a canonical copy in your repo and timestamps backups for safety.

$RepoLib = Join-Path $DashboardDir "prompt-library.json"

if (Test-Path $RepoLib) {
  # Create a timestamped backup before overwriting
  $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
  $Backup = "$RepoLib.$stamp.bak.json"
  Copy-Item -LiteralPath $RepoLib -Destination $Backup -Force  # safe backup
  Write-Host "Backed up existing prompt-library.json -> $Backup"
}

if (Test-Path $SeedFile) {
  # Copy seed into repo canonical file
  Copy-Item -LiteralPath $SeedFile -Destination $RepoLib -Force  # seed/update
  Write-Host "Seeded $RepoLib from $SeedFile"
} else {
  Write-Warning "Seed file not found: $SeedFile"
}

# Guidance:
# 1) Commit prompt-library.json to your repo.
# 2) In the UI, click Import and select this file to load into localStorage.
# 3) When you curate new prompts, Export from UI, then overwrite prompt-library.json and commit.
### END: PromptLibrary-SeedBackup.ps1
