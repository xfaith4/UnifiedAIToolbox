<#
.SYNOPSIS
    Sweeps a directory tree for manifest files, markdown docs, and/or custom file patterns.
.PARAMETER Root
    Root directory to sweep.
.PARAMETER OutDir
    Where to write report files (and optionally copies). Defaults to a timestamped TEMP folder.
.PARAMETER IncludeManifests
    Sweep for known manifest filenames (package.json, *.csproj, Dockerfile, etc.). On by default.
.PARAMETER IncludeMarkdown
    Also sweep for .md files.
.PARAMETER WriteMarkdownIndex
    Generate a sorted Markdown index of discovered .md files (requires -IncludeMarkdown).
.PARAMETER IndexPath
    Output path for the generated Markdown index. Defaults to <OutDir>\index.generated.md.
.PARAMETER ExtraPatterns
    Additional glob/name patterns to sweep for, reported under category "extra".
    Examples: "*.json", "*.ps1", "appsettings*.json", "*.config", "*.env"
.PARAMETER ListOnly
    List and log discovered files only — no copies are made to the copies\ folder.
.PARAMETER ManifestNames
    Override the built-in manifest filename/glob list.
.PARAMETER ExcludeDirs
    Directory leaf names to prune from the DFS walk (not descended into).
#>
param(
    [Parameter(Mandatory = $false)]
    [string]$Root = "G:\Development\20_Staging\AI Projects\UnifiedAIToolbox",

    [Parameter(Mandatory = $false)]
    [string]$OutDir = (Join-Path $env:TEMP ("repo-manifest-sweep_{0}" -f (Get-Date -Format "yyyyMMdd_HHmmss"))),

    [Parameter(Mandatory = $false)]
    [switch]$IncludeManifests = $true,

    [Parameter(Mandatory = $false)]
    [switch]$IncludeMarkdown,

    [Parameter(Mandatory = $false)]
    [switch]$WriteMarkdownIndex,

    [Parameter(Mandatory = $false)]
    [string]$IndexPath = $null,

    # Additional file patterns beyond manifests/markdown. Accepts globs like "*.json", "*.ps1".
    [Parameter(Mandatory = $false)]
    [string[]]$ExtraPatterns = @(),

    # When set: files are listed/logged only — copies\ folder is not created.
    [Parameter(Mandatory = $false)]
    [switch]$ListOnly,

    [Parameter(Mandatory = $false)]
    [string[]]$ManifestNames = @(
        "package.json",
        "package-lock.json",
        "pnpm-lock.yaml",
        "yarn.lock",
        "requirements.txt",
        "pyproject.toml",
        "Pipfile",
        "Pipfile.lock",
        "poetry.lock",
        "*.csproj",
        "*.fsproj",
        "*.vbproj",
        "*.sln",
        "Dockerfile",
        "docker-compose.yml",
        "docker-compose.yaml",
        ".github\workflows\*.yml",
        ".github\workflows\*.yaml"
    ),

    [Parameter(Mandatory = $false)]
    [string[]]$ExcludeDirs = @(
        "node_modules", "npm_modules", ".next", "dist", "build", ".git", ".uaitoolbox", ".venv", "venv",
        "__pycache__", "runs", "examples"
    )
)

$ErrorActionPreference = "Stop"

# ── Banner ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Sweep-RepoManifests  -  starting" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Root               : $Root" -ForegroundColor White
Write-Host "  OutDir             : $OutDir" -ForegroundColor White
Write-Host "  IncludeManifests   : $([bool]$IncludeManifests)" -ForegroundColor White
Write-Host "  IncludeMarkdown    : $([bool]$IncludeMarkdown)" -ForegroundColor White
Write-Host "  WriteMarkdownIndex : $([bool]$WriteMarkdownIndex)" -ForegroundColor White
Write-Host "  ListOnly (no copy) : $([bool]$ListOnly)" -ForegroundColor $(if ($ListOnly) { "Yellow" } else { "White" })
if ($ExtraPatterns.Count -gt 0) {
    Write-Host "  ExtraPatterns      : $($ExtraPatterns -join ', ')" -ForegroundColor Magenta
} else {
    Write-Host "  ExtraPatterns      : (none)" -ForegroundColor DarkGray
}
Write-Host "  ExcludeDirs        : $($ExcludeDirs -join ', ')" -ForegroundColor DarkGray
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

# ── Output setup ───────────────────────────────────────────────────────────────
New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$reportTxt = Join-Path $OutDir "manifest-sweep.txt"
$reportCsv = Join-Path $OutDir "manifest-sweep-map.csv"

$copiesDir = $null
if (-not $ListOnly) {
    $copiesDir = Join-Path $OutDir "copies"
    New-Item -ItemType Directory -Path $copiesDir -Force | Out-Null
    Write-Host "  [Setup] Copies folder : $copiesDir" -ForegroundColor DarkGray
} else {
    Write-Host "  [Setup] ListOnly mode — copies\ folder will NOT be created." -ForegroundColor Yellow
}

if ([string]::IsNullOrWhiteSpace($IndexPath)) {
    $IndexPath = Join-Path $OutDir "index.generated.md"
}

# Report headers
@(
    "Repo sweep"
    ("Root               : {0}" -f $Root)
    ("OutDir             : {0}" -f $OutDir)
    ("Timestamp          : {0}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
    ("IncludeManifests   : {0}" -f [bool]$IncludeManifests)
    ("IncludeMarkdown    : {0}" -f [bool]$IncludeMarkdown)
    ("WriteMarkdownIndex : {0}" -f [bool]$WriteMarkdownIndex)
    ("ListOnly           : {0}" -f [bool]$ListOnly)
    ("ExtraPatterns      : {0}" -f ($ExtraPatterns -join ', '))
    ""
) | Set-Content -LiteralPath $reportTxt -Encoding UTF8

"Id,Category,Name,OriginalPath,CopiedPath" | Set-Content -LiteralPath $reportCsv -Encoding UTF8

Write-Host "  [Setup] Reports will be written to: $OutDir" -ForegroundColor DarkGray
Write-Host ""

# ── State ──────────────────────────────────────────────────────────────────────
$stats     = @{}   # category -> count
$dirCount  = 0
$skipCount = 0
# Deduplicates paths so overlapping patterns don't log the same file twice
$seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

# ── Helpers ────────────────────────────────────────────────────────────────────
function New-StableId {
    param([Parameter(Mandatory = $true)][string]$Path)
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA1).Hash.Substring(0, 12).ToLowerInvariant()
}

function Add-FoundFile {
    param(
        [Parameter(Mandatory = $true)][string]$Category,
        [Parameter(Mandatory = $true)][string]$FilePath
    )

    # Skip if already logged (e.g. matched by both manifests and extra patterns)
    if (-not $seen.Add($FilePath)) { return $null }

    $leaf     = [System.IO.Path]::GetFileName($FilePath)
    $id       = New-StableId -Path $FilePath
    $destPath = ""

    if (-not $ListOnly) {
        $destName = "{0}__{1}" -f $id, $leaf
        $destPath = Join-Path $copiesDir $destName
        Copy-Item -LiteralPath $FilePath -Destination $destPath -Force
    }

    # Append to reports
    $FilePath | Add-Content -LiteralPath $reportTxt -Encoding UTF8
    ('"{0}","{1}","{2}","{3}","{4}"' -f $id, $Category, $leaf.Replace('"', '""'), $FilePath.Replace('"', '""'), $destPath.Replace('"', '""')) |
        Add-Content -LiteralPath $reportCsv -Encoding UTF8

    # Console — color by category
    $color = switch ($Category) {
        "manifest" { "Green" }
        "markdown" { "Cyan" }
        "extra"    { "Magenta" }
        default    { "White" }
    }
    $copyNote = if ($ListOnly) { "" } else { "  [copied]" }
    Write-Host "    [+] [$Category] $leaf$copyNote" -ForegroundColor $color
    Write-Host "        $FilePath" -ForegroundColor DarkGray

    if (-not $stats.ContainsKey($Category)) { $stats[$Category] = 0 }
    $stats[$Category]++

    return [pscustomobject]@{
        Id       = $id
        Category = $Category
        Name     = $leaf
        Path     = $FilePath
    }
}

# ── DFS sweep ──────────────────────────────────────────────────────────────────
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Scanning ..." -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$mdFound = New-Object System.Collections.Generic.List[object]
$stack   = [System.Collections.Generic.Stack[string]]::new()
$stack.Push((Resolve-Path $Root).Path)

while ($stack.Count -gt 0) {
    $dir     = $stack.Pop()
    $leafDir = [System.IO.Path]::GetFileName($dir)

    if ($ExcludeDirs -contains $leafDir) {
        Write-Host "  [SKIP] $dir" -ForegroundColor DarkGray
        $skipCount++
        continue
    }

    $dirCount++
    Write-Host "  [DIR ] $dir" -ForegroundColor Blue

    # 1) Manifest sweep
    if ($IncludeManifests) {
        foreach ($pattern in $ManifestNames) {
            $searchPath = Join-Path $dir $pattern
            if ($pattern -like "*`**" -or $pattern -like "*?*" -or $pattern -like "*[*]*") {
                Get-ChildItem -Path $searchPath -File -Force -ErrorAction SilentlyContinue |
                    ForEach-Object { Add-FoundFile -Category "manifest" -FilePath $_.FullName | Out-Null }
            } else {
                if (Test-Path -LiteralPath $searchPath -PathType Leaf) {
                    Add-FoundFile -Category "manifest" -FilePath $searchPath | Out-Null
                }
            }
        }
    }

    # 2) Markdown inventory
    if ($IncludeMarkdown) {
        Get-ChildItem -LiteralPath $dir -Filter "*.md" -File -Force -ErrorAction SilentlyContinue |
            ForEach-Object {
                $rec = Add-FoundFile -Category "markdown" -FilePath $_.FullName
                if ($null -ne $rec) { $mdFound.Add($rec) | Out-Null }
            }
    }

    # 3) Extra patterns
    if ($ExtraPatterns.Count -gt 0) {
        foreach ($pattern in $ExtraPatterns) {
            $searchPath = Join-Path $dir $pattern
            if ($pattern -like "*`**" -or $pattern -like "*?*" -or $pattern -like "*[*]*") {
                Get-ChildItem -Path $searchPath -File -Force -ErrorAction SilentlyContinue |
                    ForEach-Object { Add-FoundFile -Category "extra" -FilePath $_.FullName | Out-Null }
            } else {
                if (Test-Path -LiteralPath $searchPath -PathType Leaf) {
                    Add-FoundFile -Category "extra" -FilePath $searchPath | Out-Null
                }
            }
        }
    }

    # Push subdirectories (excluded dirs are pruned on next iteration)
    Get-ChildItem -LiteralPath $dir -Directory -Force -ErrorAction SilentlyContinue |
        ForEach-Object { $stack.Push($_.FullName) }
}

# ── Optional Markdown index ────────────────────────────────────────────────────
if ($WriteMarkdownIndex -and $IncludeMarkdown) {
    Write-Host ""
    Write-Host "-- Writing Markdown Index --" -ForegroundColor Cyan

    $rootResolved = (Resolve-Path $Root).Path.TrimEnd('\')
    $lines = New-Object System.Collections.Generic.List[string]

    $lines.Add("# Generated Markdown Index")
    $lines.Add("")
    $lines.Add(("Generated: {0}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss")))
    $lines.Add(("Root: {0}" -f $rootResolved))
    $lines.Add("")
    $lines.Add("## Discovered Markdown files")
    $lines.Add("")

    $mdFoundSorted = $mdFound | Sort-Object {
        $_.Path.Substring($rootResolved.Length).TrimStart('\') -replace '\\', '/'
    }

    foreach ($m in $mdFoundSorted) {
        $rel = $m.Path.Substring($rootResolved.Length).TrimStart('\') -replace '\\', '/'
        $lines.Add(("- ``{0}``" -f $rel))
    }

    $lines | Set-Content -LiteralPath $IndexPath -Encoding UTF8
    Write-Host "  Wrote markdown index : $IndexPath" -ForegroundColor Green
}

# ── Summary ────────────────────────────────────────────────────────────────────
$totalFound = ($stats.Values | Measure-Object -Sum).Sum
if ($null -eq $totalFound) { $totalFound = 0 }

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Summary" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Directories scanned  : $dirCount" -ForegroundColor White
Write-Host "  Directories skipped  : $skipCount" -ForegroundColor DarkGray
Write-Host ("  Total files found    : {0}" -f $totalFound) -ForegroundColor $(if ($totalFound -gt 0) { "Green" } else { "Yellow" })
foreach ($cat in ($stats.Keys | Sort-Object)) {
    Write-Host ("    [{0,-10}]  {1,4} file(s)" -f $cat, $stats[$cat]) -ForegroundColor Green
}
Write-Host ""
Write-Host "  Report (txt)   : $reportTxt" -ForegroundColor White
Write-Host "  Report (csv)   : $reportCsv" -ForegroundColor White
if (-not $ListOnly) {
    Write-Host "  Copies dir     : $copiesDir" -ForegroundColor White
} else {
    Write-Host "  Copies dir     : (skipped - ListOnly mode)" -ForegroundColor Yellow
}
Write-Host ""
