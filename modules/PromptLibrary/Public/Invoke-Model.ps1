#requires -Version 5.1
function Invoke-Model {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][ValidateSet('openai', 'anthropic')][string]$Provider,
        [Parameter(Mandatory)][string]$Model,
        [Parameter(Mandatory)][string]$System,
        [Parameter(Mandatory)][string]$User,
        [int]$MaxTokens = 1024,
        [double]$Temperature = 0.2,
        [string]$ApiBase = 'https://api.openai.com/v1'
    )

    switch ($Provider) {
        'openai' {
            $apiKey = Get-SecretValue -Name 'OPENAI_API_KEY'
            if (-not $apiKey) {
                Write-Warning "OPENAI_API_KEY not found. Falling back to simulated response."
                return Invoke-SimulatedModel -Provider $Provider -Model $Model -System $System -User $User -MaxTokens $MaxTokens
            }

            $payload = @{
                model = $Model
                temperature = $Temperature
                max_tokens = $MaxTokens
                messages = @(
                    @{ role = 'system'; content = $System },
                    @{ role = 'user'; content = $User }
                )
            } | ConvertTo-Json -Depth 6

            $client = [System.Net.Http.HttpClient]::new()
            try {
                $client.Timeout = [TimeSpan]::FromSeconds(120)
                $client.DefaultRequestHeaders.Authorization = "Bearer $apiKey"
                $client.DefaultRequestHeaders.Accept.ParseAdd("application/json")

                $content = New-Object System.Net.Http.StringContent($payload, [System.Text.Encoding]::UTF8, "application/json")
                $response = $client.PostAsync("$ApiBase/chat/completions", $content).GetAwaiter().GetResult()
                $json = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
                if (-not $response.IsSuccessStatusCode) {
                    throw "OpenAI request failed: $($response.StatusCode) $json"
                }

                $result = $json | ConvertFrom-Json -Depth 6
                $first = $result.choices | Select-Object -First 1
                return @{
                    text = $first.message.content
                    raw  = $result
                }
            }
            finally {
                $client.Dispose()
            }
        }
        'anthropic' {
            $apiKey = Get-SecretValue -Name 'ANTHROPIC_API_KEY'
            if (-not $apiKey) {
                Write-Warning "ANTHROPIC_API_KEY not found. Falling back to simulated response."
                return Invoke-SimulatedModel -Provider $Provider -Model $Model -System $System -User $User -MaxTokens $MaxTokens
            }

            $payload = @{
                model = $Model
                max_tokens = $MaxTokens
                temperature = $Temperature
                system = $System
                messages = @(
                    @{ role = 'user'; content = $User }
                )
            } | ConvertTo-Json -Depth 6

            $client = [System.Net.Http.HttpClient]::new()
            try {
                $client.Timeout = [TimeSpan]::FromSeconds(120)
                $client.DefaultRequestHeaders.Add("x-api-key", $apiKey)
                $client.DefaultRequestHeaders.Add("anthropic-version", "2023-06-01")
                $client.DefaultRequestHeaders.Accept.ParseAdd("application/json")

                $content = New-Object System.Net.Http.StringContent($payload, [System.Text.Encoding]::UTF8, "application/json")
                $response = $client.PostAsync("https://api.anthropic.com/v1/messages", $content).GetAwaiter().GetResult()
                $json = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
                if (-not $response.IsSuccessStatusCode) {
                    throw "Anthropic request failed: $($response.StatusCode) $json"
                }

                $result = $json | ConvertFrom-Json -Depth 6
                $text = ($result.content | ForEach-Object { $_.text }) -join ''
                return @{
                    text = $text
                    raw  = $result
                }
            }
            finally {
                $client.Dispose()
            }
        }
    }
}

function Invoke-SimulatedModel {
    param(
        [string]$Provider,
        [string]$Model,
        [string]$System,
        [string]$User,
        [int]$MaxTokens
    )

    $systemPreview = ($System -replace '\s+', ' ').Trim()
    $userPreview = ($User -replace '\s+', ' ').Trim()
    $text = @"
[Simulated $Provider completion]
Model : $Model
System: $([string]::Join('', $systemPreview.Substring(0, [Math]::Min(180, $systemPreview.Length))))
User  : $([string]::Join('', $userPreview.Substring(0, [Math]::Min(180, $userPreview.Length))))

Tokens requested: $MaxTokens
"@

    @{
        text = $text.Trim()
        raw  = @{
            provider = $Provider
            model    = $Model
            system   = $systemPreview
            user     = $userPreview
        }
    }
}
