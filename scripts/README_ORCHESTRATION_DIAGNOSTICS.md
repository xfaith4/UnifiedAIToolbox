# Orchestration Diagnostics Guide

This guide helps troubleshoot "Expecting value..." JSON parsing errors in the AI Orchestration pipeline.

## Common Issues

### 1. Empty JSON Files (0 bytes)

**Symptom:** Error message like `"error:Expecting value..."` or `"Empty JSON file (0 bytes)"`

**Cause:** JSON files are created but not written to before being read

**Solution:**
```powershell
.\scripts\Scan-OrchestratorRunJson.ps1 -Fix
```

This will:
- Scan all JSON files in the runs directory
- Identify empty (0 byte) files
- Initialize them with minimal valid JSON structure

### 2. Invalid JSON Content

**Symptom:** Error message like `"Invalid JSON in file"` with line/column numbers

**Cause:** 
- Truncated API responses
- Network interruptions
- Model output not being valid JSON
- File write interruptions

**Solution:**
1. Check the raw response files:
   ```powershell
   ls apps\orchestration-bridge\runs\<run-id>\*_raw_response.json
   ```

2. Look for error logs:
   ```powershell
   ls apps\orchestration-bridge\runs\<run-id>\*_error.log
   ```

3. Review agent status:
   ```powershell
   cat apps\orchestration-bridge\runs\<run-id>\agent_status.json
   ```

### 3. Whitespace-Only Files

**Symptom:** Error message `"JSON file contains only whitespace"`

**Cause:** File was created and cleared, or write operation failed partway

**Solution:** Same as #1, run with `-Fix` flag

## Diagnostic Tools

### Scan-OrchestratorRunJson.ps1

Scans orchestration run directories for problematic JSON files.

**Usage:**
```powershell
# Scan default runs directory
.\scripts\Scan-OrchestratorRunJson.ps1

# Scan custom directory
.\scripts\Scan-OrchestratorRunJson.ps1 -RunRoot "C:\path\to\runs"

# Scan and auto-fix empty files
.\scripts\Scan-OrchestratorRunJson.ps1 -Fix

# Verbose output
.\scripts\Scan-OrchestratorRunJson.ps1 -Verbose
```

**Output:**
- ✓ Valid JSON files (green)
- ❌ Empty files (red)
- ❌ Invalid JSON files (red, with error details)

### Enhanced Error Logging

The orchestration system now creates additional diagnostic files:

#### Raw Response Files
- Location: `runs/<run-id>/<agent>_raw_response.json`
- Contains: Complete API response before parsing
- Use: Verify the API actually returned valid JSON

#### Error Logs
- Location: `runs/<run-id>/<agent>_error.log`
- Contains: Detailed error information, stack traces
- Use: Debug agent failures

#### Agent Status
- Location: `runs/<run-id>/agent_status.json`
- Format: JSON lines (one JSON object per line)
- Contains: Timeline of agent execution with status updates

## Troubleshooting Steps

### Step 1: Check the Run Endpoint

Hit the API endpoint directly to see status and errors:
```bash
curl http://localhost:8000/orchestrate/run/<run-id>
```

Look for:
- `status` field showing error details
- `error_detail` field with specific file/location
- `last_step` field indicating where it failed

### Step 2: Inspect Run Directory

```powershell
$runId = "Smoke_test_launch_script.2025-12-06T00-16-32Z"
$runDir = "apps\orchestration-bridge\runs\$runId"

# List all files
ls $runDir

# Check for 0-byte files
ls $runDir -Recurse | Where-Object { $_.Length -eq 0 }

# View agent status timeline
cat "$runDir\agent_status.json"

# Check for error logs
ls "$runDir\*_error.log"
```

### Step 3: Validate JSON Files

Use PowerShell to validate JSON:
```powershell
# Test a single file
Get-Content "path\to\file.json" -Raw | ConvertFrom-Json

# Test all JSON files in a run
ls "apps\orchestration-bridge\runs\<run-id>\*.json" | ForEach-Object {
    try {
        Get-Content $_.FullName -Raw | ConvertFrom-Json | Out-Null
        Write-Host "✓ $($_.Name)" -ForegroundColor Green
    }
    catch {
        Write-Host "✗ $($_.Name): $_" -ForegroundColor Red
    }
}
```

### Step 4: Check Model Responses

If the raw response files exist, verify they contain valid JSON:
```powershell
# Check raw responses
ls "apps\orchestration-bridge\runs\<run-id>\*_raw_response.json" | ForEach-Object {
    Write-Host "`n=== $($_.Name) ===" -ForegroundColor Cyan
    Get-Content $_.FullName -Raw | ConvertFrom-Json | ConvertTo-Json -Depth 3
}
```

## Prevention

### 1. Use Safe JSON Loading

All code now uses `safe_json_load` which:
- Checks file size before parsing
- Validates content is not just whitespace
- Provides detailed error messages with file location
- Includes content preview in error messages

### 2. Validate API Responses

All API calls now validate response structure before accessing fields:
```powershell
if (-not $response.choices -or $response.choices.Count -eq 0) {
    throw "OpenAI API returned no choices in response"
}
```

### 3. Error Handling Best Practices

- Always wrap JSON operations in try-catch
- Log raw responses before parsing
- Write status files atomically
- Include context in error messages

## API Endpoint Reference

### Get Run Details
```
GET /orchestrate/run/{run_id}
```

Returns:
- Full manifest with status
- Error details if failed
- Log excerpt
- Events timeline

### Get Run Logs
```
GET /orchestrate/run/{run_id}/log
```

Returns raw log file content with configurable size limit.

## Additional Resources

- See `tests/test_safe_json_loading.py` for test examples
- Check `app.py` for `safe_json_load` implementation
- Review `POF.ps1` for enhanced error logging in PowerShell
