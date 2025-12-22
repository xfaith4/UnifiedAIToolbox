### BEGIN FILE: ContextResolver.ps1
<#
.SYNOPSIS
  Prepares a fully resolved version of a project goal for the AI Orchestration system.

.DESCRIPTION
  - Reads the specified Goal file.
  - Expands {variables}, environment variables, and relative paths.
  - Resolves `#import` and `#requires context from` directives:
      * Local directories or files
      * Public or Private GitHub raw file URLs (with PAT if provided)
  - Outputs a fully merged goal for orchestration.

  Supports environment variable:
      $env:GITHUB_TOKEN  → used for authenticated API access
#>

param(
    [Parameter(Mandatory)]
    [string]$GoalFile,

    [string]$OutputFile = "$PSScriptRoot\..\Goals\_ResolvedGoal.txt"
)

Write-Host "`n🌐 Context Resolver started for $GoalFile" -ForegroundColor Cyan

if (-not (Test-Path $GoalFile)) {
    throw "Goal file not found: $GoalFile"
}

# --- Step 1: Load goal text ---
$GoalText = Get-Content -Raw $GoalFile

# --- Step 2: Expand {tokens} and env vars ---
$GoalText = $GoalText -replace '\{(\w+)\}', {
    param($m)
    $key = $m.Groups[1].Value
    $val = [Environment]::GetEnvironmentVariable($key)
    if ($val) { return $val }
    else { return "{${key}}" }
}

# --- Step 3: Detect import directives ---
$Imports = @()
$GoalText -split "`n" | ForEach-Object {
    if ($_ -match '^\s*#import\s+(.+)$') {
        $Imports += $matches[1].Trim()
    }
    elseif ($_ -match '^\s*#requires context from:\s*(.+)$') {
        $Imports += $matches[1].Trim()
    }
}

if ($Imports.Count -gt 0) {
    Write-Host "📦 Found $($Imports.Count) import directives." -ForegroundColor Yellow
} else {
    Write-Host "ℹ️ No import directives found." -ForegroundColor Gray
}

# --- Step 4: Prepare GitHub auth header if available ---
$GitHubToken = $env:GITHUB_TOKEN
$Headers = @{}
if ($GitHubToken) {
    $Headers["Authorization"] = "token $GitHubToken"
    Write-Host "🔑 Using GitHub token from environment for private repo access." -ForegroundColor Green
} else {
    Write-Host "⚠️ No GitHub token found. Public-only access mode." -ForegroundColor DarkYellow
}

# --- Step 5: Resolve each import ---
$ResolvedContent = @()
foreach ($imp in $Imports) {
    Write-Host "🔍 Resolving: $imp" -ForegroundColor DarkCyan
    try {
        $content = $null

        if ($imp -match '^https://github\.com/.+') {
            # Convert GitHub link → raw content URL
            if ($imp -notmatch 'raw\.githubusercontent') {
                $imp = $imp -replace 'https://github\.com/(.+)/blob/(.+)', 'https://raw.githubusercontent.com/$1/$2'
            }

            # Try to retrieve with or without auth
            $params = @{ Uri = $imp; Headers = $Headers; ErrorAction = 'Stop' }
            $content = Invoke-RestMethod @params
        }
        elseif (Test-Path $imp) {
            $content = Get-Content -Raw $imp
        }
        elseif (Test-Path (Join-Path (Split-Path $GoalFile -Parent) $imp)) {
            $localPath = Join-Path (Split-Path $GoalFile -Parent) $imp
            $content = Get-Content -Raw $localPath
        }
        else {
            Write-Host "⚠️ Could not resolve: $imp" -ForegroundColor DarkYellow
        }

        if ($content) {
            $ResolvedContent += "`n--- Imported Context: $imp ---`n$content`n--- End Context ---`n"
        }
    }
    catch {
        Write-Host "❌ Error importing $imp : $_" -ForegroundColor Red
    }
}

# --- Step 6: Combine everything ---
$FinalGoal = @"
### BEGIN RESOLVED GOAL
$GoalText
$($ResolvedContent -join "`n")
### END RESOLVED GOAL
"@

# --- Step 7: Write to output ---
$OutputDir = Split-Path $OutputFile -Parent
if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir | Out-Null }

$FinalGoal | Out-File $OutputFile -Encoding UTF8
Write-Host "✅ Resolved goal written to $OutputFile" -ForegroundColor Green

### END FILE: ContextResolver.ps1
