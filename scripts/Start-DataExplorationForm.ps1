#requires -Version 7
# https://platform.openai.com/docs/guides/prompt-engineering

param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ===== Config =====
$DataExtraction_API_KEY = $env:DataExtraction_API_KEY   # set externally or here
$OpenAIBaseUrl = "https://api.openai.com/v1"
$Model = "gpt-5"

# Saved Prompt IDs (replace with your real IDs)
$pr_DataExploration_P1_v1 = "pmpt_68d737d92c588197add742c2ed53dc8701133941fd6991f7"
$pr_DataExploration_P2_v1 = "pmpt_68d73849881c8197a6ae5381cadfd32b084c874d5183357e"
$pr_DataExploration_P3_v1 = "pmpt_68d7389f8c0c8195b922e1239a93d6d705aaa44dbee4e01a"
$pr_DataExploration_MP_v1 = "pmpt_68d738e039c88193af42762fe4a01bda0109dcf4f988cf50"

# Preflight: confirm sample input and credentials
$samplePath = "G:\Storage\BenStuff\Development\OpenAI\DataExtraction\2025-09-26_Prompt_PromptDesignRefinement.txt"

if (-not (Test-Path -LiteralPath $samplePath)) {
    throw "Sample file not found: $samplePath"
}

if (-not $Env:DataExtraction_API_KEY -or [string]::IsNullOrWhiteSpace($Env:DataExtraction_API_KEY)) {
    throw "DataExtraction_API_KEY is not set in the current session."
}

# Read sample (smart encoding) and apply length cap
#$sampleText = Limit-Text (Read-TextSmart -PathOrText $samplePath)

# Optional: quick prompt-id sanity check (placeholders will 4xx)
foreach ($id in @(
    $pr_DataExploration_P1_v1, $pr_DataExploration_P2_v1,
    $pr_DataExploration_P3_v1, $pr_DataExploration_MP_v1
)) {
    if ($id -match '^pmpt_XXXX') {
        Write-Warning "This looks like a placeholder prompt ID: $id"
    }
}
# House instructions applied to all steps
$HouseInstructions = @"
House Style:
- Prefer crisp, decision-focused writing.
- Always include the section headings specified in the OUTPUT CONTRACT, in order.
- Use Markdown tables when tabular output is requested; otherwise use short bullets.
- Call out data quality issues explicitly (missingness, skew, outliers).
- When hypothesizing causes, label them H1, H2… and keep them falsifiable.
- Do not fabricate field names; if inferred, say ""(inferred)"" after the name.
- If a step requests methods/queries, provide concrete, minimal sketches (SQL-like, pseudocode, or filter logic).
"@

# ===== Dependencies =====
Add-Type -AssemblyName System.Web

# ===== Helpers =====
function New-OpenAIHeaders {
  if (-not $Env:DataExtraction_API_KEY) { throw "Set `$Env:DataExtraction_API_KEY first." }
  return @{
    "Authorization" = "Bearer $($Env:DataExtraction_API_KEY)"
    "Content-Type"  = "application/json"
  }
}

function Limit-Text {
  param([string]$Text, [int]$MaxChars = 120000)
  if (-not $Text) { return "" }
  if ($Text.Length -le $MaxChars) { return $Text }
  return $Text.Substring(0, $MaxChars) + "`n...[truncated]..."
}

function Read-TextSmart {
  <#
    Reads a file as text and auto-detects UTF-16/UTF-8 encodings.
    If you pass raw text, it just returns it.
  #>
  param([Parameter(Mandatory)][string]$PathOrText)
  if (Test-Path $PathOrText) {
    $bytes = [System.IO.File]::ReadAllBytes($PathOrText)
    # BOM sniffing
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) { return [Text.Encoding]::Unicode.GetString($bytes) }           # UTF-16 LE
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) { return [Text.Encoding]::BigEndianUnicode.GetString($bytes) }  # UTF-16 BE
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) { return [Text.Encoding]::UTF8.GetString($bytes) } # UTF-8 BOM
    try { return [Text.Encoding]::UTF8.GetString($bytes) } catch { return [Text.Encoding]::Unicode.GetString($bytes) }
  }
  else {
    return $PathOrText
  }
}

function Get-FirstNextStepBullet {
  param([Parameter(Mandatory)][string]$Markdown)
  $nextSteps = $Markdown -split "##\s*Next Steps" | Select-Object -Last 1
  $bullet = ($nextSteps -split "`n") | Where-Object { $_ -match '^\s*-\s+' } | Select-Object -First 1
  if ($bullet) { return ($bullet -replace '^\s*-\s+', '').Trim() }
  return $null
}

function Invoke-OpenAIResponse {
  param(
    [Parameter(Mandatory)][string] $PromptId,
    [hashtable] $Variables,
    [string] $Instructions = $HouseInstructions,
    [object[]] $Input = @(),            # conversation turns; leave empty if none
    [hashtable[]] $Tools,
    [hashtable] $Metadata,
    [string] $ModelOverride,
    [int] $TimeoutSec = 120,
    [int] $MaxRetries = 3,
    [switch] $VerboseErrors
  )

  $body = [ordered]@{
    model        = $(if ($ModelOverride) { $ModelOverride } else { $Model })
    prompt_id    = $PromptId
    instructions = $Instructions
  }

  if ($Variables) { $body.parameters = $Variables }
  if ($Tools)     { $body.tools      = $Tools }
  if ($Metadata)  { $body.metadata   = $Metadata }

  # 🔧 ensure input — Responses API requires it even with prompt_id
  if (-not $Input -or $Input.Count -eq 0) {
    $body.input = @(@{ role = "user"; content = "Use the saved prompt with the provided parameters." })
  } else {
    $body.input = $Input
  }

  $json    = $body | ConvertTo-Json -Depth 12
  $attempt = 0
  $delay   = 1

  while ($true) {
    try {
      return Invoke-RestMethod -Method POST -Uri "$OpenAIBaseUrl/responses" -Headers (New-OpenAIHeaders) -Body $json -TimeoutSec $TimeoutSec
    } catch {
      $attempt++

      $ex = $_.Exception
      $status = $null
      $errBody = $null

      if ($ex -is [System.Net.WebException]) {
        if ($ex.Response) {
          try { $status = [int]$ex.Response.StatusCode.value__ } catch {}
          try {
            $stream = $ex.Response.GetResponseStream()
            if ($stream) {
              $reader = New-Object IO.StreamReader($stream)
              $errBody = $reader.ReadToEnd()
              $reader.Dispose(); $stream.Dispose()
            }
          } catch {}
        }
      } elseif ($ex.PSObject.Properties['StatusCode']) {
        try { $status = [int]$ex.StatusCode } catch {}
      } elseif ($ex.PSObject.Properties['Response'] -and $ex.Response) {
        try { $status = [int]$ex.Response.StatusCode.value__ } catch {}
      }

      if ($VerboseErrors) {
        Write-Warning ("OpenAI call failed (attempt {0}) Status={1}`n{2}" -f $attempt, ($status ?? 'n/a'), ($errBody ?? ($_ | Out-String)))
      }

      if ($attempt -lt $MaxRetries -and ($status -in 429,500,502,503,504)) {
        Start-Sleep -Seconds $delay
        $delay = [Math]::Min($delay * 2, 16)
        continue
      }

      if ($errBody) { throw "OpenAI /responses call failed. HTTP=$status Body=$errBody" } else { throw }
    }
  }
}


function Get-ResponseText {
  param([Parameter(Mandatory)][object]$ApiResponse)
  if ($ApiResponse.output_text) { return $ApiResponse.output_text }

  if ($ApiResponse.output -and $ApiResponse.output.Count -gt 0) {
    $c = $ApiResponse.output[0].content
    if ($c -and $c.Count -gt 0 -and $c[0].text) { return $c[0].text }
  }

  # Fallback: stringify whole object for debugging
  return ($ApiResponse | ConvertTo-Json -Depth 12)
}

# ===== Step wrappers =====
function Invoke-DataExplorationP1 {
  param(
    [Parameter(Mandatory)][string]$PromptId,
    [Parameter(Mandatory)][string]$Domain,
    [Parameter(Mandatory)][string]$Format,
    [Parameter(Mandatory)][string]$DataDescription,
    [Parameter(Mandatory)][string]$DatasetSample
  )
  $vars = @{
    domain           = $Domain
    format           = $Format
    data_description = $DataDescription
    dataset_sample   = $DatasetSample
  }
  $resp = Invoke-OpenAIResponse -PromptId $PromptId -Variables $vars -Metadata @{ chain = "DataExploration"; step = "P1" }
  [pscustomobject]@{ Step = "P1"; Raw = $resp; Text = (Get-ResponseText $resp) }
}

function Invoke-DataExplorationP2 {
  param(
    [Parameter(Mandatory)][string]$PromptId,
    [Parameter(Mandatory)][string]$SpecificFocus,
    [string]$PriorSummary
  )
  $vars = @{ specific_focus = $SpecificFocus }
  if ($PriorSummary) { $vars.prior_summary = $PriorSummary }
  $resp = Invoke-OpenAIResponse -PromptId $PromptId -Variables $vars -Metadata @{ chain = "DataExploration"; step = "P2" }
  [pscustomobject]@{ Step = "P2"; Raw = $resp; Text = (Get-ResponseText $resp) }
}

function Invoke-DataExplorationP3 {
  param(
    [Parameter(Mandatory)][string]$PromptId,
    [string]$PriorFindings
  )
  $vars = @{}
  if ($PriorFindings) { $vars.prior_findings = $PriorFindings }
  $resp = Invoke-OpenAIResponse -PromptId $PromptId -Variables $vars -Metadata @{ chain = "DataExploration"; step = "P3" }
  [pscustomobject]@{ Step = "P3"; Raw = $resp; Text = (Get-ResponseText $resp) }
}

function Invoke-DataExplorationMP {
    param(
        [Parameter(Mandatory)][string]$PromptId,
        [Parameter(Mandatory)][string]$OriginalRequest,
        [Parameter(Mandatory)][string]$LastOutput
    )
    $vars = @{
        original_request = $OriginalRequest
        last_output      = $LastOutput
    }
    $resp = Invoke-OpenAIResponse -PromptId $PromptId -Variables $vars -Metadata @{ chain = "DataExploration"; step = "MP" }
    [pscustomobject]@{ Step = "MP"; Raw = $resp; Text = (Get-ResponseText $resp) }
}

# ===== Orchestrator =====
# Requires: $env:DataExtraction_API_KEY and $OpenAIBaseUrl (e.g., https://api.openai.com/v1)
# Works on: Windows PowerShell 5.1 and PowerShell 7+

function Resolve-PromptText {
    <#
    .SYNOPSIS
    Resolve an "ID" into prompt text (file path, literal, or registry map).

    .DESCRIPTION
    - If the value points to an existing file, reads it as UTF8.
    - Else if it exists in $script:PromptRegistry (hashtable), returns that.
    - Else treats the value as a literal prompt string.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$IdOrText
    )
    # -- File path?
    if (Test-Path -LiteralPath $IdOrText) {
        return [System.IO.File]::ReadAllText((Resolve-Path -LiteralPath $IdOrText), [Text.Encoding]::UTF8)
    }

    # -- Registry lookup?
    if ($script:PromptRegistry -and $script:PromptRegistry.ContainsKey($IdOrText)) {
        return [string]$script:PromptRegistry[$IdOrText]
    }

    # -- Fallback: treat input as literal prompt content
    return $IdOrText
}

function Start-DataExplorationChain {
    <#
    .SYNOPSIS
    Compose multiple prompt segments into a single Responses API call (no prompt_id).

    .PARAMETER P1_Id
    First prompt segment (file path, registry key, or literal text)

    .PARAMETER P2_Id
    Second prompt segment

    .PARAMETER P3_Id
    Third prompt segment

    .PARAMETER MP_Id
    Meta-prompt / instructions segment

    .PARAMETER Domain
    Short domain label used in the input and metadata (e.g., "prompt engineering")

    .PARAMETER Format
    Desired output format hint (e.g., "txt", "md", "json")

    .PARAMETER DataDescription
    Human description of the dataset/problem context

    .PARAMETER DatasetSample
    Optional sample text to ground the response

    .PARAMETER Model
    OpenAI model for the Responses API

    .PARAMETER Temperature
    Creativity control (0.0–2.0 typical)

    .OUTPUTS
    PSCustomObject with Response, DurationMs, and Raw payload
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$P1_Id,
        [Parameter(Mandatory)][string]$P2_Id,
        [Parameter(Mandatory)][string]$P3_Id,
        [Parameter(Mandatory)][string]$MP_Id,
        [Parameter(Mandatory)][string]$Domain,
        [Parameter(Mandatory)][ValidateSet('txt','md','json','html')][string]$Format,
        [Parameter(Mandatory)][string]$DataDescription,
        [Parameter()][string]$DatasetSample,
        [Parameter()][string]$Model = 'gpt-5.1-mini',
        [Parameter()][ValidateRange(0.0,2.0)][double]$Temperature = 0.3,
        [Parameter()][int]$MaxOutputTokens = 2048
    )

    Set-StrictMode -Version Latest
    $ErrorActionPreference = 'Stop'

    # -- Validate env/URI ------------------------------------------------------
    if ([string]::IsNullOrWhiteSpace($env:DataExtraction_API_KEY)) {
        throw "DataExtraction_API_KEY environment variable is not set."
    }

    if (-not $script:OpenAIBaseUrl) {
        # Allow you to set $script:OpenAIBaseUrl in your profile/module once
        $script:OpenAIBaseUrl = 'https://api.openai.com/v1'
    }

    $responsesUri = "$($script:OpenAIBaseUrl.TrimEnd('/'))/responses"

    # -- Resolve all prompt segments to plain text ------------------------------
    $mpText  = Resolve-PromptText -IdOrText $MP_Id
    $p1Text  = Resolve-PromptText -IdOrText $P1_Id
    $p2Text  = Resolve-PromptText -IdOrText $P2_Id
    $p3Text  = Resolve-PromptText -IdOrText $P3_Id

    # -- Compose a structured input array for the Responses API ----------------
    # NOTE: The Responses API accepts "input" as string or array. Using an array
    # keeps segments clean, improves inspectability, and avoids illegal fields like 'prompt_id'.
    $input = @(
        "META:\nDomain: $Domain\nDesired Format: $Format\nData Description: $DataDescription",
        "META-PROMPT:\n$mpText",
        "PROMPT-SEGMENT P1:\n$p1Text",
        "PROMPT-SEGMENT P2:\n$p2Text",
        "PROMPT-SEGMENT P3:\n$p3Text"
    )

    if ($DatasetSample) {
        $input += "DATASET-SAMPLE:\n$DatasetSample"
    }

    # -- Build request body per Responses API spec (NO prompt_id) --------------
    $body = [ordered]@{
        model             = $Model
        input             = $input                       # <- key fix
        temperature       = $Temperature
        max_output_tokens = $MaxOutputTokens
        metadata          = @{
            domain = $Domain
            format = $Format
        }
        # tools        = @()    # Add tools here if/when you actually use them
        # tool_choice  = "auto"
        # reasoning    = @{ effort = "medium" }  # Optional, if supported by your model
    }

    # -- Send request -----------------------------------------------------------
    $headers = @{
        'Authorization' = "Bearer $($env:DataExtraction_API_KEY)"
        'Content-Type'  = 'application/json'
    }

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $resp = Invoke-RestMethod -Method POST -Uri $responsesUri -Headers $headers -Body ($body | ConvertTo-Json -Depth 6)
    }
    finally {
        $sw.Stop()
    }

    # -- Normalize result text --------------------------------------------------
    $text =
        if ($resp.output_text) { $resp.output_text }
        elseif ($resp.output -and $resp.output[0].content[0].type -eq 'output_text') { $resp.output[0].content[0].text }
        else { $resp | ConvertTo-Json -Depth 6 }

    # -- Return a tidy object ---------------------------------------------------
    [pscustomobject]@{
        DurationMs = [int]$sw.Elapsed.TotalMilliseconds
        Response   = $text
        Raw        = $resp
    }
}

# Optional: a simple in-memory registry if you want symbolic IDs -> text
# Keep/extend this map or externalize it to JSON later.
if (-not $script:PromptRegistry) {
    $script:PromptRegistry = @{}
}

# Example: pre-wire your refinement plan (from your uploaded notes)
# You can also point P1_Id/P2_Id/... directly at files instead of using this map.
$script:PromptRegistry['pmpt_DataExploration_P1_v1'] = @'
[Phase P1 — Problem Framing]
- Clarify the intended user outcome and key constraints.
- Identify primary data sources and sampling risks.
- Define success criteria and anti-goals.
'@

$script:PromptRegistry['pmpt_DataExploration_P2_v1'] = @'
[Phase P2 — Prompt/UX Hypotheses]
- Enumerate candidate prompt patterns and UI affordances.
- Map hypotheses to measurable behaviors (clicks, dwell, revision loops).
'@

$script:PromptRegistry['pmpt_DataExploration_P3_v1'] = @'
[Phase P3 — Experiment Plan]
- Minimal experiment set, KPIs, guardrails.
- Plan for cold-start users and power users.
'@

$script:PromptRegistry['pmpt_DataExploration_MP_v1']  = @'
[Meta-Prompt]
You are an exacting reviewer producing v10-level guidance. Prefer terse, actionable bullets over fluff.
Call out risks, trade-offs, and testable deltas. Output as {FORMAT}.
'@


# ===== Minimal local web UI  =====
function Start-DataExplorationForm {
  <#
    .SYNOPSIS
    Minimal local web UI to run the P1→P2→P3 chain.

    .NOTES
    - Uses HttpListener on localhost only by default.
    - If you hit ACL errors, run:
      netsh http add urlacl url=http://localhost:6123/ user=$env:UserName listen=yes
    #>
  [CmdletBinding()]
  param(
    [string]$Prefix = "http://localhost:6123/",
    [string]$P1_Id = $pr_DataExploration_P1_v1,
    [string]$P2_Id = $pr_DataExploration_P2_v1,
    [string]$P3_Id = $pr_DataExploration_P3_v1,
    [string]$MP_Id = $pr_DataExploration_MP_v1
  )

  # -- Static HTML (served at /) ----------------------------------------------
  $html = @"
<!doctype html>
<html>
<head><meta charset="utf-8"><title>Data Exploration</title></head>
<body style="font-family:system-ui;margin:2rem;max-width:900px;">
  <h2>Data Exploration Chain</h2>
  <form method="post" action="/run">
    <label>Domain<br><input name="domain" value="contact center analytics" style="width:100%"></label><br><br>
    <label>Format (CSV/JSON/Logs)<br><input name="format" value="JSON" style="width:100%"></label><br><br>
    <label>Data Description<br><input name="desc" value="Genesys Cloud conversations with MOS and disconnect reasons" style="width:100%"></label><br><br>
    <label>Specific Focus (optional)<br><input name="focus" placeholder="rows where MOS < 3.5" style="width:100%"></label><br><br>
    <label>Dataset Sample (paste)<br>
      <textarea name="data" rows="12" style="width:100%"></textarea>
    </label><br><br>
    <button type="submit">Run P1→P2→P3</button>
  </form>
</body></html>
"@

  Add-Type -AssemblyName System.Net.HttpListener

  $listener = [System.Net.HttpListener]::new()
  $listener.Prefixes.Clear()
  $listener.Prefixes.Add($Prefix)

  try {
    $listener.Start()
  }
  catch {
    Write-Warning "If you get an ACL error, run: netsh http add urlacl url=$Prefix user=$env:UserName listen=yes"
    throw "Failed to start listener: $($_.Exception.Message)"
  }

  Write-Host "Listening at $Prefix (Ctrl+C to stop)"
  Write-Host "Note: Binding to ports <1024 or non-localhost may require admin/ACL."

  try {
    while ($listener.IsListening) {
      $ctx = $listener.GetContext()

      try {
        switch -Regex ($ctx.Request.RawUrl) {

          '^/$' {
            # -- Serve the form ----------------------------------------------------
            $bytes = [Text.Encoding]::UTF8.GetBytes($html)
            $ctx.Response.ContentType = "text/html; charset=utf-8"
            $ctx.Response.StatusCode = 200
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
            $ctx.Response.Close()
            break
          }

          '^/run$' {
            # -- Accept POST only --------------------------------------------------
            if ($ctx.Request.HttpMethod -ne 'POST') {
              $ctx.Response.StatusCode = 405
              $bytes = [Text.Encoding]::UTF8.GetBytes("<h2>Method Not Allowed</h2><p>POST required.</p>")
              $ctx.Response.ContentType = "text/html; charset=utf-8"
              $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
              $ctx.Response.Close()
              break
            }

            # -- Read and parse form body ------------------------------------------
            $reader = New-Object IO.StreamReader($ctx.Request.InputStream, $ctx.Request.ContentEncoding)
            $body = $reader.ReadToEnd()
            $reader.Dispose()

            $nvc = [System.Web.HttpUtility]::ParseQueryString($body)

            $domain = $nvc["domain"]
            $format = $nvc["format"]
            $desc = $nvc["desc"]
            $data = Limit-Text (Read-TextSmart ($nvc["data"]))  # safe length cap
            $focus = $nvc["focus"]

            # -- Run chain ---------------------------------------------------------
            $result = Start-DataExplorationChain `
              -P1_Id $P1_Id -P2_Id $P2_Id -P3_Id $P3_Id -MP_Id $MP_Id `
              -Domain $domain -Format $format -DataDescription $desc -DatasetSample $data `
              -SpecificFocus $focus

            # -- HTML encode dynamic bits -----------------------------------------
            $chainEnc = [System.Web.HttpUtility]::HtmlEncode([string]$result.Chain)
            $focusEnc = [System.Web.HttpUtility]::HtmlEncode([string]$result.Focus)
            $p1Enc = [System.Web.HttpUtility]::HtmlEncode([string]$result.P1)
            $p2Enc = [System.Web.HttpUtility]::HtmlEncode([string]$result.P2)
            $p3Enc = [System.Web.HttpUtility]::HtmlEncode([string]$result.P3)

            $out = @"
<!doctype html><html><head><meta charset="utf-8"><title>Results</title></head>
<body style="font-family:system-ui;margin:2rem;max-width:900px;">
  <a href="/">← back</a>
  <h2>Chain: $chainEnc</h2>
  <h3>Focus</h3><pre>$focusEnc</pre>
  <h3>P1</h3><pre>$p1Enc</pre>
  <h3>P2</h3><pre>$p2Enc</pre>
  <h3>P3</h3><pre>$p3Enc</pre>
</body></html>
"@

            $bytes = [Text.Encoding]::UTF8.GetBytes($out)
            $ctx.Response.ContentType = "text/html; charset=utf-8"
            $ctx.Response.StatusCode = 200
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
            $ctx.Response.Close()
            break
          }

          default {
            $ctx.Response.StatusCode = 404
            $bytes = [Text.Encoding]::UTF8.GetBytes("<h2>Not Found</h2>")
            $ctx.Response.ContentType = "text/html; charset=utf-8"
            $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
            $ctx.Response.Close()
            break
          }
        } # end switch
      }
      catch {
        # -- Return a clean error page for request-scoped exceptions ---------------
        $exceptionType = $_.Exception.GetType().FullName
        $errMsg = [System.Web.HttpUtility]::HtmlEncode(($_ | Out-String))

        $errorHtml = "<h2>Error</h2><pre>Exception: $exceptionType`n$errMsg</pre>"
        $bytes = [Text.Encoding]::UTF8.GetBytes($errorHtml)
        $ctx.Response.StatusCode = 500
        $ctx.Response.ContentType = "text/html; charset=utf-8"
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        $ctx.Response.Close()
      }
    } # while
  }
  finally {
    $listener.Stop()
    $listener.Close()
  }
}

<# ===== Example CLI run (uses smart reader + JSON format) =====

# Run the chain and time it
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$chain = Start-DataExplorationChain `
  -P1_Id  $pr_DataExploration_P1_v1 `
  -P2_Id  $pr_DataExploration_P2_v1 `
  -P3_Id  $pr_DataExploration_P3_v1 `
  -MP_Id  $pr_DataExploration_MP_v1 `
  -Domain "prompt engineering" `
  -Format "txt" `
  -DataDescription "Enhancing the Prompt Designer for Optimal Outputs and User Experience (UX)" `
  -DatasetSample $sampleText

$sw.Stop()
$chain.Response | Out-String
"Elapsed: {0:n0} ms" -f $chain.DurationMs

# Write artifacts (explicit UTF-8 no BOM for cross-tool friendliness)
$null = New-Item -ItemType Directory -Force -Path .\out 2>$null
$chain.P1 | Out-File .\out\P1.md -Encoding utf8NoBOM -Force
$chain.P2 | Out-File .\out\P2.md -Encoding utf8NoBOM -Force
$chain.P3 | Out-File .\out\P3.md -Encoding utf8NoBOM -Force

# Optional: persist raw object for later diffing
$chain | ConvertTo-Json -Depth 6 | Out-File .\out\chain.json -Encoding utf8NoBOM -Force

# Minimal console preview + timing
"=== Data Exploration Chain Complete in {0:N1}s ===" -f $sw.Elapsed.TotalSeconds
"Focus : {0}" -f ($chain.Focus ?? '<none>')
"P1 len: {0:n0} chars | P2 len: {1:n0} | P3 len: {2:n0}" -f ($chain.P1.Length), ($chain.P2.Length), ($chain.P3.Length)
"Artifacts: .\out\P1.md, .\out\P2.md, .\out\P3.md"

#>
