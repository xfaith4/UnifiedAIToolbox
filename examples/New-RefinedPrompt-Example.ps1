<#
.SYNOPSIS
    Example usage of New-RefinedPrompt for creating refined AI prompts.

.DESCRIPTION
    This script demonstrates various ways to use the New-RefinedPrompt function
    to create, refine, and store AI prompts in the UnifiedAIToolbox system.
    
.NOTES
    Prerequisites:
    - OpenAI API key set in $env:OPENAI_API_KEY
    - PromptLibrary module imported
#>

# Import the PromptLibrary module
$ModulePath = Join-Path $PSScriptRoot '..' 'modules' 'PromptLibrary' 'PromptLibrary.psm1'
Import-Module $ModulePath -Force

# Ensure OpenAI API key is set
if (-not $env:OPENAI_API_KEY) {
    Write-Error "Please set your OpenAI API key: `$env:OPENAI_API_KEY = 'sk-your-key-here'"
    exit 1
}

Write-Host "=== New-RefinedPrompt Examples ===" -ForegroundColor Cyan
Write-Host ""

# ============================================
# Example 1: Simple prompt refinement
# ============================================
Write-Host "Example 1: Simple prompt refinement" -ForegroundColor Yellow
Write-Host "Creating a basic refined prompt..." -ForegroundColor Gray

$result1 = New-RefinedPrompt -UserPrompt "Analyze system logs for errors" `
    -RefinementIterations 2

Write-Host "Created prompt: $($result1.PromptId)" -ForegroundColor Green
Write-Host "Location: $($result1.FilePath)" -ForegroundColor Gray
Write-Host "Tokens used: $($result1.TokensUsed) | Cost: `$$($result1.EstimatedCost)" -ForegroundColor Gray
Write-Host ""

# ============================================
# Example 2: Detailed prompt with metadata
# ============================================
Write-Host "Example 2: Detailed prompt with full metadata" -ForegroundColor Yellow
Write-Host "Creating a prompt with custom ID, title, and tags..." -ForegroundColor Gray

$result2 = New-RefinedPrompt `
    -UserPrompt "Generate PowerShell script to backup SQL databases" `
    -PromptId "pr_20251126_sql_backup" `
    -Title "SQL Database Backup Script Generator" `
    -Category "automation" `
    -Tags @("sql", "backup", "powershell", "database") `
    -RefinementIterations 3

Write-Host "Created prompt: $($result2.PromptId)" -ForegroundColor Green
Write-Host "Tokens used: $($result2.TokensUsed) | Cost: `$$($result2.EstimatedCost)" -ForegroundColor Gray
Write-Host ""

# ============================================
# Example 3: Custom refinement goals
# ============================================
Write-Host "Example 3: Using custom refinement goals" -ForegroundColor Yellow
Write-Host "Creating a prompt with specific refinement objectives..." -ForegroundColor Gray

$customGoals = @"
Focus on:
1. Security best practices
2. Error handling and logging
3. Performance optimization
4. Monitoring and alerting
"@

$result3 = New-RefinedPrompt `
    -UserPrompt "Design a monitoring system for cloud infrastructure" `
    -PromptId "pr_20251126_cloud_monitoring" `
    -Title "Cloud Infrastructure Monitoring System" `
    -Category "monitoring" `
    -Tags @("cloud", "monitoring", "infrastructure", "alerts") `
    -RefinementGoals $customGoals `
    -RefinementIterations 4

Write-Host "Created prompt: $($result3.PromptId)" -ForegroundColor Green
Write-Host "Refined with custom goals" -ForegroundColor Gray
Write-Host "Tokens used: $($result3.TokensUsed) | Cost: `$$($result3.EstimatedCost)" -ForegroundColor Gray
Write-Host ""

# ============================================
# Example 4: Save artifacts for review
# ============================================
Write-Host "Example 4: Saving refinement artifacts" -ForegroundColor Yellow
Write-Host "Creating a prompt and saving all iteration history..." -ForegroundColor Gray

$result4 = New-RefinedPrompt `
    -UserPrompt "Create API documentation from OpenAPI spec" `
    -PromptId "pr_20251126_api_docs" `
    -Title "API Documentation Generator" `
    -Category "documentation" `
    -Tags @("api", "documentation", "openapi") `
    -RefinementIterations 3 `
    -SaveArtifacts

Write-Host "Created prompt: $($result4.PromptId)" -ForegroundColor Green
Write-Host "Artifacts saved to: $($result4.ArtifactsPath)" -ForegroundColor Gray

if ($result4.ArtifactsPath -and (Test-Path $result4.ArtifactsPath)) {
    $artifactFiles = Get-ChildItem -Path $result4.ArtifactsPath -Filter "iteration_*.txt"
    Write-Host "Iteration files: $($artifactFiles.Count)" -ForegroundColor Gray
}
Write-Host ""

# ============================================
# Example 5: Using with orchestration
# ============================================
Write-Host "Example 5: Using refined prompt in orchestration" -ForegroundColor Yellow
Write-Host "Creating and immediately using a refined prompt..." -ForegroundColor Gray

$result5 = New-RefinedPrompt `
    -UserPrompt "Analyze network traffic for anomalies" `
    -PromptId "pr_20251126_network_analysis" `
    -Category "analysis" `
    -Tags @("network", "security", "analysis") `
    -RefinementIterations 2

Write-Host "Created prompt: $($result5.PromptId)" -ForegroundColor Green

# Load the prompt back
$loadedPrompt = Get-PromptFile -Id $result5.PromptId
if ($loadedPrompt) {
    Write-Host "✓ Prompt loaded successfully from database" -ForegroundColor Green
    Write-Host "  Title: $($loadedPrompt.title)" -ForegroundColor Gray
    Write-Host "  Category: $($loadedPrompt.category)" -ForegroundColor Gray
} else {
    Write-Host "✗ Failed to load prompt" -ForegroundColor Red
}
Write-Host ""

# ============================================
# Summary
# ============================================
Write-Host "=== Summary ===" -ForegroundColor Cyan
Write-Host "Total prompts created: 5" -ForegroundColor Green
$totalCost = $result1.EstimatedCost + $result2.EstimatedCost + $result3.EstimatedCost + 
             $result4.EstimatedCost + $result5.EstimatedCost
Write-Host "Total estimated cost: `$$([Math]::Round($totalCost, 6))" -ForegroundColor Green
Write-Host ""
Write-Host "All prompts are available in:" -ForegroundColor Cyan
Write-Host "  - data/prompts/*.yaml (YAML definitions)" -ForegroundColor Gray
Write-Host "  - data/prompts.db (SQLite index)" -ForegroundColor Gray
Write-Host ""
Write-Host "Use Get-PromptFile or Search-Prompts to find and load prompts" -ForegroundColor Yellow
Write-Host ""

# Search example
Write-Host "Example: Search for automation prompts..." -ForegroundColor Yellow
$searchResults = Search-Prompts -Category "automation" -Limit 5
if ($searchResults -and $searchResults.Count -gt 0) {
    Write-Host "Found $($searchResults.Count) automation prompts:" -ForegroundColor Green
    foreach ($prompt in $searchResults) {
        Write-Host "  - $($prompt.Id): $($prompt.Title)" -ForegroundColor Gray
    }
} else {
    Write-Host "No automation prompts found (database may need indexing)" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "✓ Examples complete!" -ForegroundColor Green
