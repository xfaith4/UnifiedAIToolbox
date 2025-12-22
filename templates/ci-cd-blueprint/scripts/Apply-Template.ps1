#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Applies CI/CD template to a target repository
.DESCRIPTION
    Copies template files and replaces placeholders with actual values
.PARAMETER TargetDir
    Target repository directory
.PARAMETER ProjectName
    Project name to replace {{PROJECT_NAME}}
.PARAMETER RepositoryName
    Repository name to replace {{REPOSITORY_NAME}}
.PARAMETER BuildScript
    Build script path to replace {{BUILD_SCRIPT}}
.PARAMETER TestScript
    Test script path to replace {{TEST_SCRIPT}}
.PARAMETER AnalysisScript
    Analysis script path to replace {{ANALYSIS_SCRIPT}}
.PARAMETER DryRun
    Show what would be done without actually doing it
.EXAMPLE
    .\Apply-Template.ps1 -TargetDir ../MyProject -ProjectName "MyProject" -RepositoryName "user/myproject"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$TargetDir,
    
    [Parameter(Mandatory = $true)]
    [string]$ProjectName,
    
    [Parameter(Mandatory = $false)]
    [string]$RepositoryName = "",
    
    [Parameter(Mandatory = $false)]
    [string]$BuildScript = "./build.sh",
    
    [Parameter(Mandatory = $false)]
    [string]$TestScript = "./test.sh",
    
    [Parameter(Mandatory = $false)]
    [string]$AnalysisScript = "./scripts/Run-Analysis.ps1",
    
    [Parameter(Mandatory = $false)]
    [switch]$DryRun,
    
    [Parameter(Mandatory = $false)]
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$templateDir = Split-Path -Parent $PSScriptRoot

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  CI/CD Template Applicator" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Resolve paths
$TargetDir = Resolve-Path $TargetDir -ErrorAction Stop
Write-Host "Target directory: $TargetDir" -ForegroundColor Gray
Write-Host "Template directory: $templateDir" -ForegroundColor Gray

if ($DryRun) {
    Write-Host "`n[DRY RUN MODE - No changes will be made]" -ForegroundColor Yellow
}

# ============================================================================
# Validate Template
# ============================================================================

Write-Host "`n✓ Validating template..." -ForegroundColor Yellow

$validateScript = Join-Path $templateDir 'scripts' 'Validate-Template.ps1'
if (Test-Path $validateScript) {
    & $validateScript -TemplateDir $templateDir
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Template validation failed. Please fix errors first." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "  ⚠ Validation script not found, skipping validation" -ForegroundColor Yellow
}

# ============================================================================
# Prepare Replacements
# ============================================================================

Write-Host "`n✓ Preparing placeholder replacements..." -ForegroundColor Yellow

if (-not $RepositoryName) {
    $RepositoryName = $ProjectName
}

$replacements = @{
    '{{PROJECT_NAME}}' = $ProjectName
    '{{REPOSITORY_NAME}}' = $RepositoryName
    '{{BUILD_SCRIPT}}' = $BuildScript
    '{{TEST_SCRIPT}}' = $TestScript
    '{{ANALYSIS_SCRIPT}}' = $AnalysisScript
}

Write-Host "  Replacements:" -ForegroundColor Gray
foreach ($key in $replacements.Keys) {
    Write-Host "    $key → $($replacements[$key])" -ForegroundColor Gray
}

# ============================================================================
# Copy Workflows
# ============================================================================

Write-Host "`n✓ Copying workflow files..." -ForegroundColor Yellow

$workflowsSourceDir = Join-Path $templateDir 'workflows'
$workflowsTargetDir = Join-Path $TargetDir '.github' 'workflows'

if (-not (Test-Path $workflowsSourceDir)) {
    Write-Host "  ✗ Workflows directory not found in template" -ForegroundColor Red
    exit 1
}

$workflows = Get-ChildItem -Path $workflowsSourceDir -Filter '*.yml' -Recurse

foreach ($workflow in $workflows) {
    $relativePath = $workflow.FullName.Substring($workflowsSourceDir.Length).TrimStart('\', '/')
    $targetPath = Join-Path $workflowsTargetDir $relativePath
    $targetDir = Split-Path $targetPath -Parent
    
    if ($DryRun) {
        Write-Host "  [DRY RUN] Would copy: $($workflow.Name) → $targetPath" -ForegroundColor Cyan
    } else {
        # Create target directory if it doesn't exist
        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }
        
        # Read content and replace placeholders
        $content = Get-Content $workflow.FullName -Raw
        foreach ($key in $replacements.Keys) {
            $content = $content -replace [regex]::Escape($key), $replacements[$key]
        }
        
        # Write to target
        $content | Out-File $targetPath -Encoding UTF8
        Write-Host "  ✓ Copied: $($workflow.Name)" -ForegroundColor Green
    }
}

# ============================================================================
# Copy Scripts (Optional)
# ============================================================================

Write-Host "`n✓ Copying template scripts (optional)..." -ForegroundColor Yellow

$scriptsSourceDir = Join-Path $templateDir 'scripts'
$scriptsTargetDir = Join-Path $TargetDir 'scripts'

if (Test-Path $scriptsSourceDir) {
    $scripts = Get-ChildItem -Path $scriptsSourceDir -Filter '*.ps1' -Recurse |
        Where-Object { $_.Name -notlike 'Apply-Template.ps1' -and $_.Name -notlike 'Validate-Template.ps1' }
    
    if ($scripts.Count -gt 0) {
        foreach ($script in $scripts) {
            $relativePath = $script.FullName.Substring($scriptsSourceDir.Length).TrimStart('\', '/')
            $targetPath = Join-Path $scriptsTargetDir $relativePath
            $targetDir = Split-Path $targetPath -Parent
            
            # Ask before overwriting (unless Force is specified)
            if ((Test-Path $targetPath) -and -not $DryRun -and -not $Force) {
                $response = Read-Host "  Script $($script.Name) already exists. Overwrite? (y/N)"
                if ($response -ne 'y' -and $response -ne 'Y') {
                    Write-Host "  ⊝ Skipped: $($script.Name)" -ForegroundColor Gray
                    continue
                }
            }
            
            if ($DryRun) {
                Write-Host "  [DRY RUN] Would copy: $($script.Name) → $targetPath" -ForegroundColor Cyan
            } else {
                if (-not (Test-Path $targetDir)) {
                    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
                }
                
                # Read content and replace placeholders
                $content = Get-Content $script.FullName -Raw
                foreach ($key in $replacements.Keys) {
                    $content = $content -replace [regex]::Escape($key), $replacements[$key]
                }
                
                $content | Out-File $targetPath -Encoding UTF8
                Write-Host "  ✓ Copied: $($script.Name)" -ForegroundColor Green
            }
        }
    } else {
        Write-Host "  ⊝ No template scripts found" -ForegroundColor Gray
    }
}

# ============================================================================
# Copy Documentation
# ============================================================================

Write-Host "`n✓ Copying documentation..." -ForegroundColor Yellow

$docsSourceDir = Join-Path $templateDir 'docs'
$docsTargetDir = Join-Path $TargetDir 'docs' 'ci-cd'

if (Test-Path $docsSourceDir) {
    $docs = Get-ChildItem -Path $docsSourceDir -Filter '*.md' -Recurse
    
    foreach ($doc in $docs) {
        $targetPath = Join-Path $docsTargetDir $doc.Name
        $targetDir = Split-Path $targetPath -Parent
        
        if ($DryRun) {
            Write-Host "  [DRY RUN] Would copy: $($doc.Name) → $targetPath" -ForegroundColor Cyan
        } else {
            if (-not (Test-Path $targetDir)) {
                New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
            }
            
            # Read content and replace placeholders
            $content = Get-Content $doc.FullName -Raw
            foreach ($key in $replacements.Keys) {
                $content = $content -replace [regex]::Escape($key), $replacements[$key]
            }
            
            $content | Out-File $targetPath -Encoding UTF8
            Write-Host "  ✓ Copied: $($doc.Name)" -ForegroundColor Green
        }
    }
}

# ============================================================================
# Summary
# ============================================================================

Write-Host "`n==================================" -ForegroundColor Cyan
Write-Host "  Template Application Complete" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

if ($DryRun) {
    Write-Host "`nℹ This was a dry run. No files were modified." -ForegroundColor Yellow
    Write-Host "Run without -DryRun to apply changes." -ForegroundColor Yellow
} else {
    Write-Host "`n✓ Template applied successfully!" -ForegroundColor Green
    Write-Host "`nNext steps:" -ForegroundColor White
    Write-Host "  1. Review the copied workflow files in .github/workflows/" -ForegroundColor Gray
    Write-Host "  2. Configure required secrets in your repository settings" -ForegroundColor Gray
    Write-Host "  3. See docs/ci-cd/SECRETS_AND_ENV.md for required secrets" -ForegroundColor Gray
    Write-Host "  4. Commit and push to trigger your first workflow run" -ForegroundColor Gray
    Write-Host "`nDocumentation:" -ForegroundColor White
    Write-Host "  • Customization Guide: docs/ci-cd/CUSTOMIZATION_GUIDE.md" -ForegroundColor Gray
    Write-Host "  • Secrets & Environment: docs/ci-cd/SECRETS_AND_ENV.md" -ForegroundColor Gray
}
