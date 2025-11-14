#Requires -Version 5.1
<#
.SYNOPSIS
  Zero-to-fun demo script. Renders a prompt and prints the final chat messages.

.INSTRUCTIONS
  1) Unblock this repo: Unblock-File -Recurse "<repo root>"
  2) Install YAML parser once: Install-Module powershell-yaml -Scope CurrentUser -Force
  3) Run this script.
#>

param(
    # Path to the repo root (change if you moved it)
    [string]$RepoRoot = (Resolve-Path "$PSScriptRoot\..").Path,

    # Which prompt to try first
    [ValidateSet(
        'analytics/divisions.performance.summary',
        'support/webrtc.disconnects.explainer',
        'operations/incident.postmortem.synthesizer',
        'engineering/sql.query.generator',
        'comms/meeting.minutes.summarizer',
        'engineering/powershell.code.review'
    )]
    [string]$Prompt = 'analytics/divisions.performance.summary'
)

$ErrorActionPreference = 'Stop'

# --- 0) One-time: Make sure powershell-yaml is available
if (-not (Get-Module -ListAvailable powershell-yaml)) {
    Write-Host "Installing powershell-yaml..." -ForegroundColor Cyan
    Set-PSRepository -Name PSGallery -InstallationPolicy Trusted
    Install-Module powershell-yaml -Force -Scope CurrentUser
}

# --- 1) Load the module (manifest w/ approved verbs)
Import-Module (Join-Path $RepoRoot 'tooling\render\PromptLibrary.psd1') -Force

# --- 2) Build paths and get spec
$specPath = Join-Path $RepoRoot ("prompts\catalog\" + $Prompt + ".prompt.yaml")
$spec     = Get-Prompt -Path $specPath   # returns Hashtable

# --- 3) Create input variables per prompt (keep this simple & obvious)
switch ($Prompt) {
    'analytics/divisions.performance.summary' {
        $input = [ordered]@{
            division           = 'Medicare'     # division name (string)
            month              = '2025-10'      # YYYY-MM
            include_mos_detail = $true          # toggle extra detail
        }
    }
    'support/webrtc.disconnects.explainer' {
        $input = [ordered]@{
            division     = 'Sales'
            period       = 'Oct 2025'
            top_causes   = @('Wi-Fi loss','Agent tab idle','Browser crash')
            actions_taken= @('Idle-tab alert','FAQ nudge')
        }
    }
    'operations/incident.postmortem.synthesizer' {
        $input = [ordered]@{
            incident_id    = 'INC-2025-1031'
            when           = '2025-10-31'
            impact_summary = '5% calls failed for 22m'
            timeline       = @(@{t='2025-10-31T17:22:00Z';e='Alert fired'},
                                @{t='2025-10-31T17:44:00Z';e='Mitigated'})
            root_cause     = 'Bad deploy'
            actions        = @(@{owner='SRE';task='Guardrails';eta='2025-11-15'})
        }
    }
    'engineering/sql.query.generator' {
        $input = [ordered]@{
            dialect = 'postgres'
            schema  = 'tables: calls(id, division, started_at, mos)'
            request = 'average MOS by division last month'
        }
    }
    'comms/meeting.minutes.summarizer' {
        $input = [ordered]@{
            title      = 'Ops Sync'
            date       = '2025-10-31'
            attendees  = @('Ben','Alex')
            raw_notes  = 'decided upgrade; ai work pending; risk: timeline; action: alex to draft plan by 11/05'
        }
    }
    'engineering/powershell.code.review' {
        $input = [ordered]@{
            script_name    = 'Do-Thing.ps1'
            script_content = '$EnginePath: something'  # intentionally triggers colon-after-variable gotcha
            target_versions= @('5.1','7.4')
        }
    }
}

# --- 4) Validate variables & render (Invoke-* is an approved verb)
Test-PromptVars -Spec $spec -Input $input | Out-Null
$result = Invoke-Prompt  -Spec $spec -Input $input

# --- 5) Display the final message payload you’d send to your LLM client
"=== Prompt Messages ==="
$result.messages | ForEach-Object {
    "[$($_.role)]`n$($_.content)`n"
} | Out-String | Write-Host

# --- 6) (Optional) Save the payload to disk for inspection
$outPath = Join-Path $RepoRoot ("demos\out_" + ($Prompt -replace '[\\/]', '_') + ".json")
$result | ConvertTo-Json -Depth 10 | Set-Content -Path $outPath -Encoding UTF8
"Saved: $outPath" | Write-Host -ForegroundColor Green
