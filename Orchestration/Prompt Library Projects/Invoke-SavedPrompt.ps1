### BEGIN FILE: tools/Invoke-SavedPrompt.ps1
#requires -Version 7
<#
.SYNOPSIS
    Call an OpenAI saved prompt (by prompt.id) and send dynamic input.
.DESCRIPTION
    - Reads OPENAI_API_KEY from env (or accepts -ApiKey).
    - Posts to /v1/responses with the given PromptId and Input text.
    - Writes the response to console AND to an artifacts file under ./.ai-outputs/.
    - Returns nonzero exit on error (so Tasks can fail visibly).
.PARAMETER PromptId
    The saved prompt id (e.g., pmpt_68aceb...).
.PARAMETER Input
    The text you want to pass as "input" to the prompt.
.PARAMETER FromFile
    Optional path; if supplied, file content is used as Input (overrides -Input).
.PARAMETER ApiKey
    Optional override for OPENAI_API_KEY.
.PARAMETER Model
    Optional explicit model override (rarely needed when using saved prompts).
.EXAMPLE
    ./tools/Invoke-SavedPrompt.ps1 -PromptId pmpt_xxx -Input "Build a dark-mode landing page"
.EXAMPLE
    ./tools/Invoke-SavedPrompt.ps1 -PromptId pmpt_xxx -FromFile .\src\index.html
#>

param(
    [Parameter(Mandatory)]
    [string] $PromptId,

    [Parameter()]
    [string] $Input,

    [Parameter()]
    [string] $FromFile,

    [string] $ApiKey = $env:OPENAI_API_KEY,

    [string] $Model  # Optional: usually not needed when using saved prompts
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- Basic validation ---------------------------------------------------------
if (-not $ApiKey) {
    Write-Error "OPENAI_API_KEY is not set and -ApiKey not provided. Aborting."
    exit 2
}

if ($FromFile) {
    if (-not (Test-Path -LiteralPath $FromFile)) {
        Write-Error "FromFile not found: $FromFile"
        exit 3
    }
    # Read file as UTF8 text
    $Input = Get-Content -LiteralPath $FromFile -Raw -Encoding UTF8
}

if ([string]::IsNullOrWhiteSpace($Input)) {
    Write-Error "No input provided. Use -Input '...' or -FromFile <path>."
    exit 4
}

# --- Build request body -------------------------------------------------------
$body = @{
    prompt = @{
        id      = $PromptId
        version = "1"
    }
    input = $Input
}
if ($Model) { $body.model = $Model }

# --- HTTP call ---------------------------------------------------------------
$uri = "https://api.openai.com/v1/responses"
$headers = @{
    "Authorization" = "Bearer $ApiKey"
    "Content-Type"  = "application/json"
}

try {
    # Use -SkipHttpErrorCheck so we can parse bodies on non-2xx and show better errors
    $resp = Invoke-RestMethod -Method POST -Uri $uri -Headers $headers -Body ($body | ConvertTo-Json -Depth 50) -SkipHttpErrorCheck
}
catch {
    Write-Error "HTTP request failed: $($_.Exception.Message)"
    exit 10
}

# --- Extract content robustly -------------------------------------------------
# Responses API can return different shapes depending on tool settings.
# Common shape: { output: [ { content: [ { type: "output_text", text: "..." } ] } ] }
function Get-FriendlyOutput {
    param([object] $Response)

    if ($Response.output) {
        # Concatenate any text fragments found
        $texts = foreach ($o in $Response.output) {
            if ($o.content) {
                foreach ($c in $o.content) {
                    if ($c.type -eq 'output_text' -and $c.text) { $c.text }
                    elseif ($c.type -eq 'input_text' -and $c.text) { $c.text }  # fallback
                }
            }
        }
        if ($texts) { return ($texts -join "`n`n") }
    }

    # Fallback: stringify whole object for debugging
    return ($Response | ConvertTo-Json -Depth 50)
}

$outText = Get-FriendlyOutput -Response $resp

# --- Persist to artifacts -----------------------------------------------------
$artDir = Join-Path -Path (Get-Location) -ChildPath ".ai-outputs"
if (-not (Test-Path -LiteralPath $artDir)) {
    New-Item -ItemType Directory -Path $artDir | Out-Null
}

$stamp  = (Get-Date).ToString("yyyy-MM-dd_HH-mm-ss")
$short  = $PromptId.Substring(0, [Math]::Min($PromptId.Length, 14))
$outPath = Join-Path $artDir "$stamp-$short.md"

@"
# OpenAI Saved Prompt Output
- PromptId: $PromptId
- Timestamp: $(Get-Date -Format o)
- Source: $(if ($FromFile) { "FromFile: $FromFile" } else { "Inline Input" })

---
$outText
"@ | Out-File -FilePath $outPath -Encoding utf8

# --- Emit to console for quick viewing ---------------------------------------
Write-Host "=== OpenAI Response (begin) ==="
Write-Output $outText
Write-Host "`n=== OpenAI Response (saved to): $outPath ==="

# Exit 0 on success
exit 0
### END FILE: tools/Invoke-SavedPrompt.ps1
