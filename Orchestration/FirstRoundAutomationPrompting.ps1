#requires -Version 7
# Docs: https://platform.openai.com/docs/guides/prompt-engineering

[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# =========================
#       CONFIGURATION
# =========================

# Prefer explicit API key first; fall back to environment.
# If both are blank, we error out in New-OpenAIHeaders().
$Script:APIKEY        = $Env:OPENAI_API_KEY
$Script:OpenAIBaseUrl = 'https://api.openai.com/v1'
$Script:Model         = 'gpt-5'   # If you override, pass -ModelOverride to Invoke-OpenAIResponse

# Saved Prompt IDs (replace with your real IDs)
$pr_DataExploration_P1_v1 = 'pmpt_6896baef370881948274f00c95b5f2bb0203485235e7c24a'
$pr_DataExploration_P2_v1 = 'pmpt_6896bb25833c8196bf8c2e8396daaf3600b4cb0dae990255'
$pr_DataExploration_P3_v1 = 'pmpt_6896bb4951f0819497e59e2172f2439c0ad7e075989466a3'
$pr_DataExploration_MP_v1 = 'pmpt_6896c0679fb8819597e74472ed8b16a406267ff36507c287'

# House instructions applied to all steps
$HouseInstructions = @"
House Style:
- Prefer crisp, decision-focused writing.
- Always include the section headings specified in the OUTPUT CONTRACT, in order.
- Use Markdown tables when tabular output is requested; otherwise use short bullets.
- Call out data quality issues explicitly (missingness, skew, outliers).
- When hypothesizing causes, label them H1, H2… and keep them falsifiable.
- Do not fabricate field names; if inferred, say "(inferred)" after the name.
- If a step requests methods/queries, provide concrete, minimal sketches (SQL-like, pseudocode, or filter logic).
"@

# =========================
#        DEPENDENCIES
# =========================

# For UrlDecode/HtmlEncode
Add-Type -AssemblyName System.Web
# For the embedded HTTP server
Add-Type -AssemblyName System.Net.HttpListener

# =========================
#         HELPERS
# =========================

function New-OpenAIHeaders {
    <#
      .SYNOPSIS
      Build headers with API key from explicit var or env var.

      .OUTPUTS
      Hashtable (headers)
    #>
    [CmdletBinding()]
    param(
        [string]$ApiKey = $Script:APIKEY
    )
    if ([string]::IsNullOrWhiteSpace($ApiKey)) {
        throw "OpenAI API key is not set. Set `$Env:OPENAI_API_KEY or assign `$Script:APIKEY."
    }
    return @{
        'Authorization' = "Bearer $ApiKey"
        'Content-Type'  = 'application/json'
    }
}

function Truncate-Text {
    <#
      .SYNOPSIS
      Trim very large pastes to keep payload sane.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Text,
        [int]$MaxChars = 120000
    )
    if ($Text.Length -le $MaxChars) { return $Text }
    return ($Text.Substring(0, $MaxChars) + "`n...[truncated]...")
}

function Read-TextSmart {
    <#
      .SYNOPSIS
      Reads a file as text with BOM sniffing; if it's not a file, returns the input as-is.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$PathOrText)

    if (Test-Path -LiteralPath $PathOrText) {
        $bytes = [System.IO.File]::ReadAllBytes($PathOrText)

        # UTF-16 LE
        if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
            return [Text.Encoding]::Unicode.GetString($bytes)
        }
        # UTF-16 BE
        if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) {
            return [Text.Encoding]::BigEndianUnicode.GetString($bytes)
        }
        # UTF-8 BOM
        if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
            return [Text.Encoding]::UTF8.GetString($bytes)
        }

        # Fallback: most content will decode fine as UTF8
        try   { return [Text.Encoding]::UTF8.GetString($bytes) }
        catch { return [Text.Encoding]::Unicode.GetString($bytes) }
    }

    return $PathOrText
}

function Get-FirstNextStepBullet {
    <#
      .SYNOPSIS
      Pull the first bullet under a "## Next Steps" section to auto-seed P2 focus.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$Markdown)

    $tail   = ($Markdown -split "##\s*Next Steps", 2, 'IgnoreCase')[1]
    if (-not $tail) { return $null }
    $bullet = ($tail -split "`n") | Where-Object { $_ -match '^\s*-\s+' } | Select-Object -First 1
    if ($bullet) { return ($bullet -replace '^\s*-\s+', '').Trim() }
    return $null
}

function Get-ResponseText {
    <#
      .SYNOPSIS
      Normalize OpenAI /responses payloads into a simple string.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][object]$Response)

    # Try common shapes first
    if ($Response.output_text) { return [string]$Response.output_text }

    if ($Response.output -and $Response.output[0].content -and $Response.output[0].content[0].text) {
        return [string]$Response.output[0].content[0].text
    }

    # Last resort: dump JSON so we can see what's happening
    return ($Response | ConvertTo-Json -Depth 20)
}

function Invoke-OpenAIResponse {
    <#
      .SYNOPSIS
      Thin wrapper around POST /responses with retries.

      .NOTES
      - Retries 429/5xx with exponential backoff up to MaxRetries.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string] $PromptId,
        [hashtable]  $Variables,
        [string]     $Instructions = $HouseInstructions,
        [object[]]   $Input        = @(),
        [hashtable[]]$Tools,
        [hashtable]  $Metadata,
        [string]     $ModelOverride,
        [int]        $TimeoutSec   = 120,
        [int]        $MaxRetries   = 3
    )
   if (-not $Input -or $Input.Count -eq 0) {
        $Input = @("")   # minimal legal input
    }
        $body = [ordered]@{
        model        = ($ModelOverride ? $ModelOverride : $Script:Model)
        prompt_id    = $PromptId
        instructions = $Instructions
        input        = $Input          # <- ensures compliance
    }
    if ($Variables) { $body.parameters = $Variables }
    if ($Input)     { $body.input      = $Input }
    if ($Tools)     { $body.tools      = $Tools }
    if ($Metadata)  { $body.metadata   = $Metadata }

    $json    = $body | ConvertTo-Json -Depth 12 -Compress
    $attempt = 0
    $delay   = 1

    while ($true) {
        try {
            return Invoke-RestMethod -Method POST `
                                     -Uri "$($Script:OpenAIBaseUrl)/responses" `
                                     -Headers (New-OpenAIHeaders) `
                                     -Body $json `
                                     -TimeoutSec $TimeoutSec
        } catch {
            $attempt++
            $status = $null
            if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
                $status = [int]$_.Exception.Response.StatusCode.value__
            }

            # Backoff on rate limit / transient server errors
            if ($attempt -lt $MaxRetries -and ($status -in 429,500,502,503,504)) {
                Start-Sleep -Seconds $delay
                $delay = [Math]::Min([int]$delay * 2, 16)
                continue
            }

            # Surface the server body if present (debuggable)
            $respBody = $null
            try {
                $respBody = (New-Object IO.StreamReader $_.Exception.Response.GetResponseStream()).ReadToEnd()
            } catch {}
            if ($respBody) {
                throw "OpenAI error (HTTP $status): $respBody"
            }
            throw
        }
    }
}

# =========================
#     STEP WRAPPERS
# =========================

function Invoke-DataExplorationP1 {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$PromptId,
        [Parameter(Mandatory)][string]$Domain,
        [Parameter(Mandatory)][string]$Format,          # "CSV", "JSON", "Logs"
        [Parameter(Mandatory)][string]$DataDescription,
        [Parameter(Mandatory)][string]$DatasetSample
    )

    $vars = @{
        domain           = $Domain
        format           = $Format
        data_description = $DataDescription
        dataset_sample   = $DatasetSample
    }

    $resp = Invoke-OpenAIResponse -PromptId $PromptId -Variables $vars -Metadata @{ chain = 'DataExploration'; step = 'P1' }
    [pscustomobject]@{ Step = 'P1'; Raw = $resp; Text = (Get-ResponseText $resp) }
}

function Invoke-DataExplorationP2 {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$PromptId,
        [Parameter(Mandatory)][string]$SpecificFocus,
        [string]$PriorSummary
    )

    $vars = @{ specific_focus = $SpecificFocus }
    if ($PriorSummary) { $vars.prior_summary = $PriorSummary }

    $resp = Invoke-OpenAIResponse -PromptId $PromptId -Variables $vars -Metadata @{ chain = 'DataExploration'; step = 'P2' }
    [pscustomobject]@{ Step = 'P2'; Raw = $resp; Text = (Get-ResponseText $resp) }
}

function Invoke-DataExplorationP3 {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$PromptId,
        [string]$PriorFindings
    )

    $vars = @{}
    if ($PriorFindings) { $vars.prior_findings = $PriorFindings }

    $resp = Invoke-OpenAIResponse -PromptId $PromptId -Variables $vars -Metadata @{ chain = 'DataExploration'; step = 'P3' }
    [pscustomobject]@{ Step = 'P3'; Raw = $resp; Text = (Get-ResponseText $resp) }
}

function Invoke-DataExplorationMP {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$PromptId,
        [Parameter(Mandatory)][string]$OriginalRequest,
        [Parameter(Mandatory)][string]$LastOutput
    )

    $vars = @{
        original_request = $OriginalRequest
        last_output      = $LastOutput
    }

    $resp = Invoke-OpenAIResponse -PromptId $PromptId -Variables $vars -Metadata @{ chain = 'DataExploration'; step = 'MP' }
    [pscustomobject]@{ Step = 'MP'; Raw = $resp; Text = (Get-ResponseText $resp) }
}

# =========================
#       ORCHESTRATOR
# =========================

function Start-DataExplorationChain {
    [CmdletBinding()]
    param(
        # Prompt IDs
        [Parameter(Mandatory)][string]$P1_Id,
        [Parameter(Mandatory)][string]$P2_Id,
        [Parameter(Mandatory)][string]$P3_Id,
        [Parameter(Mandatory)][string]$MP_Id,

        # Inputs
        [Parameter(Mandatory)][string]$Domain,
        [Parameter(Mandatory)][string]$Format,            # "CSV", "JSON", "Logs"
        [Parameter(Mandatory)][string]$DataDescription,
        [Parameter(Mandatory)][string]$DatasetSample,

        # Options
        [string]$SpecificFocus,
        [switch]$ForceMP
    )

    # --- P1 ---
    $p1     = Invoke-DataExplorationP1 -PromptId $P1_Id -Domain $Domain -Format $Format -DataDescription $DataDescription -DatasetSample $DatasetSample
    $p1Text = $p1.Text

    # Sanity check for structure
    $isWeak = ($p1Text.Length -lt 200) -or ($p1Text -notmatch '##\s*Field Inventory') -or ($p1Text -notmatch '##\s*Next Steps')
    if ($isWeak -and ($ForceMP -or -not $SpecificFocus)) {
        Write-Warning 'P1 looks weak; running MP to realign…'
        $mp = Invoke-DataExplorationMP -PromptId $MP_Id -OriginalRequest "$Domain | $Format | $DataDescription" -LastOutput $p1Text
        return [pscustomobject]@{ Chain = 'MP'; P1 = $p1Text; MP = $mp.Text }
    }

    # Derive a focus if none provided
    if (-not $SpecificFocus) {
        $SpecificFocus = Get-FirstNextStepBullet -Markdown $p1Text
        if (-not $SpecificFocus) { $SpecificFocus = 'the most critical anomaly identified in P1' }
    }

    # --- P2 ---
    $p2     = Invoke-DataExplorationP2 -PromptId $P2_Id -SpecificFocus $SpecificFocus -PriorSummary $p1Text
    $p2Text = $p2.Text

    # --- P3 ---
    $p3     = Invoke-DataExplorationP3 -PromptId $P3_Id -PriorFindings $p2Text
    $p3Text = $p3.Text

    # Final bundle
    return [pscustomobject]@{
        Chain = 'P1→P2→P3'
        Focus = $SpecificFocus
        P1    = $p1Text
        P2    = $p2Text
        P3    = $p3Text
    }
}

# =========================
#   MINIMAL LOCAL WEB UI
# =========================

function Start-DataExplorationForm {
    <#
      .SYNOPSIS
      Tiny self-hosted form for pasting a dataset sample and running P1→P2→P3.

      .NOTES
      If you see an ACL error, run from an elevated prompt:
        netsh http add urlacl url=http://localhost:6123/ user=$env:UserName listen=yes
    #>
    [CmdletBinding()]
    param(
        [string]$Prefix = 'http://localhost:6123/',
        [string]$P1_Id  = $pr_DataExploration_P1_v1,
        [string]$P2_Id  = $pr_DataExploration_P2_v1,
        [string]$P3_Id  = $pr_DataExploration_P3_v1,
        [string]$MP_Id  = $pr_DataExploration_MP_v1
    )

    # --- Static HTML for the index page ---
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
    <label>Specific Focus (optional)<br><input name="focus" placeholder="rows where MOS &lt; 3.5" style="width:100%"></label><br><br>
    <label>Dataset Sample (paste)<br>
      <textarea name="data" rows="12" style="width:100%"></textarea>
    </label><br><br>
    <button type="submit">Run P1→P2→P3</button>
  </form>
  <p style="margin-top:1rem;color:#666">Health: <a href="/health">/health</a></p>
</body></html>
"@

    # --- HTTP Listener setup ---
    $listener = [System.Net.HttpListener]::new()
    $listener.Prefixes.Clear()
    $listener.Prefixes.Add($Prefix)

    try {
        $listener.Start()
    } catch {
        Write-Warning "If you get an ACL error, try:`n  netsh http add urlacl url=$Prefix user=$env:UserName listen=yes"
        throw
    }

    Write-Host "Listening at $Prefix (Ctrl+C to stop)"

    try {
        while ($listener.IsListening) {
            $ctx = $listener.GetContext()

            switch -Regex ($ctx.Request.RawUrl) {

                '^/$' {
                    # Serve the form
                    $bytes = [Text.Encoding]::UTF8.GetBytes($html)
                    $ctx.Response.StatusCode  = 200
                    $ctx.Response.ContentType = 'text/html; charset=utf-8'
                    $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length)
                    $ctx.Response.Close()
                    break
                }

                '^/health$' {
                    # Simple health probe
                    $bytes = [Text.Encoding]::UTF8.GetBytes('OK')
                    $ctx.Response.StatusCode  = 200
                    $ctx.Response.ContentType = 'text/plain; charset=utf-8'
                    $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length)
                    $ctx.Response.Close()
                    break
                }

                '^/run$' {
                    # Only POST allowed
                    if ($ctx.Request.HttpMethod -ne 'POST') {
                        $ctx.Response.StatusCode = 405
                        $ctx.Response.AddHeader('Allow','POST')
                        $ctx.Response.Close()
                        break
                    }

                    # Guard body size (~2 MB)
                    if ($ctx.Request.ContentLength64 -gt 2MB) {
                        $ctx.Response.StatusCode = 413  # Payload Too Large
                        $ctx.Response.Close()
                        break
                    }

                    # --- Parse x-www-form-urlencoded body ---
                    $reader = New-Object IO.StreamReader($ctx.Request.InputStream, $ctx.Request.ContentEncoding)
                    $body   = $reader.ReadToEnd()
                    $reader.Dispose()

                    $kv = @{}
                    foreach ($pair in ($body -split '&' | Where-Object { $_ })) {
                        $k,$v = ($pair -split '=', 2)
                        # Convert '+' to spaces before UrlDecode; some browsers will have already done this but it's safe.
                        $v = $v -replace '\+','%20'
                        $kv[[System.Web.HttpUtility]::UrlDecode($k)] = [System.Web.HttpUtility]::UrlDecode($v)
                    }

                    # Extract, normalize, and trim fields
                    $domain = ($kv.domain).Trim()
                    $format = ($kv.format).Trim()
                    $desc   = ($kv.desc).Trim()
                    $data   = Truncate-Text (Read-TextSmart ($kv.data))
                    $focus  = ($kv.focus).Trim()

                    try {
                        # Run the chain
                        $result = Start-DataExplorationChain `
                            -P1_Id $P1_Id -P2_Id $P2_Id -P3_Id $P3_Id -MP_Id $MP_Id `
                            -Domain $domain -Format $format -DataDescription $desc -DatasetSample $data -SpecificFocus $focus

                        # HTML-escape all output to avoid markup leakage
                        $enc = { param($s) [System.Web.HttpUtility]::HtmlEncode([string]$s) }

                        $out = @"
<!doctype html>
<html><head><meta charset="utf-8"><title>Results</title></head>
<body style="font-family:system-ui;margin:2rem;max-width:900px;">
  <a href="/">← back</a>
  <h2>Chain: $(& $enc $result.Chain)</h2>
  <h3>Focus</h3><pre>$(& $enc $result.Focus)</pre>
  <h3>P1</h3><pre>$(& $enc $result.P1)</pre>
  <h3>P2</h3><pre>$(& $enc $result.P2)</pre>
  <h3>P3</h3><pre>$(& $enc $result.P3)</pre>
</body></html>
"@

                        $bytes = [Text.Encoding]::UTF8.GetBytes($out)
                        $ctx.Response.StatusCode  = 200
                        $ctx.Response.ContentType = 'text/html; charset=utf-8'
                        $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length)
                        $ctx.Response.Close()
                    } catch {
                        # Surface full error text in a safe <pre>
                        $err   = [System.Web.HttpUtility]::HtmlEncode(($_ | Out-String))
                        $bytes = [Text.Encoding]::UTF8.GetBytes("<h2>Error</h2><pre>$err</pre>")
                        $ctx.Response.StatusCode  = 500
                        $ctx.Response.ContentType = 'text/html; charset=utf-8'
                        $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length)
                        $ctx.Response.Close()
                    }

                    break
                }

                default {
                    $ctx.Response.StatusCode = 404
                    $ctx.Response.Close()
                }
            }
        }
    }
    finally {
        # Ensure clean shutdown even on Ctrl+C
        if ($listener.IsListening) { $listener.Stop() }
        $listener.Close()
    }
}
