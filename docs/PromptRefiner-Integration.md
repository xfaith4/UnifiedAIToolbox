# Prompt Refiner Integration

## Overview

The Prompt Refiner functionality has been integrated into the `PromptLibrary` PowerShell module, enabling structured AI prompt generation and storage within the UnifiedAIToolbox orchestration ecosystem.

## Features

- **Iterative Prompt Refinement**: Automatically refine prompts through multiple OpenAI API calls
- **YAML Storage**: Save refined prompts in the standardized YAML format used by the orchestration system
- **Database Integration**: Automatically index prompts for searchability
- **Artifact Tracking**: Optional storage of refinement iteration history
- **Cost Tracking**: Track token usage and estimated costs for each refinement session
- **Validation**: Built-in validation of prompt structure against existing schema

## Installation & Prerequisites

### Requirements
- PowerShell 7.4+
- OpenAI API key (set as `$env:OPENAI_API_KEY`)
- PromptLibrary module

### Setup
```powershell
# Set your OpenAI API key
$env:OPENAI_API_KEY = "sk-your-api-key-here"

# Import the module
Import-Module ./modules/PromptLibrary/PromptLibrary.psm1 -Force
```

## Usage

### Basic Usage

```powershell
# Simple prompt refinement
New-RefinedPrompt -UserPrompt "Analyze network traffic for anomalies"
```

### Full Example with All Parameters

```powershell
$params = @{
    UserPrompt = "Create a PowerShell script that automates database backups"
    PromptId = "pr_20251126_db_backup"
    Title = "Database Backup Automation Prompt"
    Category = "automation"
    Tags = @("powershell", "database", "backup", "automation")
    RefinementIterations = 5
    Model = "gpt-4o-mini"
    SaveArtifacts = $true
    RefinementGoals = @"
Make this prompt:
1. More specific about database types (SQL Server, PostgreSQL, etc.)
2. Include error handling requirements
3. Specify logging expectations
4. Include security considerations
"@
}

$result = New-RefinedPrompt @params

# Output includes:
# - PromptId: The identifier for the saved prompt
# - FilePath: Path to the YAML file in data/prompts/
# - RefinedPrompt: The final refined prompt text
# - Iterations: Number of refinement passes performed
# - TokensUsed: Total OpenAI tokens consumed
# - EstimatedCost: Estimated cost in USD
# - ArtifactsPath: Path to iteration artifacts (if SaveArtifacts was used)
```

### Custom Refinement Goals

```powershell
$customGoals = @"
Focus on:
- Technical accuracy and precision
- Security best practices
- Error handling patterns
- Performance considerations
"@

New-RefinedPrompt -UserPrompt "Design an API endpoint" `
    -RefinementGoals $customGoals `
    -RefinementIterations 3
```

### Saving Iteration Artifacts

```powershell
# Save all iteration history for review
New-RefinedPrompt -UserPrompt "Generate test cases for authentication" `
    -SaveArtifacts `
    -RefinementIterations 4

# Artifacts saved to: data/artifacts/{prompt-id}/iteration_N.txt
```

## Output Structure

### YAML Prompt File

Refined prompts are saved to `data/prompts/{prompt-id}.yaml` with the following structure:

```yaml
id: pr_20251126_network_analysis
title: Network Traffic Anomaly Analysis
version: 1
category: analysis
tags: [networking, security, anomalies]
model_hints: [gpt, gemini]
system: |
  You are a helpful AI assistant. Follow the instructions carefully and provide accurate, relevant responses.
user_template: |
  Analyze the network traffic logs for the following time period: ${{time_period}}
  
  Focus on identifying:
  1. Unusual traffic patterns
  2. Potential security threats
  3. Performance bottlenecks
  4. Anomalous connection attempts
  
  Provide a detailed analysis with specific recommendations for each finding.
checksum: abc123def456...
created_utc: 2025-11-26T12:00:00Z
```

### Artifacts (Optional)

When `SaveArtifacts` is specified, iteration history is saved to `data/artifacts/{prompt-id}/`:

```
data/artifacts/pr_20251126_network_analysis/
  ├── iteration_1.txt
  ├── iteration_2.txt
  └── iteration_3.txt
```

Each iteration file contains:
- Iteration number and timestamp
- Tokens used
- Refinement prompt sent to OpenAI
- Refined result

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `UserPrompt` | string | Yes | - | The initial prompt text to refine |
| `PromptId` | string | No | Auto-generated | Unique identifier (e.g., 'pr_20251126_customagent') |
| `Title` | string | No | Truncated prompt | Human-readable title |
| `Category` | string | No | 'general' | Prompt category |
| `Tags` | string[] | No | @() | Tags for categorization |
| `RefinementIterations` | int | No | 3 | Number of refinement passes (1-10) |
| `Model` | string | No | 'gpt-4o-mini' | OpenAI model to use |
| `RefinementGoals` | string | No | Default goals | Custom refinement objectives |
| `SaveArtifacts` | switch | No | false | Save iteration history |
| `SkipValidation` | switch | No | false | Skip schema validation |

## Cost Considerations

The function tracks and reports costs based on OpenAI's pricing:

- **gpt-4o-mini** (default):
  - Prompt tokens: ~$0.15 per 1M tokens
  - Completion tokens: ~$0.60 per 1M tokens

Example costs for typical refinements:
- 1 iteration: ~$0.0001 - $0.001
- 3 iterations: ~$0.0003 - $0.003
- 5 iterations: ~$0.0005 - $0.005

Actual costs depend on prompt complexity and refinement results.

## Integration with Orchestration

Refined prompts are immediately available for use in orchestration scripts:

```powershell
# Create a refined prompt
New-RefinedPrompt -UserPrompt "Generate deployment checklist" `
    -PromptId "pr_deploy_checklist" `
    -Category "deployment"

# Use it in orchestration
$prompt = Get-PromptFile -Id "pr_deploy_checklist"
$agent = Get-Agent -Id "deployment_agent"

Invoke-Orchestration -PromptObject $prompt `
    -AgentId $agent.id `
    -Inputs @{ environment = "production" } `
    -Model "gpt-4"
```

## Database Integration

Refined prompts are automatically indexed in the SQLite database for searchability:

```powershell
# Search for refined prompts
Search-Prompts -Query "deployment" -Category "automation"

# Update the index manually if needed
Update-PromptIndexAll
```

## Best Practices

### 1. Use Descriptive Prompt IDs
```powershell
# Good
-PromptId "pr_20251126_sql_query_optimization"

# Less ideal
-PromptId "pr_query1"
```

### 2. Provide Context with Tags
```powershell
-Tags @("sql", "optimization", "performance", "production")
```

### 3. Start with Fewer Iterations
```powershell
# Start small, increase if needed
-RefinementIterations 2
```

### 4. Use Custom Goals for Specialized Prompts
```powershell
$goals = @"
This prompt will be used in a production environment. Ensure:
- Clear error handling instructions
- Security considerations
- Performance optimization guidance
"@
-RefinementGoals $goals
```

### 5. Save Artifacts for Important Prompts
```powershell
# Save refinement history for review and audit
-SaveArtifacts
```

## Error Handling

The function handles common errors gracefully:

- **Missing API Key**: Throws clear error message
- **API Call Failures**: Retries with exponential backoff
- **Null Responses**: Continues with available iterations
- **Validation Failures**: Warns but allows saving with `-SkipValidation`

## Testing

Comprehensive Pester tests are available in `tests/PromptRefiner.Tests.ps1`:

```powershell
# Run all Prompt Refiner integration tests
Invoke-Pester tests/PromptRefiner.Tests.ps1

# Run with detailed output
Invoke-Pester tests/PromptRefiner.Tests.ps1 -Output Detailed
```

## Examples

### Example 1: Code Generation Prompt
```powershell
New-RefinedPrompt `
    -UserPrompt "Generate a REST API endpoint for user authentication" `
    -Title "User Authentication API Endpoint Generator" `
    -Category "code-generation" `
    -Tags @("api", "authentication", "rest", "security") `
    -RefinementIterations 4
```

### Example 2: Analysis Prompt with Artifacts
```powershell
New-RefinedPrompt `
    -UserPrompt "Analyze cloud infrastructure costs and suggest optimizations" `
    -PromptId "pr_20251126_cloud_cost_analysis" `
    -Title "Cloud Cost Analysis & Optimization" `
    -Category "analysis" `
    -Tags @("cloud", "costs", "optimization", "azure", "aws") `
    -RefinementIterations 5 `
    -SaveArtifacts
```

### Example 3: Documentation Prompt
```powershell
$docGoals = @"
Create a prompt that generates:
1. Clear, concise documentation
2. Code examples for each section
3. Common pitfalls and solutions
4. Best practices and recommendations
"@

New-RefinedPrompt `
    -UserPrompt "Document a PowerShell module's public functions" `
    -Title "PowerShell Module Documentation Generator" `
    -Category "documentation" `
    -Tags @("powershell", "documentation", "modules") `
    -RefinementGoals $docGoals `
    -RefinementIterations 3
```

## Troubleshooting

### Issue: "OpenAI API key not found"
**Solution**: Set the environment variable:
```powershell
$env:OPENAI_API_KEY = "sk-your-key-here"
```

### Issue: "Database not initialized"
**Solution**: The database initializes automatically when the module loads. If you see this error, reimport the module:
```powershell
Import-Module ./modules/PromptLibrary/PromptLibrary.psm1 -Force
```

### Issue: Refinement produces poor results
**Solution**: 
1. Increase refinement iterations
2. Provide more specific custom refinement goals
3. Try a different model (e.g., "gpt-4" instead of "gpt-4o-mini")

### Issue: High token costs
**Solution**:
1. Reduce refinement iterations
2. Use more concise initial prompts
3. Set specific refinement goals to avoid unnecessary elaboration

## API Reference

### New-RefinedPrompt

Generates and refines AI prompts using iterative OpenAI calls, then stores them in YAML format.

**Syntax:**
```powershell
New-RefinedPrompt
    [-UserPrompt] <String>
    [-PromptId <String>]
    [-Title <String>]
    [-Category <String>]
    [-Tags <String[]>]
    [-RefinementIterations <Int32>]
    [-Model <String>]
    [-RefinementGoals <String>]
    [-SaveArtifacts]
    [-SkipValidation]
    [<CommonParameters>]
```

**Returns:**
```powershell
[PSCustomObject]@{
    PromptId      = "pr_20251126_example"
    FilePath      = "/path/to/data/prompts/pr_20251126_example.yaml"
    RefinedPrompt = "The final refined prompt text"
    Iterations    = 3
    TokensUsed    = 450
    EstimatedCost = 0.000234
    ArtifactsPath = "/path/to/data/artifacts/pr_20251126_example" # if SaveArtifacts
}
```

## Contributing

To extend or modify the Prompt Refiner functionality:

1. Edit: `modules/PromptLibrary/Public/New-RefinedPrompt.ps1`
2. Add tests: `tests/PromptRefiner.Tests.ps1`
3. Update documentation: `docs/PromptRefiner-Integration.md`

## See Also

- [PromptLibrary Module Documentation](../modules/PromptLibrary/README.md)
- [Unified Orchestration Guide](../QUICK_START.md)
- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)
