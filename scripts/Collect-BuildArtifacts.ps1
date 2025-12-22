#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Collects build artifacts from all apps into standardized output directories
.DESCRIPTION
    This script:
    - Scans for build outputs across all apps (dashboard, webapp, desktop, etc.)
    - Copies artifacts to a standardized ./artifacts directory structure
    - Creates manifest files documenting what was collected
    - Supports both CI and local development workflows
.PARAMETER OutputRoot
    Root directory for collected artifacts (default: ./artifacts)
.PARAMETER Clean
    Clean the output directory before collecting artifacts
.PARAMETER Manifest
    Generate a manifest file listing all collected artifacts
.EXAMPLE
    .\Collect-BuildArtifacts.ps1
    Collect all build artifacts to ./artifacts
.EXAMPLE
    .\Collect-BuildArtifacts.ps1 -Clean -Manifest
    Clean artifacts directory, collect artifacts, and generate manifest
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$OutputRoot = "artifacts",
    
    [Parameter(Mandatory = $false)]
    [switch]$Clean,
    
    [Parameter(Mandatory = $false)]
    [switch]$Manifest = $true
)

$ErrorActionPreference = 'Continue'
$WarningPreference = 'Continue'

# ANSI colors
$Colors = @{
    Green  = "`e[32m"
    Yellow = "`e[33m"
    Red    = "`e[31m"
    Blue   = "`e[34m"
    Cyan   = "`e[36m"
    Reset  = "`e[0m"
}

Write-Host "$($Colors.Cyan)═══════════════════════════════════════════════════════════$($Colors.Reset)"
Write-Host "$($Colors.Cyan)        Build Artifacts Collection$($Colors.Reset)"
Write-Host "$($Colors.Cyan)═══════════════════════════════════════════════════════════$($Colors.Reset)"
Write-Host ""

# Resolve absolute paths
$repoRoot = Get-Location
$artifactsRoot = Join-Path $repoRoot $OutputRoot

# Clean if requested
if ($Clean -and (Test-Path $artifactsRoot)) {
    Write-Host "Cleaning artifacts directory..." -ForegroundColor Yellow
    Remove-Item $artifactsRoot -Recurse -Force
    Write-Host "  ✓ Cleaned: $artifactsRoot" -ForegroundColor Green
}

# Create artifacts directory structure
$artifactDirs = @(
    "builds/dashboard"
    "builds/webapp"
    "builds/desktop"
    "builds/api"
    "reports"
    "logs"
    "packages"
)

Write-Host "Creating artifact directory structure..." -ForegroundColor Cyan
foreach ($dir in $artifactDirs) {
    $fullPath = Join-Path $artifactsRoot $dir
    if (-not (Test-Path $fullPath)) {
        New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
        Write-Host "  ✓ Created: $dir" -ForegroundColor Green
    }
}

# Initialize manifest
$manifestData = @{
    timestamp = (Get-Date -Format "o")
    repository = "UnifiedAIToolbox"
    artifacts = @()
}

# ============================================================================
# Helper Functions
# ============================================================================

function Copy-ArtifactDirectory {
    param(
        [string]$Source,
        [string]$Destination,
        [string]$Description
    )
    
    if (Test-Path $Source) {
        try {
            Copy-Item -Path $Source -Destination $Destination -Recurse -Force
            
            $fileCount = (Get-ChildItem -Path $Destination -Recurse -File).Count
            $totalSize = (Get-ChildItem -Path $Destination -Recurse -File | Measure-Object -Property Length -Sum).Sum
            $sizeMB = [math]::Round($totalSize / 1MB, 2)
            
            Write-Host "  ✓ $Description" -ForegroundColor Green
            Write-Host "    Files: $fileCount | Size: $sizeMB MB" -ForegroundColor Gray
            
            # Add to manifest
            $manifestData.artifacts += @{
                type = $Description
                source = $Source
                destination = $Destination
                file_count = $fileCount
                size_mb = $sizeMB
            }
            
            return $true
        }
        catch {
            Write-Warning "Failed to copy $Description : $_"
            return $false
        }
    }
    else {
        Write-Host "  ⊘ $Description - Not found" -ForegroundColor Yellow
        return $false
    }
}

# ============================================================================
# Collect Dashboard Build (React/Vite)
# ============================================================================
Write-Host ""
Write-Host "Collecting Dashboard artifacts..." -ForegroundColor Cyan

$dashboardDist = Join-Path $repoRoot "apps/dashboard/dist"
$dashboardOut = Join-Path $artifactsRoot "builds/dashboard"

Copy-ArtifactDirectory -Source $dashboardDist -Destination $dashboardOut -Description "Dashboard Build"

# ============================================================================
# Collect Unified Web App Build (Next.js)
# ============================================================================
Write-Host ""
Write-Host "Collecting Unified Web App artifacts..." -ForegroundColor Cyan

$webappBuild = Join-Path $repoRoot "apps/unifiedtoolbox.webapp/.next"
$webappOut = Join-Path $artifactsRoot "builds/webapp"

Copy-ArtifactDirectory -Source $webappBuild -Destination $webappOut -Description "Unified Web App Build"

# Also collect standalone build if it exists
$webappStandalone = Join-Path $repoRoot "apps/unifiedtoolbox.webapp/out"
if (Test-Path $webappStandalone) {
    $standaloneOut = Join-Path $artifactsRoot "builds/webapp-standalone"
    Copy-ArtifactDirectory -Source $webappStandalone -Destination $standaloneOut -Description "Web App Standalone"
}

# ============================================================================
# Collect Desktop App Builds (.NET)
# ============================================================================
Write-Host ""
Write-Host "Collecting Desktop App artifacts..." -ForegroundColor Cyan

# OrchestrationDesktop
$desktopBinRelease = Join-Path $repoRoot "apps/OrchestrationDesktop/bin/Release"
$desktopBinDebug = Join-Path $repoRoot "apps/OrchestrationDesktop/bin/Debug"

if (Test-Path $desktopBinRelease) {
    $desktopOut = Join-Path $artifactsRoot "builds/desktop/OrchestrationDesktop"
    Copy-ArtifactDirectory -Source $desktopBinRelease -Destination $desktopOut -Description "OrchestrationDesktop (Release)"
}
elseif (Test-Path $desktopBinDebug) {
    $desktopOut = Join-Path $artifactsRoot "builds/desktop/OrchestrationDesktop"
    Copy-ArtifactDirectory -Source $desktopBinDebug -Destination $desktopOut -Description "OrchestrationDesktop (Debug)"
}

# OrchestrationDesktopLauncher
$launcherBinRelease = Join-Path $repoRoot "apps/OrchestrationDesktopLauncher/bin/Release"
$launcherBinDebug = Join-Path $repoRoot "apps/OrchestrationDesktopLauncher/bin/Debug"

if (Test-Path $launcherBinRelease) {
    $launcherOut = Join-Path $artifactsRoot "builds/desktop/OrchestrationDesktopLauncher"
    Copy-ArtifactDirectory -Source $launcherBinRelease -Destination $launcherOut -Description "OrchestrationDesktopLauncher (Release)"
}
elseif (Test-Path $launcherBinDebug) {
    $launcherOut = Join-Path $artifactsRoot "builds/desktop/OrchestrationDesktopLauncher"
    Copy-ArtifactDirectory -Source $launcherBinDebug -Destination $launcherOut -Description "OrchestrationDesktopLauncher (Debug)"
}

# ============================================================================
# Collect Prompt Database
# ============================================================================
Write-Host ""
Write-Host "Collecting Prompt Database..." -ForegroundColor Cyan

$promptDb = Join-Path $repoRoot "data/prompts.db"
if (Test-Path $promptDb) {
    $dbOut = Join-Path $artifactsRoot "packages/prompts.db"
    Copy-Item -Path $promptDb -Destination $dbOut -Force
    
    $dbSize = [math]::Round((Get-Item $promptDb).Length / 1MB, 2)
    Write-Host "  ✓ Prompt Database" -ForegroundColor Green
    Write-Host "    Size: $dbSize MB" -ForegroundColor Gray
    
    $manifestData.artifacts += @{
        type = "Prompt Database"
        source = $promptDb
        destination = $dbOut
        size_mb = $dbSize
    }
}

# ============================================================================
# Collect Analysis Reports
# ============================================================================
Write-Host ""
Write-Host "Collecting Analysis Reports..." -ForegroundColor Cyan

# Check for repo analysis reports
$repoAnalysisDir = Join-Path $artifactsRoot "repo-analysis"
if (Test-Path $repoAnalysisDir) {
    $reportsOut = Join-Path $artifactsRoot "reports/repo-analysis"
    Copy-ArtifactDirectory -Source $repoAnalysisDir -Destination $reportsOut -Description "Repository Analysis Reports"
}

# Check for prompt analysis reports
$promptAnalysisDir = Join-Path $artifactsRoot "prompt-analysis"
if (Test-Path $promptAnalysisDir) {
    $reportsOut = Join-Path $artifactsRoot "reports/prompt-analysis"
    Copy-ArtifactDirectory -Source $promptAnalysisDir -Destination $reportsOut -Description "Prompt Analysis Reports"
}

# ============================================================================
# Collect Logs (if any)
# ============================================================================
Write-Host ""
Write-Host "Collecting Logs..." -ForegroundColor Cyan

$logPatterns = @("*.log", "*.txt")
$logLocations = @(
    "Orchestration/UnifiedPromptApp/services/prompt-api/logs"
    "logs"
    "data/logs"
)

foreach ($logLoc in $logLocations) {
    $fullLogPath = Join-Path $repoRoot $logLoc
    if (Test-Path $fullLogPath) {
        foreach ($pattern in $logPatterns) {
            $logFiles = Get-ChildItem -Path $fullLogPath -Filter $pattern -File -ErrorAction SilentlyContinue
            if ($logFiles) {
                foreach ($log in $logFiles) {
                    $logOut = Join-Path $artifactsRoot "logs/$($log.Name)"
                    Copy-Item -Path $log.FullName -Destination $logOut -Force
                    Write-Host "  ✓ Log: $($log.Name)" -ForegroundColor Green
                }
            }
        }
    }
}

# ============================================================================
# Generate Manifest
# ============================================================================
if ($Manifest) {
    Write-Host ""
    Write-Host "Generating manifest..." -ForegroundColor Cyan
    
    $manifestPath = Join-Path $artifactsRoot "manifest.json"
    
    # Add summary
    $manifestData.summary = @{
        total_artifacts = $manifestData.artifacts.Count
        total_size_mb = [math]::Round(($manifestData.artifacts | Measure-Object -Property size_mb -Sum).Sum, 2)
        output_root = $artifactsRoot
    }
    
    $manifestData | ConvertTo-Json -Depth 10 | Out-File $manifestPath -Encoding UTF8
    
    Write-Host "  ✓ Manifest: $manifestPath" -ForegroundColor Green
}

# ============================================================================
# Summary
# ============================================================================
Write-Host ""
Write-Host "$($Colors.Cyan)═══════════════════════════════════════════════════════════$($Colors.Reset)"
Write-Host "$($Colors.Cyan)                    Summary$($Colors.Reset)"
Write-Host "$($Colors.Cyan)═══════════════════════════════════════════════════════════$($Colors.Reset)"
Write-Host ""

$totalArtifacts = $manifestData.artifacts.Count
$totalSize = [math]::Round(($manifestData.artifacts | Measure-Object -Property size_mb -Sum).Sum, 2)

Write-Host "Total Artifacts: $($Colors.Green)$totalArtifacts$($Colors.Reset)"
Write-Host "Total Size: $($Colors.Green)$totalSize MB$($Colors.Reset)"
Write-Host "Output Location: $($Colors.Yellow)$artifactsRoot$($Colors.Reset)"
Write-Host ""
Write-Host "$($Colors.Green)✓ Artifact collection complete!$($Colors.Reset)"
Write-Host ""

# Create README in artifacts directory
$readmePath = Join-Path $artifactsRoot "README.md"
$readmeContent = @'
# Build Artifacts

This directory contains build artifacts collected from the Unified AI Toolbox repository.

## Collection Details

- **Timestamp**: {0}
- **Total Artifacts**: {1}
- **Total Size**: {2} MB

## Directory Structure

```
artifacts/
├── builds/
│   ├── dashboard/       # React/Vite dashboard build
│   ├── webapp/          # Next.js web app build
│   ├── desktop/         # .NET desktop apps
│   └── api/             # API builds
├── reports/             # Analysis and health reports
├── logs/                # Build and runtime logs
└── packages/            # Packaged artifacts (databases, etc.)
```

## Usage

### Dashboard
The dashboard build is a static site that can be served by any web server:
```bash
cd builds/dashboard
npx serve .
```

### Web App
The Next.js build requires the Next.js server to run:
```bash
cd builds/webapp
npm start
```

### Desktop Apps
Desktop apps are compiled .NET executables for Windows:
```
builds/desktop/OrchestrationDesktop/
builds/desktop/OrchestrationDesktopLauncher/
```

## Manifest

See `manifest.json` for a detailed list of all collected artifacts with metadata.

## Notes

- This directory is automatically generated by the build process
- Artifacts are retained for 30-90 days in CI/CD workflows
- Local artifacts can be cleaned with: `pwsh scripts/Collect-BuildArtifacts.ps1 -Clean`
'@ -f $manifestData.timestamp, $totalArtifacts, $totalSize

$readmeContent | Out-File $readmePath -Encoding UTF8

return $manifestData
