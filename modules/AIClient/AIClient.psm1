#!/usr/bin/env pwsh
<#
.SYNOPSIS
    AI client abstraction for OpenAI-compatible APIs
.DESCRIPTION
    Provides a centralized AI client with:
    - Environment-based configuration (no secrets in code)
    - Error handling and retry logic
    - Support for multiple AI providers
    - Prompt construction helpers
#>

$ErrorActionPreference = 'Stop'

# Module-level state
$script:AIClientConfig = @{
    Endpoint = $null
    ApiKey = $null
    Model = $null
    Provider = $null
    MaxRetries = 3
    RetryDelay = 2  # seconds
    Timeout = 120   # seconds
}

# ============================================================================
# Configuration
# ============================================================================

<#
.SYNOPSIS
    Initializes the AI client with configuration
.PARAMETER Endpoint
    API endpoint URL (e.g., https://api.openai.com/v1)
.PARAMETER ApiKey
    API key for authentication (defaults to OPENAI_API_KEY env var)
.PARAMETER Model
    Model name to use (defaults to gpt-4o-mini)
.PARAMETER Provider
    Provider name (openai, azure, anthropic, etc.)
.PARAMETER MaxRetries
    Maximum number of retries on failure
.PARAMETER RetryDelay
    Delay between retries in seconds
#>
function Initialize-AIClient {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $false)]
        [string]$Endpoint = $env:OPENAI_API_ENDPOINT,
        
        [Parameter(Mandatory = $false)]
        [string]$ApiKey = $env:OPENAI_API_KEY,
        
        [Parameter(Mandatory = $false)]
        [string]$Model = $env:OPENAI_MODEL,
        
        [Parameter(Mandatory = $false)]
        [string]$Provider = 'openai',
        
        [Parameter(Mandatory = $false)]
        [int]$MaxRetries = 3,
        
        [Parameter(Mandatory = $false)]
        [int]$RetryDelay = 2
    )
    
    # Set defaults
    if (-not $Endpoint) {
        $Endpoint = 'https://api.openai.com/v1'
    }
    
    if (-not $Model) {
        $Model = 'gpt-4o-mini'
    }
    
    # Validate API key is available
    if (-not $ApiKey) {
        Write-Warning "No API key provided. Set OPENAI_API_KEY environment variable or use -ApiKey parameter."
        Write-Warning "AI features will be disabled."
        $script:AIClientConfig.ApiKey = $null
        return
    }
    
    # Basic API key format validation
    $ApiKey = $ApiKey.Trim()
    if ($ApiKey -match '[\r\n\t]' -or $ApiKey.Length -lt 20) {
        Write-Error "Invalid API key format. API key should not contain whitespace or special characters."
        $script:AIClientConfig.ApiKey = $null
        return
    }
    
    $script:AIClientConfig.Endpoint = $Endpoint
    $script:AIClientConfig.ApiKey = $ApiKey
    $script:AIClientConfig.Model = $Model
    $script:AIClientConfig.Provider = $Provider
    $script:AIClientConfig.MaxRetries = $MaxRetries
    $script:AIClientConfig.RetryDelay = $RetryDelay
    
    Write-Verbose "AI Client initialized: Provider=$Provider, Model=$Model, Endpoint=$Endpoint"
}

# ============================================================================
# AI Completion
# ============================================================================

<#
.SYNOPSIS
    Invokes an AI completion request
.PARAMETER Prompt
    The prompt text to send to the AI
.PARAMETER SystemPrompt
    Optional system prompt to set context
.PARAMETER Temperature
    Sampling temperature (0.0 to 2.0)
.PARAMETER MaxTokens
    Maximum tokens to generate
.PARAMETER Metadata
    Additional metadata to track with the request
#>
function Invoke-AICompletion {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Prompt,
        
        [Parameter(Mandatory = $false)]
        [string]$SystemPrompt = "You are a helpful AI assistant analyzing repository health and code quality.",
        
        [Parameter(Mandatory = $false)]
        [double]$Temperature = 0.7,
        
        [Parameter(Mandatory = $false)]
        [int]$MaxTokens = 2000,
        
        [Parameter(Mandatory = $false)]
        [hashtable]$Metadata = @{}
    )
    
    # Initialize if not already done
    if (-not $script:AIClientConfig.ApiKey) {
        Initialize-AIClient
    }
    
    # Check if AI is available
    if (-not $script:AIClientConfig.ApiKey) {
        Write-Warning "AI client not configured. Skipping AI completion."
        return @{
            success = $false
            error = "AI client not configured (missing API key)"
            content = $null
        }
    }
    
    $startTime = Get-Date
    $attempt = 0
    $lastError = $null
    
    while ($attempt -lt $script:AIClientConfig.MaxRetries) {
        $attempt++
        
        try {
            Write-Verbose "AI completion attempt $attempt/$($script:AIClientConfig.MaxRetries)"
            
            # Build request
            $messages = @(
                @{
                    role = "system"
                    content = $SystemPrompt
                },
                @{
                    role = "user"
                    content = $Prompt
                }
            )
            
            $requestBody = @{
                model = $script:AIClientConfig.Model
                messages = $messages
                temperature = $Temperature
                max_tokens = $MaxTokens
            } | ConvertTo-Json -Depth 10
            
            # Make API request
            # Note: API key should be properly sanitized in Initialize-AIClient
            $headers = @{
                'Authorization' = "Bearer $($script:AIClientConfig.ApiKey.Trim())"
                'Content-Type' = 'application/json'
            }
            
            $endpoint = "$($script:AIClientConfig.Endpoint)/chat/completions"
            
            $response = Invoke-RestMethod -Uri $endpoint -Method Post -Headers $headers -Body $requestBody -TimeoutSec $script:AIClientConfig.Timeout
            
            # Extract completion
            $content = $response.choices[0].message.content
            $duration = (Get-Date) - $startTime
            
            Write-Verbose "AI completion successful (duration: $($duration.TotalSeconds)s)"
            
            # Return result
            return @{
                success = $true
                content = $content
                model = $response.model
                usage = @{
                    prompt_tokens = $response.usage.prompt_tokens
                    completion_tokens = $response.usage.completion_tokens
                    total_tokens = $response.usage.total_tokens
                }
                duration_seconds = [Math]::Round($duration.TotalSeconds, 2)
                metadata = $Metadata
            }
            
        } catch {
            $lastError = $_
            Write-Warning "AI completion attempt $attempt failed: $($_.Exception.Message)"
            
            # Don't retry on authentication errors
            if ($_.Exception.Message -match '401|403|authentication|unauthorized') {
                Write-Error "Authentication error. Check your API key."
                break
            }
            
            # Retry with exponential backoff
            if ($attempt -lt $script:AIClientConfig.MaxRetries) {
                $delay = $script:AIClientConfig.RetryDelay * [Math]::Pow(2, $attempt - 1)
                Write-Verbose "Retrying in $delay seconds..."
                Start-Sleep -Seconds $delay
            }
        }
    }
    
    # All retries failed
    $duration = (Get-Date) - $startTime
    
    Write-Error "AI completion failed after $attempt attempts: $($lastError.Exception.Message)"
    
    return @{
        success = $false
        error = $lastError.Exception.Message
        content = $null
        duration_seconds = [Math]::Round($duration.TotalSeconds, 2)
        metadata = $Metadata
    }
}

# ============================================================================
# Connection Test
# ============================================================================

<#
.SYNOPSIS
    Tests the AI client connection
#>
function Test-AIConnection {
    [CmdletBinding()]
    param()
    
    # Initialize if not already done
    if (-not $script:AIClientConfig.ApiKey) {
        Initialize-AIClient
    }
    
    if (-not $script:AIClientConfig.ApiKey) {
        Write-Warning "AI client not configured"
        return $false
    }
    
    try {
        $result = Invoke-AICompletion -Prompt "Say 'OK' if you can hear me." -MaxTokens 10
        
        if ($result.success) {
            Write-Host "✓ AI client connection successful" -ForegroundColor Green
            Write-Host "  Model: $($result.model)"
            Write-Host "  Response: $($result.content)"
            return $true
        } else {
            Write-Warning "AI client connection test failed: $($result.error)"
            return $false
        }
    } catch {
        Write-Error "AI client connection test failed: $_"
        return $false
    }
}

# Export module members
Export-ModuleMember -Function @(
    'Initialize-AIClient',
    'Invoke-AICompletion',
    'Test-AIConnection'
)
