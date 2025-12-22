function Invoke-PromptWorkbench {
    <#
    .SYNOPSIS
        Calls the Prompt Workbench /api/generate endpoint with strong defaults.

    .PARAMETER BaseUrl
        API base (default http://localhost:8000)

    .PARAMETER TemplateId
        Template id (must exist under ./templates)

    .PARAMETER Role
        Role injected into the system prompt (e.g. 'Genesys Cloud Monitoring Assistant')

    .PARAMETER Task
        Plain-English task for this run

    .PARAMETER Context
        Hashtable of context (environment, audience, scale, etc.)

    .PARAMETER InputData
        Hashtable for scenario inputs (e.g., log_snippet, timestamp)

    .PARAMETER DesiredOutput
        List of output keys (executive_summary, technical_json, chart_recommendations)

    .PARAMETER Modes
        Presentation modes (exec, engineer, viz)

    .PARAMETER Model
        Override model name if desired

    .PARAMETER UseClientCache
        If set, caches responses by hash in $env:LOCALAPPDATA\PromptWorkbench\client_cache.jsonl
    #>
    [CmdletBinding()]
    param(
        [string]$BaseUrl = "http://localhost:8000",
        [Parameter(Mandatory)][string]$TemplateId,
        [Parameter(Mandatory)][string]$Role,
        [Parameter(Mandatory)][string]$Task,
        [hashtable]$Context = @{ environment="Prod"; audience=@("Executives","NOC Engineers") },
        [hashtable]$InputData = @{},
        [string[]]$DesiredOutput = @("executive_summary","technical_json","chart_recommendations"),
        [string[]]$Modes = @("exec","engineer","viz"),
        [string]$Model,
        [switch]$UseClientCache
    )

    # -- Build request body (matches FastAPI model) ---------------------------
    $body = [ordered]@{
        template_id    = $TemplateId
        role           = $Role
        task           = $Task
        context        = $Context
        input_data     = $InputData
        desired_output = $DesiredOutput
        modes          = $Modes
    }
    if ($Model) { $body.model = $Model }

    # -- Optional client-side cache (local file) ------------------------------
    if ($UseClientCache) {
        $cacheDir = Join-Path $env:LOCALAPPDATA "PromptWorkbench"
        $cacheFile = Join-Path $cacheDir "client_cache.jsonl"
        if (-not (Test-Path $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir | Out-Null }

        # Create a stable hash of the body to reuse results for identical inputs
        $jsonForHash = ($body | ConvertTo-Json -Depth 10 -Compress)
        $hash = (Get-FileHash -InputStream ([IO.MemoryStream]::new([Text.Encoding]::UTF8.GetBytes($jsonForHash))) -Algorithm SHA256).Hash.ToLower()

        # Try to locate a prior line with same hash
        if (Test-Path $cacheFile) {
            $match = Select-String -Path $cacheFile -Pattern ("`"hash`":`"$hash`"") -SimpleMatch -ErrorAction Ignore | Select-Object -First 1
            if ($match) {
                try {
                    $line = Get-Content $cacheFile | Where-Object { $_ -match $hash } | Select-Object -First 1
                    $obj  = $line | ConvertFrom-Json
                    if ($obj -and $obj.output) {
                        Write-Verbose "Client cache hit ($hash)."
                        return $obj.output
                    }
                } catch {}
            }
        }
    }

    # -- POST to the API ------------------------------------------------------
    $uri = "$BaseUrl/api/generate"
    $resp = Invoke-RestMethod -Uri $uri -Method Post -Body ($body | ConvertTo-Json -Depth 10) -ContentType "application/json"

    # -- Save to client cache (append-only JSONL) -----------------------------
    if ($UseClientCache) {
        $record = [ordered]@{
            time   = (Get-Date).ToString("s")
            hash   = $hash
            req    = $body
            output = $resp.output
        } | ConvertTo-Json -Depth 10
        Add-Content -Path $cacheFile -Value $record
    }

    return $resp.output
}

# Quick example:
# Invoke-PromptWorkbench -TemplateId 'agent_webrtc_disconnect_v1.0.0' `
#     -Role 'Genesys Cloud Monitoring Assistant' `
#     -Task 'Explain likely causes and mitigations for WebRTC disconnects' `
#     -InputData @{ log_snippet = 'ICE negotiation failed across 3 regions'; timestamp = (Get-Date).ToString('s') + 'Z' } `
#     -UseClientCache -Verbose
