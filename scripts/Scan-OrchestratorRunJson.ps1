### BEGIN FILE: Scan-OrchestratorRunJson.ps1
<#
.SYNOPSIS
    Scan orchestrator run directories for empty or invalid JSON files.

.DESCRIPTION
    This script scans the orchestration-bridge runs directory for JSON files
    that are zero bytes or contain invalid JSON. This helps diagnose
    "Expecting value..." errors in the orchestration pipeline.

.PARAMETER RunRoot
    Root directory containing orchestration runs. Defaults to the
    orchestration-bridge/runs directory in the repository.

.PARAMETER Fix
    If specified, attempts to fix empty JSON files by initializing them
    with a minimal valid structure.

.EXAMPLE
    .\Scan-OrchestratorRunJson.ps1

.EXAMPLE
    .\Scan-OrchestratorRunJson.ps1 -RunRoot "C:\path\to\runs" -Fix

.NOTES
    Part of the UnifiedAIToolbox orchestration troubleshooting toolkit.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$RunRoot,
    
    [Parameter(Mandatory = $false)]
    [switch]$Fix
)

# Determine run root directory
if (-not $RunRoot) {
    $scriptDir = Split-Path -Parent $PSScriptRoot
    $RunRoot = Join-Path $scriptDir "apps\orchestration-bridge\runs"
}

if (-not (Test-Path $RunRoot)) {
    Write-Error "Run root directory not found: $RunRoot"
    exit 1
}

Write-Host "Scanning orchestrator runs in: $RunRoot" -ForegroundColor Cyan
Write-Host ""

$emptyFiles = @()
$invalidFiles = @()
$validFiles = 0

# Scan all JSON files recursively
Get-ChildItem -Path $RunRoot -Recurse -Filter '*.json' | ForEach-Object {
    $file = $_
    $relativePath = $file.FullName.Substring($RunRoot.Length + 1)
    
    # Check for empty files (0 bytes)
    if ($file.Length -eq 0) {
        $emptyFiles += $file
        Write-Host "❌ EMPTY (0 bytes): $relativePath" -ForegroundColor Red
        
        if ($Fix) {
            try {
                # Initialize with minimal valid JSON structure
                $minimalJson = @{
                    status = "error:empty file detected"
                    error_detail = "File was empty (0 bytes)"
                    created_at = (Get-Date -Format "o")
                    fixed_by = "Scan-OrchestratorRunJson.ps1"
                } | ConvertTo-Json -Depth 3
                
                Set-Content -Path $file.FullName -Value $minimalJson -Encoding UTF8
                Write-Host "  ✓ Fixed: Initialized with minimal JSON structure" -ForegroundColor Green
            }
            catch {
                Write-Host "  ✗ Failed to fix: $_" -ForegroundColor Yellow
            }
        }
        return
    }
    
    # Check for valid JSON content
    try {
        $content = Get-Content -Path $file.FullName -Raw -Encoding UTF8
        
        # Check if content is just whitespace
        if ([string]::IsNullOrWhiteSpace($content)) {
            $emptyFiles += $file
            Write-Host "❌ EMPTY (whitespace only): $relativePath" -ForegroundColor Red
            
            if ($Fix) {
                try {
                    $minimalJson = @{
                        status = "error:empty file detected"
                        error_detail = "File contained only whitespace"
                        created_at = (Get-Date -Format "o")
                        fixed_by = "Scan-OrchestratorRunJson.ps1"
                    } | ConvertTo-Json -Depth 3
                    
                    Set-Content -Path $file.FullName -Value $minimalJson -Encoding UTF8
                    Write-Host "  ✓ Fixed: Initialized with minimal JSON structure" -ForegroundColor Green
                }
                catch {
                    Write-Host "  ✗ Failed to fix: $_" -ForegroundColor Yellow
                }
            }
            return
        }
        
        # Try to parse JSON
        $null = $content | ConvertFrom-Json -ErrorAction Stop
        $validFiles++
        Write-Verbose "✓ Valid: $relativePath"
    }
    catch {
        $invalidFiles += [PSCustomObject]@{
            File = $file
            Path = $relativePath
            Error = $_.Exception.Message
        }
        Write-Host "❌ INVALID JSON: $relativePath" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Yellow
        
        # Show content preview
        if ($content -and $content.Length -gt 0) {
            $preview = $content.Substring(0, [Math]::Min(200, $content.Length))
            Write-Host "   Preview: $preview..." -ForegroundColor Gray
        }
    }
}

# Summary
Write-Host ""
Write-Host "=== Scan Summary ===" -ForegroundColor Cyan
Write-Host "Valid JSON files:   $validFiles" -ForegroundColor Green
Write-Host "Empty files:        $($emptyFiles.Count)" -ForegroundColor $(if ($emptyFiles.Count -gt 0) { "Red" } else { "Green" })
Write-Host "Invalid JSON files: $($invalidFiles.Count)" -ForegroundColor $(if ($invalidFiles.Count -gt 0) { "Red" } else { "Green" })

if ($emptyFiles.Count -eq 0 -and $invalidFiles.Count -eq 0) {
    Write-Host ""
    Write-Host "✓ All JSON files are valid!" -ForegroundColor Green
    exit 0
}

# List problematic files
if ($emptyFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "Empty files detected:" -ForegroundColor Yellow
    $emptyFiles | ForEach-Object {
        Write-Host "  - $($_.FullName)"
    }
}

if ($invalidFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "Invalid JSON files detected:" -ForegroundColor Yellow
    $invalidFiles | ForEach-Object {
        Write-Host "  - $($_.Path)"
        Write-Host "    Error: $($_.Error)" -ForegroundColor Gray
    }
}

if (-not $Fix) {
    Write-Host ""
    Write-Host "Tip: Run with -Fix switch to attempt automatic repair of empty files" -ForegroundColor Cyan
}

exit 1
### END FILE: Scan-OrchestratorRunJson.ps1
