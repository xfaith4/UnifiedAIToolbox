#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Post-deployment smoke tests for Unified AI Toolbox
.DESCRIPTION
    Validates that all critical services are operational after deployment:
    - API endpoints responding correctly
    - Authentication working
    - Database accessible
    - Search functionality operational
    - GitHub integration available
    - Performance within acceptable ranges
.PARAMETER ApiBaseUrl
    Base URL for the API service (default: http://localhost:8000)
.PARAMETER DashboardUrl
    URL for the dashboard (default: http://localhost:5173)
.PARAMETER AdminUsername
    Admin username for authentication tests (default: admin)
.PARAMETER AdminPassword
    Admin password for authentication tests
.EXAMPLE
    .\Test-DeploymentSmoke.ps1
    Run smoke tests against localhost
.EXAMPLE
    .\Test-DeploymentSmoke.ps1 -ApiBaseUrl "https://api.example.com" -DashboardUrl "https://app.example.com"
    Run smoke tests against production deployment
#>

[CmdletBinding()]
param(
    [string]$ApiBaseUrl = "http://localhost:8000",
    [string]$DashboardUrl = "http://localhost:5173",
    [string]$AdminUsername = "admin",
    [string]$AdminPassword = ""
)

$ErrorActionPreference = "Continue"

# ANSI colors
$Colors = @{
    Green  = "`e[32m"
    Yellow = "`e[33m"
    Red    = "`e[31m"
    Blue   = "`e[34m"
    Reset  = "`e[0m"
}

$TestResults = @{
    Passed = @()
    Failed = @()
}

function Write-TestHeader {
    param([string]$Title)
    Write-Host "`n$($Colors.Blue)▶ $Title$($Colors.Reset)"
}

function Write-TestResult {
    param(
        [string]$Name,
        [bool]$Success,
        [string]$Details = ""
    )
    
    if ($Success) {
        Write-Host "  $($Colors.Green)✓$($Colors.Reset) $Name" -NoNewline
        $TestResults.Passed += $Name
    } else {
        Write-Host "  $($Colors.Red)✗$($Colors.Reset) $Name" -NoNewline
        $TestResults.Failed += $Name
    }
    
    if ($Details) {
        Write-Host " - $Details" -ForegroundColor Gray
    } else {
        Write-Host ""
    }
}

function Invoke-ApiRequest {
    param(
        [string]$Endpoint,
        [string]$Method = "GET",
        [hashtable]$Headers = @{},
        [object]$Body = $null
    )
    
    $url = "$ApiBaseUrl$Endpoint"
    
    try {
        $params = @{
            Uri = $url
            Method = $Method
            Headers = $Headers
            TimeoutSec = 10
            UseBasicParsing = $true
        }
        
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json)
            $params.ContentType = "application/json"
        }
        
        $response = Invoke-WebRequest @params
        return @{
            Success = $true
            StatusCode = $response.StatusCode
            Content = $response.Content
            Headers = $response.Headers
        }
    } catch {
        return @{
            Success = $false
            Error = $_.Exception.Message
            StatusCode = $_.Exception.Response.StatusCode.value__
        }
    }
}

# ============================================================================
# 1. API HEALTH CHECKS
# ============================================================================
Write-TestHeader "1. API Health & Availability"

# Check API root
$response = Invoke-ApiRequest -Endpoint "/"
Write-TestResult "API root endpoint accessible" $response.Success $response.StatusCode

# Check health endpoint
$response = Invoke-ApiRequest -Endpoint "/health"
if ($response.Success) {
    try {
        $health = $response.Content | ConvertFrom-Json
        Write-TestResult "Health endpoint returns valid JSON" $true $health.status
    } catch {
        Write-TestResult "Health endpoint returns valid JSON" $false "Invalid JSON"
    }
} else {
    Write-TestResult "Health endpoint accessible" $false $response.Error
}

# Check API docs
$response = Invoke-ApiRequest -Endpoint "/docs"
Write-TestResult "API documentation accessible" $response.Success

# Check OpenAPI schema
$response = Invoke-ApiRequest -Endpoint "/openapi.json"
Write-TestResult "OpenAPI schema available" $response.Success

# ============================================================================
# 2. AUTHENTICATION
# ============================================================================
Write-TestHeader "2. Authentication System"

# Check auth status endpoint
$response = Invoke-ApiRequest -Endpoint "/auth/status"
Write-TestResult "Auth status endpoint accessible" $response.Success

# Test login (if password provided)
if ($AdminPassword) {
    $loginBody = @{
        username = $AdminUsername
        password = $AdminPassword
    }
    
    $response = Invoke-ApiRequest -Endpoint "/auth/login" -Method "POST" -Body $loginBody
    if ($response.Success) {
        try {
            $authData = $response.Content | ConvertFrom-Json
            if ($authData.access_token) {
                Write-TestResult "Login successful" $true "Token received"
                $global:AuthToken = $authData.access_token
            } else {
                Write-TestResult "Login returns valid token" $false "No token in response"
            }
        } catch {
            Write-TestResult "Login returns valid response" $false "Invalid JSON"
        }
    } else {
        Write-TestResult "Login endpoint" $false $response.Error
    }
} else {
    Write-Host "  $($Colors.Yellow)⊘$($Colors.Reset) Login test skipped (no password provided)"
}

# ============================================================================
# 3. PROMPT MANAGEMENT
# ============================================================================
Write-TestHeader "3. Prompt Management APIs"

# List prompts
$response = Invoke-ApiRequest -Endpoint "/prompts"
if ($response.Success) {
    try {
        $prompts = $response.Content | ConvertFrom-Json
        $count = if ($prompts.PSObject.Properties['prompts']) { $prompts.prompts.Count } else { 0 }
        Write-TestResult "List prompts endpoint" $true "$count prompts found"
    } catch {
        Write-TestResult "List prompts returns valid JSON" $false
    }
} else {
    Write-TestResult "List prompts endpoint" $false $response.Error
}

# Search prompts
$response = Invoke-ApiRequest -Endpoint "/prompts/search?q=test"
if ($response.Success) {
    try {
        $results = $response.Content | ConvertFrom-Json
        Write-TestResult "Search prompts endpoint" $true
    } catch {
        Write-TestResult "Search returns valid JSON" $false
    }
} else {
    Write-TestResult "Search prompts endpoint" $false $response.Error
}

# ============================================================================
# 4. COST TRACKING
# ============================================================================
Write-TestHeader "4. Cost Tracking & Analytics"

# Check cost summary
$response = Invoke-ApiRequest -Endpoint "/admin/costs/summary"
if ($response.Success) {
    try {
        $costs = $response.Content | ConvertFrom-Json
        Write-TestResult "Cost summary endpoint" $true
    } catch {
        Write-TestResult "Cost summary returns valid JSON" $false
    }
} else {
    Write-TestResult "Cost summary endpoint" $false $response.Error
}

# Check budget status
$response = Invoke-ApiRequest -Endpoint "/admin/costs/budget"
if ($response.Success) {
    try {
        $budget = $response.Content | ConvertFrom-Json
        Write-TestResult "Budget status endpoint" $true
    } catch {
        Write-TestResult "Budget returns valid JSON" $false
    }
} else {
    Write-TestResult "Budget status endpoint" $false $response.Error
}

# ============================================================================
# 5. GITHUB INTEGRATION
# ============================================================================
Write-TestHeader "5. GitHub Integration"

# Check GitHub search endpoint
$response = Invoke-ApiRequest -Endpoint "/github/search?q=test&per_page=1"
if ($response.Success -or $response.StatusCode -eq 401) {
    # 401 is acceptable if GITHUB_TOKEN not set
    Write-TestResult "GitHub search endpoint available" $true
} else {
    Write-TestResult "GitHub search endpoint" $false $response.Error
}

# Check codex runs list
$response = Invoke-ApiRequest -Endpoint "/github/codex/runs"
Write-TestResult "Codex runs endpoint accessible" ($response.Success -or $response.StatusCode -eq 200)

# ============================================================================
# 6. DASHBOARD
# ============================================================================
Write-TestHeader "6. Dashboard Frontend"

try {
    $response = Invoke-WebRequest -Uri $DashboardUrl -TimeoutSec 10 -UseBasicParsing
    Write-TestResult "Dashboard accessible" ($response.StatusCode -eq 200) $DashboardUrl
    
    # Check for key HTML elements
    $html = $response.Content
    Write-TestResult "Dashboard contains app div" ($html -match 'id="root"')
    Write-TestResult "Dashboard loads JavaScript" ($html -match '\.js')
} catch {
    Write-TestResult "Dashboard accessible" $false $_.Exception.Message
}

# ============================================================================
# 7. PERFORMANCE
# ============================================================================
Write-TestHeader "7. Performance Checks"

# Test API response time
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$response = Invoke-ApiRequest -Endpoint "/health"
$stopwatch.Stop()
$responseTime = $stopwatch.ElapsedMilliseconds

if ($response.Success) {
    $withinTarget = $responseTime -lt 500
    Write-TestResult "API response time < 500ms" $withinTarget "${responseTime}ms"
} else {
    Write-TestResult "API response time test" $false "API not responding"
}

# Test search performance
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$response = Invoke-ApiRequest -Endpoint "/prompts/search?q=test"
$stopwatch.Stop()
$searchTime = $stopwatch.ElapsedMilliseconds

if ($response.Success) {
    $withinTarget = $searchTime -lt 200
    Write-TestResult "Search response time < 200ms" $withinTarget "${searchTime}ms"
} else {
    Write-TestResult "Search performance test" $false "Search not responding"
}

# Check response compression
$response = Invoke-ApiRequest -Endpoint "/prompts"
if ($response.Success -and $response.Headers.'Content-Encoding') {
    $encoding = $response.Headers.'Content-Encoding'
    Write-TestResult "Response compression enabled" ($encoding -eq 'gzip') $encoding
} else {
    Write-TestResult "Response compression" $false "Not enabled"
}

# ============================================================================
# 8. SECURITY HEADERS
# ============================================================================
Write-TestHeader "8. Security Headers"

$response = Invoke-ApiRequest -Endpoint "/"
if ($response.Success) {
    $headers = $response.Headers
    
    $securityHeaders = @(
        "X-Content-Type-Options",
        "X-Frame-Options",
        "X-XSS-Protection",
        "Strict-Transport-Security",
        "Content-Security-Policy"
    )
    
    foreach ($header in $securityHeaders) {
        $present = $headers.ContainsKey($header)
        Write-TestResult "$header present" $present
    }
} else {
    Write-TestResult "Security headers check" $false "Could not fetch headers"
}

# ============================================================================
# SUMMARY
# ============================================================================
Write-Host "`n$($Colors.Blue)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$($Colors.Reset)"
Write-Host "$($Colors.Blue)SMOKE TEST SUMMARY$($Colors.Reset)"
Write-Host "$($Colors.Blue)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$($Colors.Reset)`n"

$totalTests = $TestResults.Passed.Count + $TestResults.Failed.Count
$passRate = if ($totalTests -gt 0) { [math]::Round(($TestResults.Passed.Count / $totalTests) * 100, 1) } else { 0 }

Write-Host "  Total Tests:  $totalTests"
Write-Host "  $($Colors.Green)Passed:$($Colors.Reset)       $($TestResults.Passed.Count)"
Write-Host "  $($Colors.Red)Failed:$($Colors.Reset)       $($TestResults.Failed.Count)"
Write-Host "  Pass Rate:    $passRate%"

if ($TestResults.Failed.Count -eq 0) {
    Write-Host "`n$($Colors.Green)✓ ALL TESTS PASSED$($Colors.Reset) - Deployment is healthy"
    $exitCode = 0
} elseif ($TestResults.Failed.Count -le 2) {
    Write-Host "`n$($Colors.Yellow)⚠ MOSTLY HEALTHY$($Colors.Reset) - Review failed tests"
    $exitCode = 0
} else {
    Write-Host "`n$($Colors.Red)✗ DEPLOYMENT ISSUES DETECTED$($Colors.Reset) - Multiple tests failed"
    $exitCode = 1
}

if ($TestResults.Failed.Count -gt 0) {
    Write-Host "`nFailed tests:"
    foreach ($failed in $TestResults.Failed) {
        Write-Host "  • $failed" -ForegroundColor Red
    }
}

Write-Host "`n$($Colors.Blue)━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━$($Colors.Reset)`n"

exit $exitCode
