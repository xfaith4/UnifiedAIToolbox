# OpenAI pricing constants (as of Nov 2024, per 1M tokens)
$script:OPENAI_PRICING = @{
    'gpt-4o-mini' = @{
        Prompt     = 0.000150
        Completion = 0.000600
    }
    'gpt-4o' = @{
        Prompt     = 0.005
        Completion = 0.015
    }
    'gpt-4' = @{
        Prompt     = 0.03
        Completion = 0.06
    }
}

# Token estimation constants
$script:CHARS_PER_TOKEN = 4      # Approximate characters per token
$script:MIN_MAX_TOKENS = 1024    # Minimum max_tokens to allow
$script:MAX_MAX_TOKENS = 4096    # Maximum max_tokens to prevent excessive usage
$script:TOKEN_MULTIPLIER = 2     # Multiplier for estimating response size from prompt

# Early stopping patterns (configurable)
$script:EARLY_STOP_PATTERNS = @(
    "cannot\s+improve"
    "already\s+optimal"
    "no\s+further\s+refinements?"
    "nothing\s+more\s+to\s+improve"
    "no\s+additional\s+improvements?"
)

function New-RefinedPrompt {
    <#
.SYNOPSIS
    Generates and refines AI prompts using iterative OpenAI calls, then stores them in YAML format.

.DESCRIPTION
    Integrates Prompt Refiner functionality into the PromptLibrary module. This function:
    - Takes a user prompt and refines it through multiple iterations using OpenAI
    - Validates the generated prompt against the existing prompt schema
    - Saves the refined prompt to the data/prompts directory in YAML format
    - Optionally saves refinement artifacts (iteration history) to data/artifacts
    - Updates the prompt index database for searchability

.PARAMETER UserPrompt
    The initial prompt text to refine.

.PARAMETER PromptId
    Unique identifier for the prompt (e.g., 'pr_20251126_customagent'). 
    If not provided, generated from timestamp and prompt content.

.PARAMETER Title
    Human-readable title for the prompt.

.PARAMETER Category
    Prompt category (e.g., 'automation', 'analysis', 'code-generation').

.PARAMETER Tags
    Array of tags for categorization and search.

.PARAMETER RefinementIterations
    Number of refinement passes to perform. Default: 3.

.PARAMETER Model
    OpenAI model to use for refinement. Default: 'gpt-4o-mini'.

.PARAMETER RefinementGoals
    Custom refinement objectives. If not specified, uses default goals focused on 
    clarity, detail, and actionability.

.PARAMETER SaveArtifacts
    If specified, saves iteration history to data/artifacts directory.

.PARAMETER SkipValidation
    If specified, skips prompt schema validation before saving.

.EXAMPLE
    New-RefinedPrompt -UserPrompt "Analyze network logs for anomalies" -Title "Network Anomaly Detection" -Category "analysis" -Tags @("networking", "security")

.EXAMPLE
    $params = @{
        UserPrompt = "Create a PowerShell script for automated backups"
        PromptId = "pr_20251126_autobackup"
        Title = "Automated Backup Script Generator"
        Category = "automation"
        Tags = @("powershell", "backup", "automation")
        RefinementIterations = 5
        SaveArtifacts = $true
    }
    New-RefinedPrompt @params

.OUTPUTS
    PSCustomObject with properties:
    - PromptId: The saved prompt identifier
    - FilePath: Path to the saved YAML file
    - RefinedPrompt: The final refined prompt text
    - Iterations: Number of refinement iterations performed
    - TokensUsed: Total tokens consumed
    - EstimatedCost: Estimated cost in USD
    - ArtifactsPath: Path to artifacts directory (if SaveArtifacts was used)
#>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory, Position = 0)]
        [ValidateNotNullOrEmpty()]
        [string]$UserPrompt,

        [Parameter()]
        [string]$PromptId,

        [Parameter()]
        [string]$Title,

        [Parameter()]
        [string]$Category = 'general',

        [Parameter()]
        [string[]]$Tags = @(),

        [Parameter()]
        [ValidateRange(1, 10)]
        [int]$RefinementIterations = 3,

        [Parameter()]
        [string]$Model = 'gpt-4o-mini',

        [Parameter()]
        [string]$RefinementGoals,

        [Parameter()]
        [switch]$SaveArtifacts,

        [Parameter()]
        [switch]$SkipValidation
    )

    # Validate OpenAI API key
    $apiKey = $env:OPENAI_API_KEY
    if (-not $apiKey) {
        throw "OpenAI API key not found. Set the OPENAI_API_KEY environment variable."
    }

    # Generate prompt ID if not provided
    if (-not $PromptId) {
        $timestamp = Get-Date -Format 'yyyyMMdd'
        $shortName = ($UserPrompt.Substring(0, [Math]::Min(20, $UserPrompt.Length)) -replace '[^\w]', '_').ToLower()
        $PromptId = "pr_${timestamp}_${shortName}"
    }

    # Set default title if not provided
    if (-not $Title) {
        $Title = $UserPrompt.Substring(0, [Math]::Min(60, $UserPrompt.Length))
    }

    # Default refinement goals
    if (-not $RefinementGoals) {
        $RefinementGoals = @"
Refine this prompt by:
1. Making it more specific and actionable
2. Adding relevant context and constraints
3. Ensuring clarity and proper structure
4. Incorporating best practices for AI prompt engineering
5. Making it suitable for orchestration and automation scenarios
"@
    }

    Write-Verbose "Starting prompt refinement for: $PromptId"
    Write-Verbose "Model: $Model | Iterations: $RefinementIterations"

    # Initialize tracking
    $iterations = [System.Collections.Generic.List[PSObject]]::new()
    $totalTokens = 0
    $totalPromptTokens = 0
    $totalCompletionTokens = 0

    # Artifacts directory setup (if needed)
    $artifactsPath = $null
    if ($SaveArtifacts) {
        $artifactsPath = Join-Path $Script:DataRoot 'artifacts' $PromptId
        New-Item -ItemType Directory -Path $artifactsPath -Force | Out-Null
        Write-Verbose "Artifacts will be saved to: $artifactsPath"
    }

    # Initial refinement call
    Write-Verbose "Performing initial prompt refinement..."
    $currentPrompt = $UserPrompt
    
    try {
        for ($i = 0; $i -lt $RefinementIterations; $i++) {
            $iterationNum = $i + 1
            Write-Verbose "Refinement iteration $iterationNum of $RefinementIterations"

            # Build refinement prompt
            $refinementPrompt = if ($i -eq 0) {
                @"
You are an expert prompt engineer. Refine the following prompt to make it more effective for AI systems.

Original prompt:
$UserPrompt

Refinement goals:
$RefinementGoals

Provide only the refined prompt, without explanations or metadata.
"@
            }
            else {
                @"
You are an expert prompt engineer. Further refine the following prompt.

Current version:
$currentPrompt

Refinement goals:
$RefinementGoals

Provide only the improved prompt, without explanations or metadata.
"@
            }

            # Call OpenAI API
            $result = Invoke-OpenAIRefinement -Prompt $refinementPrompt -Model $Model -ApiKey $apiKey
            
            if (-not $result) {
                Write-Warning "Refinement iteration $iterationNum returned null. Stopping refinement."
                break
            }

            # Update tracking
            $currentPrompt = $result.Content
            $totalTokens += $result.TotalTokens
            $totalPromptTokens += $result.PromptTokens
            $totalCompletionTokens += $result.CompletionTokens

            # Save iteration data
            $iterationData = [PSCustomObject]@{
                Iteration        = $iterationNum
                Prompt           = $refinementPrompt
                Response         = $currentPrompt
                TokensUsed       = $result.TotalTokens
                PromptTokens     = $result.PromptTokens
                CompletionTokens = $result.CompletionTokens
            }
            $iterations.Add($iterationData)

            # Save artifacts if requested
            if ($SaveArtifacts) {
                $iterationFile = Join-Path $artifactsPath "iteration_$iterationNum.txt"
                @"
Iteration: $iterationNum
Timestamp: $(Get-Date -Format 'o')
Tokens Used: $($result.TotalTokens)
===========================

Refinement Prompt:
$refinementPrompt

---

Refined Result:
$currentPrompt
"@ | Set-Content -Path $iterationFile -Encoding UTF8
            }

            # Check for early stop indicators using configurable patterns
            $shouldStop = $false
            foreach ($pattern in $script:EARLY_STOP_PATTERNS) {
                if ($currentPrompt -match $pattern) {
                    Write-Verbose "AI indicated refinement is complete at iteration $iterationNum (matched pattern: $pattern)"
                    $shouldStop = $true
                    break
                }
            }
            if ($shouldStop) { break }
        }

        # Calculate cost estimate using pricing constants
        $pricing = $script:OPENAI_PRICING[$Model]
        if (-not $pricing) {
            # Fallback to gpt-4o-mini pricing if model not found
            Write-Verbose "Pricing not found for model '$Model', using gpt-4o-mini pricing"
            $pricing = $script:OPENAI_PRICING['gpt-4o-mini']
        }
        
        $estimatedCost = [Math]::Round(
            (($totalPromptTokens / 1000000) * $pricing.Prompt) +
            (($totalCompletionTokens / 1000000) * $pricing.Completion),
            6
        )

        Write-Verbose "Refinement complete. Total tokens: $totalTokens | Estimated cost: `$$estimatedCost"

        # Build YAML prompt structure
        $promptYaml = Build-PromptYaml -PromptId $PromptId `
            -Title $Title `
            -Category $Category `
            -Tags $Tags `
            -UserTemplate $currentPrompt

        # Validate prompt structure if not skipped
        if (-not $SkipValidation) {
            Write-Verbose "Validating prompt structure..."
            $validationResult = Test-PromptStructure -PromptYaml $promptYaml
            if (-not $validationResult.IsValid) {
                Write-Warning "Prompt validation warnings: $($validationResult.Warnings -join '; ')"
            }
        }

        # Save to data/prompts directory
        $promptsDir = Join-Path $Script:DataRoot 'prompts'
        if (-not (Test-Path $promptsDir)) {
            New-Item -ItemType Directory -Path $promptsDir -Force | Out-Null
        }

        $yamlFilePath = Join-Path $promptsDir "$PromptId.yaml"
        Set-Content -Path $yamlFilePath -Value $promptYaml -Encoding UTF8
        Write-Verbose "Prompt saved to: $yamlFilePath"

        # Update database index
        try {
            Update-PromptIndex -PromptId $PromptId `
                -Title $Title `
                -Version '1.0.0' `
                -Category $Category `
                -Tags $Tags `
                -Checksum (Get-ContentHash -Text $promptYaml) `
                -FilePath $yamlFilePath
            Write-Verbose "Prompt index updated"
        }
        catch {
            Write-Warning "Failed to update prompt index: $_"
        }

        # Return result object
        $result = [PSCustomObject]@{
            PromptId       = $PromptId
            FilePath       = $yamlFilePath
            RefinedPrompt  = $currentPrompt
            Iterations     = $iterations.Count
            TokensUsed     = $totalTokens
            EstimatedCost  = $estimatedCost
            ArtifactsPath  = $artifactsPath
        }

        Write-Host "✓ Refined prompt saved: $PromptId" -ForegroundColor Green
        Write-Host "  Location: $yamlFilePath" -ForegroundColor Cyan
        Write-Host "  Iterations: $($iterations.Count) | Tokens: $totalTokens | Cost: `$$estimatedCost" -ForegroundColor Cyan

        return $result
    }
    catch {
        Write-Error "Error during prompt refinement: $_"
        throw
    }
}

function Invoke-OpenAIRefinement {
    <#
.SYNOPSIS
    Helper function to call OpenAI API for prompt refinement.
#>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Prompt,

        [Parameter(Mandatory)]
        [string]$Model,

        [Parameter(Mandatory)]
        [string]$ApiKey
    )

    $endpoint = "https://api.openai.com/v1/chat/completions"
    $headers = @{
        "Authorization" = "Bearer $ApiKey"
        "Content-Type"  = "application/json"
    }

    # Estimate max tokens needed based on prompt length
    # Uses CHARS_PER_TOKEN ratio to estimate tokens from character count
    $promptLength = [Math]::Ceiling($Prompt.Length / $script:CHARS_PER_TOKEN)
    # Allow response to be TOKEN_MULTIPLIER times prompt length, bounded by MIN/MAX_MAX_TOKENS
    $maxTokens = [Math]::Min($script:MAX_MAX_TOKENS, [Math]::Max($script:MIN_MAX_TOKENS, $promptLength * $script:TOKEN_MULTIPLIER))

    $body = @{
        model       = $Model
        messages    = @(
            @{
                role    = "user"
                content = $Prompt
            }
        )
        max_tokens  = $maxTokens
        temperature = 0.7
    } | ConvertTo-Json -Depth 10 -Compress

    try {
        $response = Invoke-RestMethod -Uri $endpoint -Method Post -Headers $headers -Body $body -ErrorAction Stop

        return [PSCustomObject]@{
            Content          = $response.choices[0].message.content.Trim()
            TotalTokens      = $response.usage.total_tokens
            PromptTokens     = $response.usage.prompt_tokens
            CompletionTokens = $response.usage.completion_tokens
        }
    }
    catch {
        Write-Error "OpenAI API call failed: $_"
        return $null
    }
}

function Build-PromptYaml {
    <#
.SYNOPSIS
    Constructs a YAML prompt definition consistent with existing schema.
#>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$PromptId,

        [Parameter(Mandatory)]
        [string]$Title,

        [Parameter()]
        [string]$Category = 'general',

        [Parameter()]
        [string[]]$Tags = @(),

        [Parameter(Mandatory)]
        [string]$UserTemplate
    )

    $timestamp = Get-Date -Format 'o'
    $version = 1

    # Build tags array string
    $tagsString = if ($Tags.Count -gt 0) {
        '[' + ($Tags -join ', ') + ']'
    }
    else {
        '[]'
    }

    # Generate checksum placeholder
    $checksum = Get-ContentHash -Text $UserTemplate

    # Build YAML structure matching existing schema
    $yaml = @"
id: $PromptId
title: $Title
version: $version
category: $Category
tags: $tagsString
model_hints: [gpt, gemini]
system: |
  You are a helpful AI assistant. Follow the instructions carefully and provide accurate, relevant responses.
user_template: |
  $UserTemplate
checksum: $checksum
created_utc: $timestamp
"@

    return $yaml
}

function Test-PromptStructure {
    <#
.SYNOPSIS
    Validates a prompt YAML structure against expected schema.
#>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$PromptYaml
    )

    $warnings = [System.Collections.Generic.List[string]]::new()
    $isValid = $true

    # Check required fields
    $requiredFields = @('id:', 'title:', 'version:', 'user_template:')
    foreach ($field in $requiredFields) {
        if ($PromptYaml -notmatch [regex]::Escape($field)) {
            $warnings.Add("Missing required field: $field")
            $isValid = $false
        }
    }

    # Check for reasonable length
    if ($PromptYaml.Length -lt 50) {
        $warnings.Add("YAML content seems too short")
        $isValid = $false
    }

    # Check for valid YAML structure markers
    if ($PromptYaml -notmatch '\|' -and $PromptYaml -notmatch '>') {
        $warnings.Add("Missing multiline string indicators (| or >)")
    }

    return [PSCustomObject]@{
        IsValid  = $isValid
        Warnings = $warnings
    }
}

Export-ModuleMember -Function New-RefinedPrompt
