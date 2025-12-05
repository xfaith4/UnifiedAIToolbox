#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Validates CI/CD template before applying to another repository
.DESCRIPTION
    Checks that:
    - All placeholders are documented
    - All files exist
    - Workflows have valid YAML syntax
    - Required secrets are documented
.PARAMETER TemplateDir
    Path to the template directory (defaults to parent of this script)
.EXAMPLE
    .\Validate-Template.ps1
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$TemplateDir = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  CI/CD Template Validator" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

$validationErrors = @()
$validationWarnings = @()

# ============================================================================
# Check 1: Template Directory Structure
# ============================================================================

Write-Host "✓ Checking template directory structure..." -ForegroundColor Yellow

$requiredDirs = @('workflows', 'scripts', 'docs')
foreach ($dir in $requiredDirs) {
    $path = Join-Path $TemplateDir $dir
    if (-not (Test-Path $path)) {
        $validationErrors += "Missing required directory: $dir"
    } else {
        Write-Host "  ✓ Found: $dir" -ForegroundColor Green
    }
}

# ============================================================================
# Check 2: Required Documentation Files
# ============================================================================

Write-Host "`n✓ Checking documentation files..." -ForegroundColor Yellow

$requiredDocs = @(
    'README.md',
    'docs/CUSTOMIZATION_GUIDE.md',
    'docs/SECRETS_AND_ENV.md'
)

foreach ($doc in $requiredDocs) {
    $path = Join-Path $TemplateDir $doc
    if (-not (Test-Path $path)) {
        $validationErrors += "Missing required documentation: $doc"
    } else {
        Write-Host "  ✓ Found: $doc" -ForegroundColor Green
    }
}

# ============================================================================
# Check 3: Workflow Files
# ============================================================================

Write-Host "`n✓ Checking workflow files..." -ForegroundColor Yellow

$workflowsDir = Join-Path $TemplateDir 'workflows'
if (Test-Path $workflowsDir) {
    $workflows = Get-ChildItem -Path $workflowsDir -Filter '*.yml' -Recurse
    
    if ($workflows.Count -eq 0) {
        $validationWarnings += "No workflow files found in workflows directory"
    } else {
        foreach ($workflow in $workflows) {
            Write-Host "  ✓ Found workflow: $($workflow.Name)" -ForegroundColor Green
            
            # Check for YAML syntax
            try {
                $content = Get-Content $workflow.FullName -Raw
                
                # Install powershell-yaml if not available
                if (-not (Get-Module -ListAvailable -Name powershell-yaml)) {
                    Write-Host "    Installing powershell-yaml module..." -ForegroundColor Gray
                    Install-Module powershell-yaml -Scope CurrentUser -Force -AllowClobber
                }
                
                Import-Module powershell-yaml -ErrorAction SilentlyContinue
                
                # Try to parse YAML
                if (Get-Command ConvertFrom-Yaml -ErrorAction SilentlyContinue) {
                    $null = ConvertFrom-Yaml $content
                    Write-Host "    ✓ Valid YAML syntax" -ForegroundColor Gray
                } else {
                    $validationWarnings += "Could not validate YAML syntax for $($workflow.Name) (powershell-yaml not available)"
                }
            } catch {
                $validationErrors += "Invalid YAML syntax in $($workflow.Name): $_"
            }
        }
    }
}

# ============================================================================
# Check 4: Placeholders
# ============================================================================

Write-Host "`n✓ Checking placeholders..." -ForegroundColor Yellow

$commonPlaceholders = @(
    '{{PROJECT_NAME}}',
    '{{REPOSITORY_NAME}}',
    '{{BUILD_SCRIPT}}',
    '{{TEST_SCRIPT}}',
    '{{ANALYSIS_SCRIPT}}'
)

$foundPlaceholders = @{}

# Search in workflows
if (Test-Path $workflowsDir) {
    $workflows = Get-ChildItem -Path $workflowsDir -Filter '*.yml' -Recurse
    foreach ($workflow in $workflows) {
        $content = Get-Content $workflow.FullName -Raw
        foreach ($placeholder in $commonPlaceholders) {
            if ($content -match [regex]::Escape($placeholder)) {
                if (-not $foundPlaceholders.ContainsKey($placeholder)) {
                    $foundPlaceholders[$placeholder] = @()
                }
                $foundPlaceholders[$placeholder] += $workflow.Name
            }
        }
    }
}

if ($foundPlaceholders.Count -gt 0) {
    Write-Host "  Found placeholders to be replaced:" -ForegroundColor Green
    foreach ($placeholder in $foundPlaceholders.Keys) {
        Write-Host "    • $placeholder (in: $($foundPlaceholders[$placeholder] -join ', '))" -ForegroundColor Gray
    }
} else {
    $validationWarnings += "No placeholders found in workflows - they may have already been replaced"
}

# ============================================================================
# Check 5: Secrets Documentation
# ============================================================================

Write-Host "`n✓ Checking secrets documentation..." -ForegroundColor Yellow

$secretsDoc = Join-Path $TemplateDir 'docs' 'SECRETS_AND_ENV.md'
if (Test-Path $secretsDoc) {
    $secretsContent = Get-Content $secretsDoc -Raw
    
    # Look for common secrets in workflows
    $commonSecrets = @('OPENAI_API_KEY', 'GITHUB_TOKEN', 'API_TOKEN')
    $documentedSecrets = @()
    
    foreach ($secret in $commonSecrets) {
        if ($secretsContent -match $secret) {
            $documentedSecrets += $secret
        }
    }
    
    if ($documentedSecrets.Count -gt 0) {
        Write-Host "  ✓ Documented secrets: $($documentedSecrets -join ', ')" -ForegroundColor Green
    } else {
        $validationWarnings += "No common secrets documented in SECRETS_AND_ENV.md"
    }
}

# ============================================================================
# Check 6: Customization Guide Completeness
# ============================================================================

Write-Host "`n✓ Checking customization guide..." -ForegroundColor Yellow

$customizationGuide = Join-Path $TemplateDir 'docs' 'CUSTOMIZATION_GUIDE.md'
if (Test-Path $customizationGuide) {
    $guideContent = Get-Content $customizationGuide -Raw
    
    $requiredSections = @(
        'Prerequisites',
        'Quick Start',
        'Placeholder',
        'Workflow'
    )
    
    $missingSections = @()
    foreach ($section in $requiredSections) {
        if ($guideContent -notmatch $section) {
            $missingSections += $section
        }
    }
    
    if ($missingSections.Count -eq 0) {
        Write-Host "  ✓ All required sections present" -ForegroundColor Green
    } else {
        $validationWarnings += "Customization guide missing sections: $($missingSections -join ', ')"
    }
}

# ============================================================================
# Check 7: Scripts
# ============================================================================

Write-Host "`n✓ Checking template scripts..." -ForegroundColor Yellow

$scriptsDir = Join-Path $TemplateDir 'scripts'
if (Test-Path $scriptsDir) {
    $scripts = Get-ChildItem -Path $scriptsDir -Filter '*.ps1' -Recurse
    
    if ($scripts.Count -gt 0) {
        foreach ($script in $scripts) {
            Write-Host "  ✓ Found script: $($script.Name)" -ForegroundColor Green
            
            # Basic syntax check
            try {
                $null = [System.Management.Automation.PSParser]::Tokenize((Get-Content $script.FullName -Raw), [ref]$null)
                Write-Host "    ✓ Valid PowerShell syntax" -ForegroundColor Gray
            } catch {
                $validationErrors += "Invalid PowerShell syntax in $($script.Name): $_"
            }
        }
    } else {
        $validationWarnings += "No template scripts found"
    }
}

# ============================================================================
# Results
# ============================================================================

Write-Host "`n==================================" -ForegroundColor Cyan
Write-Host "  Validation Results" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

if ($validationErrors.Count -eq 0 -and $validationWarnings.Count -eq 0) {
    Write-Host "`n✓ All checks passed! Template is ready to use." -ForegroundColor Green
    exit 0
}

if ($validationWarnings.Count -gt 0) {
    Write-Host "`nWarnings ($($validationWarnings.Count)):" -ForegroundColor Yellow
    foreach ($warning in $validationWarnings) {
        Write-Host "  ⚠ $warning" -ForegroundColor Yellow
    }
}

if ($validationErrors.Count -gt 0) {
    Write-Host "`nErrors ($($validationErrors.Count)):" -ForegroundColor Red
    foreach ($error in $validationErrors) {
        Write-Host "  ✗ $error" -ForegroundColor Red
    }
    Write-Host "`n✗ Template validation failed. Please fix errors before using." -ForegroundColor Red
    exit 1
}

if ($validationWarnings.Count -gt 0 -and $validationErrors.Count -eq 0) {
    Write-Host "`n⚠ Template validation passed with warnings." -ForegroundColor Yellow
    exit 0
}
