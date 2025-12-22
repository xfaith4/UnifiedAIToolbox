### BEGIN FILE: OpenAI_Refiner.ps1
<#
.SYNOPSIS
  OpenAI Refiner v3.0
.DESCRIPTION
  Generates a refined goal or mission brief for the next milestone based on
  previous context, commissioner feedback, and Value Score results.
  Integrates with MilestoneController and POF for full closed-loop orchestration.
#>

param(
    [Parameter(Mandatory)]
    [string]$Input,  # The previous Goal text or path to file
    [string]$Model = "gpt-4o-mini"
)

# --- CONFIG -----------------------------------------------------------
$Config = @{
    Endpoint     = "https://api.openai.com/v1/chat/completions"
    ApiKey       = $env:OPENAI_API_KEY
    Model        = $Model
    Temperature  = 0.5
    MaxTokens    = 2048
}

if (-not $Config.ApiKey) { throw "OPENAI_API_KEY not set." }

# --- RESOLVE INPUT ----------------------------------------------------
if (Test-Path $Input) {
    $GoalText = Get-Content -Raw $Input
} else {
    $GoalText = $Input
}

Write-Host "`n🧩 Refining milestone goal..." -ForegroundColor Cyan

# --- BUILD PROMPT -----------------------------------------------------
$Prompt = @"
You are an AI refinement analyst responsible for improving milestone definitions.
You will read the previous goal and outputs, assess Commissioner feedback,
and generate a refined, actionable next goal that addresses all weaknesses.

RULES:
1. Maintain continuity with the prior milestone.
2. Explicitly address Commissioner feedback, focusing on raising Value Score ≥ 7.
3. Clarify ambiguous tasks, improve structure, and strengthen measurable outcomes.
4. End with a section titled '✅ Success Criteria' listing 3–5 specific targets.

Previous goal context:
----------------------
$GoalText
----------------------

Generate only the next goal, not an explanation.
"@

# --- CALL OPENAI ------------------------------------------------------
$Headers = @{
    "Authorization" = "Bearer $($Config.ApiKey)"
    "Content-Type"  = "application/json"
}

$Body = @{
    model       = $Config.Model
    messages    = @(
        @{ role = "system"; content = "You are an AI prompt refiner improving milestone clarity and quality." },
        @{ role = "user"; content = $Prompt }
    )
    max_tokens  = $Config.MaxTokens
    temperature = $Config.Temperature
} | ConvertTo-Json -Depth 5 -Compress

try {
    $Response = Invoke-RestMethod -Uri $Config.Endpoint -Method Post -Headers $Headers -Body $Body -ErrorAction Stop
    $NewGoal = $Response.choices[0].message.content.Trim()
    if (-not $NewGoal) { throw "Empty response from API." }
    Write-Host "✨ Refinement complete." -ForegroundColor Green
    Write-Host "`nPreview:`n$($NewGoal.Substring(0, [Math]::Min($NewGoal.Length, 600)))`n---"
}
catch {
    Write-Host "❌ Refinement request failed: $_" -ForegroundColor Red
    return "Refinement failed due to API error."
}

# --- LOG OUTPUT -------------------------------------------------------
$RefDir = "$PSScriptRoot\..\Goals"
if (-not (Test-Path $RefDir)) { New-Item -ItemType Directory -Force -Path $RefDir | Out-Null }

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$OutFile = Join-Path $RefDir "RefinedGoal_$Timestamp.txt"
$NewGoal | Out-File -FilePath $OutFile -Encoding UTF8

Write-Host "📝 Refined goal saved to $OutFile" -ForegroundColor Cyan

return $NewGoal
### END FILE: OpenAI_Refiner.ps1
