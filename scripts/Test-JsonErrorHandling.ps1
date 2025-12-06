### BEGIN FILE: Test-JsonErrorHandling.ps1
<#
.SYNOPSIS
    Integration test for JSON error handling improvements.

.DESCRIPTION
    Tests the safe JSON loading functionality and error handling
    improvements in the orchestration system without requiring
    external dependencies or API keys.

.EXAMPLE
    .\Test-JsonErrorHandling.ps1

.NOTES
    This is a standalone test that validates JSON handling improvements.
#>

[CmdletBinding()]
param()

$script:TestsPassed = 0
$script:TestsFailed = 0

function Write-TestResult {
    param(
        [string]$TestName,
        [bool]$Passed,
        [string]$Message = ""
    )
    
    if ($Passed) {
        Write-Host "✓ PASS: $TestName" -ForegroundColor Green
        $script:TestsPassed++
    }
    else {
        Write-Host "✗ FAIL: $TestName" -ForegroundColor Red
        if ($Message) {
            Write-Host "  $Message" -ForegroundColor Yellow
        }
        $script:TestsFailed++
    }
}

# Test 1: Scan script exists
Write-Host "`n=== Test 1: Diagnostic Script Existence ===" -ForegroundColor Cyan
$scanScriptPath = Join-Path $PSScriptRoot "Scan-OrchestratorRunJson.ps1"
Write-TestResult -TestName "Scan-OrchestratorRunJson.ps1 exists" -Passed (Test-Path $scanScriptPath)

# Test 2: Scan script has valid syntax
Write-Host "`n=== Test 2: PowerShell Syntax Validation ===" -ForegroundColor Cyan
try {
    $errors = $null
    $null = [System.Management.Automation.Language.Parser]::ParseFile(
        $scanScriptPath,
        [ref]$null,
        [ref]$errors
    )
    Write-TestResult -TestName "Scan script has valid PowerShell syntax" -Passed ($null -eq $errors -or $errors.Count -eq 0)
}
catch {
    Write-TestResult -TestName "Scan script has valid PowerShell syntax" -Passed $false -Message $_.Exception.Message
}

# Test 3: Documentation exists
Write-Host "`n=== Test 3: Documentation Existence ===" -ForegroundColor Cyan
$docPath = Join-Path $PSScriptRoot "README_ORCHESTRATION_DIAGNOSTICS.md"
Write-TestResult -TestName "Diagnostics documentation exists" -Passed (Test-Path $docPath)

# Test 4: Create temporary test files and run scan
Write-Host "`n=== Test 4: Scan Script Functional Tests ===" -ForegroundColor Cyan
$tempBase = [System.IO.Path]::GetTempPath()
$tempDir = Join-Path $tempBase "test-json-scan-$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

try {
    # Create test files
    $validJsonPath = Join-Path $tempDir "valid.json"
    @{ test = "data"; count = 42 } | ConvertTo-Json | Set-Content -Path $validJsonPath
    
    $emptyJsonPath = Join-Path $tempDir "empty.json"
    "" | Set-Content -Path $emptyJsonPath -NoNewline
    
    $invalidJsonPath = Join-Path $tempDir "invalid.json"
    '{"incomplete":' | Set-Content -Path $invalidJsonPath
    
    # Test scan without fix
    try {
        & $scanScriptPath -RunRoot $tempDir -ErrorAction Stop | Out-Null
        $exitCode = $LASTEXITCODE
        
        Write-TestResult -TestName "Scan script executes without errors" -Passed $true
        Write-TestResult -TestName "Scan returns non-zero exit code for problems" -Passed ($exitCode -ne 0)
    }
    catch {
        Write-TestResult -TestName "Scan execution" -Passed $false -Message $_.Exception.Message
    }
    
    # Test scan with fix
    try {
        $output = & $scanScriptPath -RunRoot $tempDir -Fix 2>&1
        
        # Check if empty file was fixed
        $fixedContent = Get-Content -Path $emptyJsonPath -Raw
        $fixedJson = $null
        try {
            $fixedJson = $fixedContent | ConvertFrom-Json
        }
        catch {
            # Ignore parse errors for this test
        }
        
        Write-TestResult -TestName "Scan -Fix repairs empty JSON files" -Passed ($null -ne $fixedJson)
    }
    catch {
        Write-TestResult -TestName "Scan -Fix execution" -Passed $false -Message $_.Exception.Message
    }
}
finally {
    # Cleanup
    if (Test-Path $tempDir) {
        Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Test 5: Verify PowerShell scripts have enhanced error handling
Write-Host "`n=== Test 5: Enhanced Error Handling in Scripts ===" -ForegroundColor Cyan

$repoRoot = Split-Path -Parent $PSScriptRoot
$pofScript = Join-Path $repoRoot "Orchestration\AI-Orchestration\scripts\POF.ps1"
$milestoneScript = Join-Path $repoRoot "Orchestration\AI-Orchestration\scripts\MilestoneController.ps1"

if (Test-Path $pofScript) {
    $pofContent = Get-Content -Path $pofScript -Raw
    Write-TestResult -TestName "POF.ps1 has raw response logging" -Passed ($pofContent -match "raw_response\.json")
    Write-TestResult -TestName "POF.ps1 has enhanced error logging" -Passed ($pofContent -match "error_detail")
    Write-TestResult -TestName "POF.ps1 validates API response structure" -Passed ($pofContent -match "choices.Count -eq 0")
}
else {
    Write-TestResult -TestName "POF.ps1 exists" -Passed $false
}

if (Test-Path $milestoneScript) {
    $milestoneContent = Get-Content -Path $milestoneScript -Raw
    Write-TestResult -TestName "MilestoneController.ps1 has raw response logging" -Passed ($milestoneContent -match "raw.*response")
    Write-TestResult -TestName "MilestoneController.ps1 has error logging" -Passed ($milestoneContent -match "error.*log")
}
else {
    Write-TestResult -TestName "MilestoneController.ps1 exists" -Passed $false
}

# Summary
Write-Host "`n" + ("=" * 50) -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host ("=" * 50) -ForegroundColor Cyan
Write-Host "Tests Passed: $script:TestsPassed" -ForegroundColor Green
Write-Host "Tests Failed: $script:TestsFailed" -ForegroundColor $(if ($script:TestsFailed -gt 0) { "Red" } else { "Green" })
Write-Host ("=" * 50) -ForegroundColor Cyan

if ($script:TestsFailed -eq 0) {
    Write-Host "`n✓ All tests passed!" -ForegroundColor Green
    exit 0
}
else {
    Write-Host "`n✗ Some tests failed" -ForegroundColor Red
    exit 1
}
### END FILE: Test-JsonErrorHandling.ps1
