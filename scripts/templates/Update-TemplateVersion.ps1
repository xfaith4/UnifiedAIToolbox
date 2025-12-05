#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Manage template versions and changelog for CI/CD blueprints
.DESCRIPTION
    This script helps manage template versions, update changelogs, and validate version consistency.
.PARAMETER Action
    Action to perform: Show, Bump, Validate, Compare
.PARAMETER TemplateName
    Name of the template (default: ci-cd-blueprint)
.PARAMETER BumpType
    Type of version bump: Major, Minor, Patch
.PARAMETER Message
    Changelog message for the version update
.EXAMPLE
    ./Update-TemplateVersion.ps1 -Action Show
    Show current template version
.EXAMPLE
    ./Update-TemplateVersion.ps1 -Action Bump -BumpType Minor -Message "Added new workflow"
    Bump minor version and update changelog
.EXAMPLE
    ./Update-TemplateVersion.ps1 -Action Validate
    Validate version consistency across template files
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [ValidateSet('Show', 'Bump', 'Validate', 'Compare')]
    [string]$Action = 'Show',
    
    [Parameter(Mandatory = $false)]
    [string]$TemplateName = 'ci-cd-blueprint',
    
    [Parameter(Mandatory = $false)]
    [ValidateSet('Major', 'Minor', 'Patch')]
    [string]$BumpType,
    
    [Parameter(Mandatory = $false)]
    [string]$Message
)

$ErrorActionPreference = 'Stop'

# Configuration
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$templatesPath = Join-Path $repoRoot 'templates'
$templatePath = Join-Path $templatesPath $TemplateName

# ============================================================================
# Version Management Functions
# ============================================================================

function Get-TemplateVersion {
    param([string]$Path)
    
    $versionFile = Join-Path $Path 'VERSION'
    if (-not (Test-Path $versionFile)) {
        Write-Warning "VERSION file not found at: $versionFile"
        return $null
    }
    
    $version = (Get-Content $versionFile -Raw).Trim()
    
    # Validate semantic version format
    if ($version -notmatch '^\d+\.\d+\.\d+$') {
        Write-Warning "Invalid version format: $version (expected: X.Y.Z)"
        return $null
    }
    
    return $version
}

function Set-TemplateVersion {
    param(
        [string]$Path,
        [string]$Version
    )
    
    $versionFile = Join-Path $Path 'VERSION'
    Set-Content -Path $versionFile -Value $Version
    Write-Host "✅ Updated VERSION file to: $Version" -ForegroundColor Green
}

function Get-NextVersion {
    param(
        [string]$CurrentVersion,
        [string]$BumpType
    )
    
    $parts = $CurrentVersion -split '\.'
    $major = [int]$parts[0]
    $minor = [int]$parts[1]
    $patch = [int]$parts[2]
    
    switch ($BumpType) {
        'Major' {
            $major++
            $minor = 0
            $patch = 0
        }
        'Minor' {
            $minor++
            $patch = 0
        }
        'Patch' {
            $patch++
        }
    }
    
    return "$major.$minor.$patch"
}

function Update-Changelog {
    param(
        [string]$Path,
        [string]$Version,
        [string]$Message
    )
    
    $changelogFile = Join-Path $Path 'CHANGELOG.md'
    if (-not (Test-Path $changelogFile)) {
        Write-Warning "CHANGELOG.md not found at: $changelogFile"
        return
    }
    
    $date = Get-Date -Format "yyyy-MM-dd"
    $newEntry = @"

## [$Version] - $date

### Changed
- $Message

"@
    
    # Read current changelog
    $content = Get-Content $changelogFile -Raw
    
    # Find where to insert (after the main header and before first version)
    $headerPattern = '(?s)(# Changelog.*?)(## \[)'
    if ($content -match $headerPattern) {
        $newContent = $content -replace $headerPattern, "`$1$newEntry`$2"
        Set-Content -Path $changelogFile -Value $newContent -NoNewline
        Write-Host "✅ Updated CHANGELOG.md with version $Version" -ForegroundColor Green
    }
    else {
        Write-Warning "Could not find proper location to insert changelog entry"
    }
}

function Show-TemplateInfo {
    param([string]$Path)
    
    $version = Get-TemplateVersion -Path $Path
    $versionFile = Join-Path $Path 'VERSION'
    $changelogFile = Join-Path $Path 'CHANGELOG.md'
    $readmeFile = Join-Path $Path 'README.md'
    
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  Template: $TemplateName" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    
    if ($version) {
        Write-Host "📦 Version: $version" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Version: Not found or invalid" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "📁 Files:" -ForegroundColor Cyan
    Write-Host "  VERSION:    $(if (Test-Path $versionFile) { '✓' } else { '✗' })" -ForegroundColor Gray
    Write-Host "  CHANGELOG:  $(if (Test-Path $changelogFile) { '✓' } else { '✗' })" -ForegroundColor Gray
    Write-Host "  README:     $(if (Test-Path $readmeFile) { '✓' } else { '✗' })" -ForegroundColor Gray
    
    # Show recent changelog entries
    if (Test-Path $changelogFile) {
        Write-Host ""
        Write-Host "📝 Recent Changes:" -ForegroundColor Cyan
        $content = Get-Content $changelogFile -Raw
        if ($content -match '## \[([^\]]+)\][^\n]*\n((?:(?!## \[).)*)', 'Singleline') {
            $latestVersion = $Matches[1]
            $latestChanges = $Matches[2].Trim()
            Write-Host "  Version $latestVersion" -ForegroundColor Yellow
            $latestChanges -split '\n' | Select-Object -First 5 | ForEach-Object {
                if ($_.Trim()) {
                    Write-Host "    $_" -ForegroundColor Gray
                }
            }
        }
    }
    
    Write-Host ""
}

function Invoke-VersionBump {
    param(
        [string]$Path,
        [string]$BumpType,
        [string]$Message
    )
    
    if (-not $Message) {
        Write-Error "Message is required for version bump. Use -Message parameter."
        return
    }
    
    $currentVersion = Get-TemplateVersion -Path $Path
    if (-not $currentVersion) {
        Write-Error "Cannot bump version - current version is invalid or not found"
        return
    }
    
    $newVersion = Get-NextVersion -CurrentVersion $currentVersion -BumpType $BumpType
    
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  Version Bump: $BumpType" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Current Version: $currentVersion" -ForegroundColor Yellow
    Write-Host "New Version:     $newVersion" -ForegroundColor Green
    Write-Host "Message:         $Message" -ForegroundColor Gray
    Write-Host ""
    
    # Confirm
    $confirm = Read-Host "Proceed with version bump? (y/N)"
    if ($confirm -ne 'y') {
        Write-Host "Version bump cancelled." -ForegroundColor Yellow
        return
    }
    
    # Update VERSION file
    Set-TemplateVersion -Path $Path -Version $newVersion
    
    # Update CHANGELOG
    Update-Changelog -Path $Path -Version $newVersion -Message $Message
    
    Write-Host ""
    Write-Host "✅ Version bump complete!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "  1. Review the changes: git diff" -ForegroundColor Gray
    Write-Host "  2. Commit the changes: git add . && git commit -m 'Bump template version to $newVersion'" -ForegroundColor Gray
    Write-Host "  3. Tag the release: git tag -a v$newVersion -m 'Template version $newVersion'" -ForegroundColor Gray
    Write-Host ""
}

function Invoke-Validation {
    param([string]$Path)
    
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  Template Validation" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    
    $issues = @()
    
    # Check VERSION file
    $versionFile = Join-Path $Path 'VERSION'
    if (-not (Test-Path $versionFile)) {
        $issues += "❌ VERSION file not found"
    } else {
        $version = Get-TemplateVersion -Path $Path
        if ($version) {
            Write-Host "✅ VERSION file valid: $version" -ForegroundColor Green
        } else {
            $issues += "❌ VERSION file has invalid format"
        }
    }
    
    # Check CHANGELOG file
    $changelogFile = Join-Path $Path 'CHANGELOG.md'
    if (-not (Test-Path $changelogFile)) {
        $issues += "❌ CHANGELOG.md not found"
    } else {
        Write-Host "✅ CHANGELOG.md exists" -ForegroundColor Green
        
        # Check if changelog has proper format
        $content = Get-Content $changelogFile -Raw
        if ($content -match '## \[\d+\.\d+\.\d+\]') {
            Write-Host "✅ CHANGELOG.md has proper version entries" -ForegroundColor Green
        } else {
            $issues += "⚠️  CHANGELOG.md may not have proper version entries"
        }
    }
    
    # Check README file
    $readmeFile = Join-Path $Path 'README.md'
    if (-not (Test-Path $readmeFile)) {
        $issues += "⚠️  README.md not found"
    } else {
        Write-Host "✅ README.md exists" -ForegroundColor Green
    }
    
    # Check for required directories
    $requiredDirs = @('workflows', 'scripts', 'docs')
    foreach ($dir in $requiredDirs) {
        $dirPath = Join-Path $Path $dir
        if (Test-Path $dirPath) {
            Write-Host "✅ Directory exists: $dir" -ForegroundColor Green
        } else {
            $issues += "⚠️  Directory not found: $dir"
        }
    }
    
    Write-Host ""
    if ($issues.Count -eq 0) {
        Write-Host "✅ All validation checks passed!" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Validation found $($issues.Count) issue(s):" -ForegroundColor Yellow
        foreach ($issue in $issues) {
            Write-Host "  $issue" -ForegroundColor Yellow
        }
    }
    Write-Host ""
}

function Invoke-Comparison {
    param([string]$Path)
    
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  Template Version Comparison" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host ""
    
    $version = Get-TemplateVersion -Path $Path
    if (-not $version) {
        Write-Error "Cannot compare - current version is invalid or not found"
        return
    }
    
    Write-Host "Current Version: $version" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Available versions in CHANGELOG:" -ForegroundColor Yellow
    
    $changelogFile = Join-Path $Path 'CHANGELOG.md'
    if (Test-Path $changelogFile) {
        $content = Get-Content $changelogFile -Raw
        $versions = [regex]::Matches($content, '## \[([^\]]+)\]')
        
        foreach ($match in $versions) {
            $ver = $match.Groups[1].Value
            $isCurrent = $ver -eq $version
            $indicator = if ($isCurrent) { " <-- Current" } else { "" }
            $color = if ($isCurrent) { 'Green' } else { 'Gray' }
            Write-Host "  $ver$indicator" -ForegroundColor $color
        }
    }
    
    Write-Host ""
}

# ============================================================================
# Main Execution
# ============================================================================

if (-not (Test-Path $templatePath)) {
    Write-Error "Template not found at: $templatePath"
    exit 1
}

switch ($Action) {
    'Show' {
        Show-TemplateInfo -Path $templatePath
    }
    
    'Bump' {
        if (-not $BumpType) {
            Write-Error "BumpType is required for Bump action. Use -BumpType Major|Minor|Patch"
            exit 1
        }
        Invoke-VersionBump -Path $templatePath -BumpType $BumpType -Message $Message
    }
    
    'Validate' {
        Invoke-Validation -Path $templatePath
    }
    
    'Compare' {
        Invoke-Comparison -Path $templatePath
    }
}
