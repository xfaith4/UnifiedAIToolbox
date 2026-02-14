### BEGIN FILE: Sweep-RepoManifests-Pruned.ps1
param(
    [Parameter(Mandatory = $false)]
    [string]$Root = "G:\Development\20_Staging\UnifiedAIToolbox",

    [Parameter(Mandatory = $false)]
    [string]$OutDir = (Join-Path $env:TEMP ("repo-manifest-sweep_{0}" -f (Get-Date -Format "yyyyMMdd_HHmmss"))),

    [Parameter(Mandatory = $false)]
    [string[]]$Names = @("package.json", "requirements.txt"),

    # Folders to skip entirely (we do NOT descend into these)
    [Parameter(Mandatory = $false)]
    [string[]]$ExcludeDirs = @(
        "node_modules", "npm_modules", ".next", "dist", "build", ".git", ".uaitoolbox", ".venv", "venv", "__pycache__", "runs", "examples"
    )
)

$ErrorActionPreference = "Stop"

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null

$reportTxt = Join-Path $OutDir "manifest-sweep.txt"
$reportCsv = Join-Path $OutDir "manifest-sweep-map.csv"
$copiesDir = Join-Path $OutDir "copies"
New-Item -ItemType Directory -Path $copiesDir -Force | Out-Null

# Write report headers
@(
    "Repo manifest sweep"
    ("Root: {0}" -f $Root)
    ("OutDir: {0}" -f $OutDir)
    ("Timestamp: {0}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
    ""
) | Set-Content -LiteralPath $reportTxt -Encoding UTF8

"Id,Name,OriginalPath,CopiedPath" | Set-Content -LiteralPath $reportCsv -Encoding UTF8

# DFS with pruning (does not descend into excluded dirs)
$stack = [System.Collections.Generic.Stack[string]]::new()
$stack.Push((Resolve-Path $Root).Path)

while ($stack.Count -gt 0) {
    $dir = $stack.Pop()

    # Skip excluded directories by leaf name
    $leaf = [System.IO.Path]::GetFileName($dir)
    if ($ExcludeDirs -contains $leaf) { continue }

    # Capture manifest files in this directory
    foreach ($n in $Names) {
        $p = Join-Path $dir $n
        if (Test-Path -LiteralPath $p -PathType Leaf) {
            # Stable id from full path (hash)
            $id = (Get-FileHash -LiteralPath $p -Algorithm SHA1).Hash.Substring(0, 12).ToLowerInvariant()

            # Copy into a flat review folder (safe filenames)
            $destName = "{0}__{1}" -f $id, $n
            $destPath = Join-Path $copiesDir $destName
            Copy-Item -LiteralPath $p -Destination $destPath -Force

            # Log
            $p | Add-Content -LiteralPath $reportTxt -Encoding UTF8
            ('"{0}","{1}","{2}","{3}"' -f $id, $n, $p.Replace('"', '""'), $destPath.Replace('"', '""')) |
                Add-Content -LiteralPath $reportCsv -Encoding UTF8
        }
    }

    # Push subdirectories (pruned on next iteration)
    Get-ChildItem -LiteralPath $dir -Directory -Force -ErrorAction SilentlyContinue |
        ForEach-Object { $stack.Push($_.FullName) }
}

Write-Host ("Wrote list: {0}" -f $reportTxt)
Write-Host ("Wrote map : {0}" -f $reportCsv)
Write-Host ("Copied to : {0}" -f $copiesDir)
### END FILE: Sweep-RepoManifests-Pruned.ps1
