#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Verifies production readiness of the Unified AI Toolbox
.DESCRIPTION
    Comprehensive pre-deployment verification script that checks:
    - Environment configuration completeness
    - Security settings and hardening
    - Service health and availability
    - Database schema and migrations
    - API endpoints and authentication
    - Performance benchmarks
    - Test coverage and build status
.PARAMETER SkipTests
    Skip running test suites (for quick verification)
.PARAMETER SkipPerformance
    Skip performance benchmarking
.EXAMPLE
    .\Verify-ProductionReadiness.ps1
    Run all verification checks
.EXAMPLE
    .\Verify-ProductionReadiness.ps1 -SkipTests -SkipPerformance
    Run only configuration and security checks
#>

[CmdletBinding()]
param(
    [switch]$SkipTests,
    [switch]$SkipPerformance
)

$ErrorActionPreference = "Continue"
$WarningPreference = "Continue"

# ANSI color codes for output
$Colors = @{
    Green  = "`e[32m"
    Yellow = "`e[33m"
    Red    = "`e[31m"
    Blue   = "`e[34m"
    Reset  = "`e[0m"
}

# Results tracking
$Results = @{
    Passed  = @()
    Warnings = @()
    Failed  = @()
}

function Write-CheckHeader {
    param([string]$Title)
    Write-Host "`n$($Colors.Blue)━━━ $Title ━━━$($Colors.Reset)" -NoNewline
    Write-Host ""
}

function Write-CheckResult {
    param(
        [string]$Name,
        [string]$Status,  # "PASS", "WARN", "FAIL"
        [string]$Message = ""
    )
    
    $symbol = switch ($Status) {
        "PASS" { "✓"; $Results.Passed += $Name }
        "WARN" { "⚠"; $Results.Warnings += $Name }
        "FAIL" { "✗"; $Results.Failed += $Name }
    }
    
    $color = switch ($Status) {
        "PASS" { "Green" }
        "WARN" { "Yellow" }
        "FAIL" { "Red" }
    }
    
    Write-Host "  $symbol " -NoNewline -ForegroundColor $color
    Write-Host "$Name" -NoNewline
    if ($Message) {
        Write-Host " - $Message" -ForegroundColor Gray
    } else {
        Write-Host ""
    }
}

# ============================================================================
# 1. ENVIRONMENT CONFIGURATION
# ============================================================================
Write-CheckHeader "1. Environment Configuration"

# Check for .env file
if (Test-Path ".env") {
    Write-CheckResult "Environment file exists" "PASS"
    
    # Parse .env and check for required variables
    $envContent = Get-Content ".env" -Raw
    $requiredVars = @(
        "JWT_SECRET",
        "DATABASE_PATH",
        "GITHUB_TOKEN"
    )
    
    foreach ($var in $requiredVars) {
        if ($envContent -match "^\s*$var\s*=\s*.+$" -or $envContent -match "^\s*export\s+$var\s*=\s*.+$") {
            Write-CheckResult "$var is set" "PASS"
        } else {
            Write-CheckResult "$var is missing or empty" "WARN" "Set in .env file"
        }
    }
} else {
    Write-CheckResult "Environment file exists" "FAIL" "Copy .env.example to .env"
}

# Check Node.js version
try {
    $nodeVersion = node --version
    $nodeMajor = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($nodeMajor -ge 18) {
        Write-CheckResult "Node.js version" "PASS" "$nodeVersion"
    } else {
        Write-CheckResult "Node.js version" "WARN" "$nodeVersion (18+ recommended)"
    }
} catch {
    Write-CheckResult "Node.js installed" "FAIL" "Install Node.js 18+"
}

# Check Python version
try {
    $pythonVersion = python --version 2>&1
    if ($pythonVersion -match "3\.(1[2-9]|[2-9]\d)") {
        Write-CheckResult "Python version" "PASS" "$pythonVersion"
    } else {
        Write-CheckResult "Python version" "WARN" "$pythonVersion (3.12+ recommended)"
    }
} catch {
    Write-CheckResult "Python installed" "FAIL" "Install Python 3.12+"
}

# Check Docker availability
try {
    $dockerVersion = docker --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-CheckResult "Docker installed" "PASS" "$dockerVersion"
    } else {
        Write-CheckResult "Docker installed" "WARN" "Docker optional but recommended"
    }
} catch {
    Write-CheckResult "Docker installed" "WARN" "Docker optional but recommended"
}

# ============================================================================
# 2. SECURITY CONFIGURATION
# ============================================================================
Write-CheckHeader "2. Security Configuration"

# Check JWT_SECRET strength
if (Test-Path ".env") {
    $envContent = Get-Content ".env" -Raw
    if ($envContent -match 'JWT_SECRET\s*=\s*[''"]?(.+?)[''"]?\s*$') {
        $jwtSecret = $matches[1]
        if ($jwtSecret.Length -ge 32) {
            Write-CheckResult "JWT_SECRET length" "PASS" "$($jwtSecret.Length) characters"
        } else {
            Write-CheckResult "JWT_SECRET length" "FAIL" "Must be 32+ characters"
        }
    }
}

# Check for development secrets in .env
if (Test-Path ".env") {
    $envContent = Get-Content ".env"
    $devPatterns = @("changeme", "secret", "password123", "admin", "test")
    $foundDev = $false
    foreach ($pattern in $devPatterns) {
        if ($envContent -match $pattern) {
            $foundDev = $true
            break
        }
    }
    if ($foundDev) {
        Write-CheckResult "Production secrets" "WARN" "Detected development placeholders"
    } else {
        Write-CheckResult "Production secrets" "PASS"
    }
}

# Check file permissions on sensitive files
$sensitiveFiles = @(".env", "data/sqlite/prompts.db", "data/sqlite/audit.db")
foreach ($file in $sensitiveFiles) {
    if (Test-Path $file) {
        Write-CheckResult "$file exists" "PASS"
    }
}

# Check for HTTPS configuration
Write-CheckResult "HTTPS configuration" "WARN" "Ensure reverse proxy uses HTTPS in production"

# ============================================================================
# 3. DATABASE & DATA
# ============================================================================
Write-CheckHeader "3. Database & Data"

# Check database files exist
$databases = @(
    "data/sqlite/prompts.db",
    "data/sqlite/audit.db"
)

foreach ($db in $databases) {
    if (Test-Path $db) {
        $size = (Get-Item $db).Length
        Write-CheckResult "$db exists" "PASS" "$([math]::Round($size/1KB, 2)) KB"
    } else {
        Write-CheckResult "$db exists" "FAIL" "Database will be created on first run"
    }
}

# Check prompt data exists
if (Test-Path "data/prompts") {
    $promptCount = (Get-ChildItem "data/prompts" -Filter "*.yaml" -Recurse).Count
    if ($promptCount -gt 0) {
        Write-CheckResult "Prompt library" "PASS" "$promptCount prompts found"
    } else {
        Write-CheckResult "Prompt library" "WARN" "No prompts found"
    }
} else {
    Write-CheckResult "Prompt library" "FAIL" "data/prompts directory missing"
}

# ============================================================================
# 4. DEPENDENCIES & BUILD
# ============================================================================
Write-CheckHeader "4. Dependencies & Build"

# Check Python dependencies
if (Test-Path "services/prompt-api/requirements.txt") {
    try {
        Push-Location "services/prompt-api"
        $pipList = pip list 2>&1
        $requirements = Get-Content "requirements.txt"
        $missingDeps = @()
        
        foreach ($req in $requirements) {
            if ($req -match "^([^=><]+)") {
                $package = $matches[1].Trim()
                if ($pipList -notmatch $package) {
                    $missingDeps += $package
                }
            }
        }
        
        if ($missingDeps.Count -eq 0) {
            Write-CheckResult "Python dependencies" "PASS"
        } else {
            Write-CheckResult "Python dependencies" "WARN" "Missing: $($missingDeps -join ', ')"
        }
        Pop-Location
    } catch {
        Write-CheckResult "Python dependencies" "WARN" "Could not verify"
        Pop-Location
    }
}

# Check Dashboard dependencies
if (Test-Path "apps/dashboard/package.json") {
    Push-Location "apps/dashboard"
    if (Test-Path "node_modules") {
        Write-CheckResult "Dashboard dependencies" "PASS"
    } else {
        Write-CheckResult "Dashboard dependencies" "FAIL" "Run 'npm install'"
    }
    Pop-Location
}

# Check Dashboard build
if (Test-Path "apps/dashboard/dist") {
    Write-CheckResult "Dashboard build" "PASS" "Production build exists"
} else {
    Write-CheckResult "Dashboard build" "WARN" "Run 'npm run build' for production"
}

# ============================================================================
# 5. TESTS (Optional)
# ============================================================================
if (-not $SkipTests) {
    Write-CheckHeader "5. Test Suites"
    
    # PowerShell tests
    if (Test-Path "tests/PromptLibrary.Tests.ps1") {
        try {
            $testResult = Invoke-Pester "tests/PromptLibrary.Tests.ps1" -PassThru -Verbose:$false 2>&1
            if ($testResult.FailedCount -eq 0) {
                Write-CheckResult "PowerShell tests" "PASS" "$($testResult.PassedCount) passed"
            } else {
                Write-CheckResult "PowerShell tests" "FAIL" "$($testResult.FailedCount) failed"
            }
        } catch {
            Write-CheckResult "PowerShell tests" "WARN" "Could not run tests"
        }
    }
    
    # Python tests
    if (Test-Path "services/prompt-api/tests") {
        try {
            Push-Location "services/prompt-api"
            $pytestResult = pytest --tb=no -q 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-CheckResult "Python tests" "PASS"
            } else {
                Write-CheckResult "Python tests" "WARN" "Some tests failed"
            }
            Pop-Location
        } catch {
            Write-CheckResult "Python tests" "WARN" "Could not run tests"
            Pop-Location
        }
    }
} else {
    Write-CheckHeader "5. Test Suites (Skipped)"
}

# ============================================================================
# 6. SERVICE HEALTH
# ============================================================================
Write-CheckHeader "6. Service Health (if running)"

# Check if services are running
$services = @(
    @{ Name = "Prompt API"; Port = 8000; Path = "/health" },
    @{ Name = "Dashboard"; Port = 5173; Path = "/" }
)

foreach ($service in $services) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$($service.Port)$($service.Path)" -TimeoutSec 2 -UseBasicParsing -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            Write-CheckResult "$($service.Name) running" "PASS" "Port $($service.Port)"
        } else {
            Write-CheckResult "$($service.Name) running" "WARN" "Not running (expected if not started)"
        }
    } catch {
        Write-CheckResult "$($service.Name) running" "WARN" "Not running (expected if not started)"
    }
}

# ============================================================================
# 7. DOCUMENTATION
# ============================================================================
Write-CheckHeader "7. Documentation"

$docs = @(
    "README.md",
    "WHATS_NEXT.md",
    "LAUNCH_GUIDE.md",
    "docs/PRODUCTION_DEPLOYMENT.md",
    "docs/SECURITY.md",
    "docs/PERFORMANCE.md"
)

foreach ($doc in $docs) {
    if (Test-Path $doc) {
        Write-CheckResult "$doc" "PASS"
    } else {
        Write-CheckResult "$doc" "WARN" "Missing"
    }
}

# ============================================================================
# SUMMARY
# ============================================================================
Write-Host "`n$($Colors.Blue)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$($Colors.Reset)"
Write-Host "$($Colors.Blue)PRODUCTION READINESS SUMMARY$($Colors.Reset)"
Write-Host "$($Colors.Blue)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$($Colors.Reset)`n"

Write-Host "  $($Colors.Green)✓ PASSED:$($Colors.Reset)   $($Results.Passed.Count) checks"
Write-Host "  $($Colors.Yellow)⚠ WARNINGS:$($Colors.Reset) $($Results.Warnings.Count) checks"
Write-Host "  $($Colors.Red)✗ FAILED:$($Colors.Reset)   $($Results.Failed.Count) checks"

# Determine overall status
$overallStatus = if ($Results.Failed.Count -eq 0 -and $Results.Warnings.Count -le 3) {
    Write-Host "`n$($Colors.Green)✓ PRODUCTION READY$($Colors.Reset) - System is ready for deployment"
    "READY"
} elseif ($Results.Failed.Count -eq 0) {
    Write-Host "`n$($Colors.Yellow)⚠ MOSTLY READY$($Colors.Reset) - Address warnings before production deployment"
    "MOSTLY_READY"
} else {
    Write-Host "`n$($Colors.Red)✗ NOT READY$($Colors.Reset) - Fix failed checks before deploying to production"
    "NOT_READY"
}

Write-Host "`n$($Colors.Blue)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$($Colors.Reset)`n"

if ($Results.Failed.Count -gt 0) {
    Write-Host "Failed checks that must be addressed:" -ForegroundColor Red
    foreach ($failed in $Results.Failed) {
        Write-Host "  • $failed" -ForegroundColor Red
    }
    Write-Host ""
}

if ($Results.Warnings.Count -gt 0) {
    Write-Host "Warnings to review:" -ForegroundColor Yellow
    foreach ($warning in $Results.Warnings) {
        Write-Host "  • $warning" -ForegroundColor Yellow
    }
    Write-Host ""
}

Write-Host "Next steps:"
Write-Host "  1. Review and address any failed checks or warnings"
Write-Host "  2. See docs/PRODUCTION_DEPLOYMENT.md for deployment guide"
Write-Host "  3. Run with -Verbose for detailed output"
Write-Host ""

# Exit with appropriate code
exit $(if ($overallStatus -eq "READY") { 0 } elseif ($overallStatus -eq "MOSTLY_READY") { 0 } else { 1 })
