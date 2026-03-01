[CmdletBinding()]
param(
  [Parameter()]
  [string]$RepoRoot = (Get-Location).Path,

  [Parameter()]
  [string]$OutDir = (Join-Path (Get-Location).Path "_repo_inventory"),

  [Parameter()]
  [ValidateRange(1, 100)]
  [int]$TreeDepth = 6,

  [Parameter()]
  [ValidateRange(0, 10485760)]
  [int]$PeekMaxBytes = 4096,

  [Parameter()]
  [switch]$NoPeek,

  [Parameter()]
  [switch]$NoHash,

  # If hashing is enabled, skip hashing files larger than this many bytes (default: 200MB)
  [Parameter()]
  [ValidateRange(0, [int64]::MaxValue)]
  [int64]$HashMaxBytes = 200MB,

  # Optional extra ignore directory names (segments), e.g. @("target",".idea")
  [Parameter()]
  [string[]]$ExtraIgnoreDirs = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ----------------------------
# Helpers
# ----------------------------

function Ensure-Dir {
  param([Parameter(Mandatory)][string]$Path)
  if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

# Build an ignore-regex that matches directory segments, not arbitrary substrings.
# Example match: "\node_modules\" or end/start boundaries.
$defaultIgnoreDirs = @(
  ".git", "node_modules", "dist", "build", "out", ".next", ".turbo", ".cache",
  "coverage", "bin", "obj", ".venv", "venv", "runs", "artifacts", ".pytest_cache", "__pycache__"
)
$allIgnoreDirs = @($defaultIgnoreDirs + $ExtraIgnoreDirs) | Where-Object { $_ } | Select-Object -Unique

# Escape each segment to be safe in regex
$escaped = $allIgnoreDirs | ForEach-Object { [Regex]::Escape($_) }
$ignoreRegex = if ($escaped.Count -gt 0) {
  # match path segment: (^|[\\/])(seg1|seg2|...)([\\/]|$)
  [Regex]::new("(^|[\\/])(" + ($escaped -join "|") + ")([\\/]|$)", 'IgnoreCase,Compiled')
}
else {
  $null
}

function Test-IgnoredPath {
  param([Parameter(Mandatory)][string]$FullPath)
  if ($null -eq $ignoreRegex) { return $false }
  $p = $FullPath.Replace('/', '\')
  return $ignoreRegex.IsMatch($p)
}

function Get-RelPathFast {
  param(
    [Parameter(Mandatory)][string]$BaseFull,
    [Parameter(Mandatory)][string]$PathFull
  )
  # fast path: substring
  if ($PathFull.StartsWith($BaseFull, [StringComparison]::OrdinalIgnoreCase)) {
    return $PathFull.Substring($BaseFull.Length).TrimStart('\', '/')
  }

  # fallback: URI relative
  $baseUri = [Uri]::new($BaseFull + [IO.Path]::DirectorySeparatorChar)
  $pathUri = [Uri]::new($PathFull)
  return [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($pathUri).ToString()).Replace('/', '\')
}

function Get-FileSha256 {
  param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][int64]$Length)

  if ($NoHash) { return $null }
  if ($HashMaxBytes -gt 0 -and $Length -gt $HashMaxBytes) { return $null }

  try {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
      $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
      try {
        $hash = $sha.ComputeHash($fs)
        return -join ($hash | ForEach-Object { $_.ToString("x2") })
      }
      finally { $fs.Dispose() }
    }
    finally { $sha.Dispose() }
  }
  catch {
    return $null
  }
}

$textExts = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
@(
  ".ps1", ".psm1", ".psd1", ".ts", ".tsx", ".js", ".jsx", ".json", ".yml", ".yaml", ".md", ".txt",
  ".html", ".css", ".xml", ".toml", ".ini", ".env", ".py", ".cs", ".sql"
) | ForEach-Object { [void]$textExts.Add($_) }

function Peek-TextFile {
  param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Ext)

  if ($NoPeek -or $PeekMaxBytes -le 0) { return $null }
  if (-not $textExts.Contains($Ext)) { return $null }

  try {
    $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    try {
      $take = [Math]::Min([int]$fs.Length, $PeekMaxBytes)
      if ($take -le 0) { return $null }

      $buf = New-Object byte[] $take
      $read = $fs.Read($buf, 0, $take)
      if ($read -le 0) { return $null }

      # Decode as UTF-8 sample; strip NULs and normalize newlines.
      $sample = [System.Text.Encoding]::UTF8.GetString($buf, 0, $read)
      return ($sample -replace "`r`n", "`n" -replace "`0", "").Trim()
    }
    finally { $fs.Dispose() }
  }
  catch {
    return $null
  }
}

function Get-DirTree {
  param([Parameter(Mandatory)][string]$Root, [Parameter(Mandatory)][int]$MaxDepth)

  $sb = [System.Text.StringBuilder]::new()
  $rootFull = [IO.Path]::GetFullPath($Root)
  [void]$sb.AppendLine($rootFull)

  function Recurse([string]$Dir, [int]$Depth, [string]$Prefix) {
    if ($Depth -ge $MaxDepth) { return }

    $dirs = @()
    try {
      $dirs = [System.IO.Directory]::EnumerateDirectories($Dir) |
        Where-Object { -not (Test-IgnoredPath $_) } |
        Sort-Object
    }
    catch { return }

    for ($i = 0; $i -lt $dirs.Count; $i++) {
      $child = $dirs[$i]
      $name = [IO.Path]::GetFileName($child)
      $isLast = ($i -eq ($dirs.Count - 1))
      $branch = if ($isLast) { "└── " } else { "├── " }
      $nextPrefix = $Prefix + (if ($isLast) { "    " } else { "│   " })
      [void]$sb.AppendLine("$Prefix$branch$name")
      Recurse -Dir $child -Depth ($Depth + 1) -Prefix $nextPrefix
    }
  }

  Recurse -Dir $rootFull -Depth 0 -Prefix ""
  return $sb.ToString()
}

# Keep top-N lists without sorting the whole inventory repeatedly
function Add-ToTopN {
  param(
    [Parameter(Mandatory)]$List,
    [Parameter(Mandatory)]$Item,
    [Parameter(Mandatory)][int]$N,
    [Parameter(Mandatory)][scriptblock]$KeySelector,
    [switch]$Descending
  )

  $List.Add($Item) | Out-Null
  if ($List.Count -le $N) {
    return
  }

  # Sort just this small list and trim
  if ($Descending) {
    $sorted = $List | Sort-Object -Property @{Expression = $KeySelector } -Descending
  }
  else {
    $sorted = $List | Sort-Object -Property @{Expression = $KeySelector }
  }

  $List.Clear()
  foreach ($x in ($sorted | Select-Object -First $N)) { $List.Add($x) | Out-Null }
}

# ----------------------------
# Main
# ----------------------------

Ensure-Dir $OutDir

$repoRootResolved = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $RepoRoot).Path)
$outDirResolved = [IO.Path]::GetFullPath($OutDir)

$outTxt = Join-Path $outDirResolved "repo_inventory.txt"
$outJson = Join-Path $outDirResolved "repo_inventory.json"

Write-Host "RepoRoot: $repoRootResolved"
Write-Host "OutDir:   $outDirResolved"

# Ensure base has trailing separator for fast relpath substring
$baseForRel = $repoRootResolved.TrimEnd('\', '/') + '\'

$files = [System.Collections.Generic.List[object]]::new()
$topLargest = [System.Collections.Generic.List[object]]::new()
$topRecent = [System.Collections.Generic.List[object]]::new()

$extStats = @{}  # ext -> @{ count=int; totalBytes=int64 }
$totalBytes = [int64]0
$fileCount = 0

# Enumerate directories iteratively to avoid deep recursion limits
$stack = [System.Collections.Generic.Stack[string]]::new()
$stack.Push($repoRootResolved)

while ($stack.Count -gt 0) {
  $dir = $stack.Pop()
  if (Test-IgnoredPath $dir) { continue }

  # Add subdirectories
  try {
    foreach ($sub in [System.IO.Directory]::EnumerateDirectories($dir)) {
      if (-not (Test-IgnoredPath $sub)) { $stack.Push($sub) }
    }
  }
  catch { }

  # Add files
  try {
    foreach ($path in [System.IO.Directory]::EnumerateFiles($dir)) {
      if (Test-IgnoredPath $path) { continue }

      $fi = [System.IO.FileInfo]::new($path)
      $ext = ($fi.Extension ?? "").ToLowerInvariant()

      $rel = Get-RelPathFast -BaseFull $baseForRel -PathFull $fi.FullName
      $lw = $fi.LastWriteTimeUtc

      $sha = Get-FileSha256 -Path $fi.FullName -Length $fi.Length
      $peek = Peek-TextFile -Path $fi.FullName -Ext $ext

      $obj = [pscustomobject]@{
        relPath      = $rel
        lengthBytes  = [int64]$fi.Length
        lastWriteUtc = $lw.ToString("o")
        ext          = $ext
        sha256       = $sha
        peek         = $peek
      }

      $files.Add($obj) | Out-Null
      $fileCount++
      $totalBytes += [int64]$fi.Length

      if (-not $extStats.ContainsKey($ext)) {
        $extStats[$ext] = @{ count = 0; totalBytes = [int64]0 }
      }
      $extStats[$ext].count++
      $extStats[$ext].totalBytes += [int64]$fi.Length

      Add-ToTopN -List $topLargest -Item $obj -N 50 -KeySelector { $_.lengthBytes } -Descending
      Add-ToTopN -List $topRecent -Item $obj -N 50 -KeySelector { $_.lastWriteUtc } -Descending
    }
  }
  catch { }
}

# Build ext summary objects
$byExt =
$extStats.GetEnumerator() |
  ForEach-Object {
    [pscustomobject]@{
      ext        = $_.Key
      count      = $_.Value.count
      totalBytes = $_.Value.totalBytes
    }
  } |
  Sort-Object count -Descending

$tree = Get-DirTree -Root $repoRootResolved -MaxDepth $TreeDepth

# JSON output (keep depth reasonable to avoid surprises) [4](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/convertto-json?view=powershell-7.5)[5](https://blog.ironmansoftware.com/convertto-json-memory/)
$report = [pscustomobject]@{
  generatedUtc = (Get-Date).ToUniversalTime().ToString("o")
  repoRoot     = $repoRootResolved
  fileCount    = $fileCount
  totalBytes   = $totalBytes
  treeDepth    = $TreeDepth
  settings     = [pscustomobject]@{
    peekMaxBytes = $PeekMaxBytes
    noPeek       = [bool]$NoPeek
    noHash       = [bool]$NoHash
    hashMaxBytes = $HashMaxBytes
    ignoredDirs  = $allIgnoreDirs
  }
  tree         = $tree
  files        = $files
  extSummary   = $byExt
  topLargest   = $topLargest
  topRecent    = $topRecent
}

$report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $outJson -Encoding UTF8

# Text output
$sb = [System.Text.StringBuilder]::new()
[void]$sb.AppendLine("=== REPO INVENTORY ===")
[void]$sb.AppendLine("Generated (UTC): $((Get-Date).ToUniversalTime().ToString("o"))")
[void]$sb.AppendLine("RepoRoot: $repoRootResolved")
[void]$sb.AppendLine("Files: $fileCount")
[void]$sb.AppendLine(("TotalBytes: {0:n0}" -f $totalBytes))
[void]$sb.AppendLine("")
[void]$sb.AppendLine("=== DIRECTORY TREE (depth $TreeDepth) ===")
[void]$sb.AppendLine($tree)
[void]$sb.AppendLine("")
[void]$sb.AppendLine("=== EXT SUMMARY (top 30) ===")
[void]$sb.AppendLine("ext`tcount`ttotalBytes")
foreach ($row in ($byExt | Select-Object -First 30)) {
  [void]$sb.AppendLine("$($row.ext)`t$($row.count)`t$($row.totalBytes)")
}
[void]$sb.AppendLine("")
[void]$sb.AppendLine("=== TOP 50 LARGEST FILES ===")
[void]$sb.AppendLine("bytes`tsha256`tpath")
foreach ($row in ($topLargest | Sort-Object lengthBytes -Descending)) {
  [void]$sb.AppendLine("$($row.lengthBytes)`t$($row.sha256)`t$($row.relPath)")
}
[void]$sb.AppendLine("")
[void]$sb.AppendLine("=== TOP 50 MOST RECENTLY MODIFIED (UTC) ===")
[void]$sb.AppendLine("lastWriteUtc`tsha256`tpath")
foreach ($row in ($topRecent | Sort-Object lastWriteUtc -Descending)) {
  [void]$sb.AppendLine("$($row.lastWriteUtc)`t$($row.sha256)`t$($row.relPath)")
}

$sb.ToString() | Set-Content -LiteralPath $outTxt -Encoding UTF8

Write-Host "Wrote:"
Write-Host "  $outTxt"
Write-Host "  $outJson"
