#Requires -Version 5.1
using namespace System.Data
$Script:ModuleRoot = Split-Path -Parent $PSCommandPath
$Script:RepoRoot   = Split-Path -Parent $Script:ModuleRoot
$Script:DataRoot   = Join-Path $Script:RepoRoot 'data'
function Get-ContentHash {
  [CmdletBinding()] param([Parameter(Mandatory)][string]$Text)
  $norm = ($Text -replace "`r`n","`n").Trim()
  $sha  = New-Object System.Security.Cryptography.SHA256Managed
  [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($norm))).Replace('-','').ToLower()
}
. "$PSScriptRoot\Public\Get-Search-Export.ps1"
function Get-Agent {
  [CmdletBinding()] param([string]$Id,[string]$Name,[string[]]$Capability)
  $root  = Join-Path $Script:DataRoot 'agents'
  $items = Get-ChildItem -LiteralPath $root -Recurse -Filter *.yaml -ErrorAction SilentlyContinue
  $agents = foreach ($f in $items) {
    try {
      $raw = Get-Content -Raw -LiteralPath $f.FullName
      $obj = ConvertFrom-Yaml -Yaml $raw
      $obj | Add-Member -NotePropertyName _Path -NotePropertyValue $f.FullName -Force
      $obj | Add-Member -NotePropertyName _Raw  -NotePropertyValue $raw      -Force
      $obj
    } catch { Write-Warning ("⚠️  Skipped invalid YAML {0}: {1}" -f $f.FullName, $_) }
  }
  if ($Id)        { $agents = $agents | Where-Object { $_.id -eq $Id } }
  if ($Name)      { $agents = $agents | Where-Object { $_.name -match [regex]::Escape($Name) } }
  if ($Capability){ $agents = $agents | Where-Object { (($_.capabilities)-join ',') -match ($Capability -join '|') } }
  $agents
}
function Invoke-Orchestration {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string]$PromptId,
    [Parameter(Mandatory)][string]$AgentId,
    [Parameter(Mandatory)][hashtable]$Inputs,
    [Parameter(Mandatory)][string]$Model,
    [string]$ArtifactName = ("art_" + (Get-Date -Format 'yyyyMMdd_HHmmss'))
  )
  $prompt = Get-Prompt -Id $PromptId | Select-Object -First 1
  if (-not $prompt) { throw "Prompt $($PromptId) not found." }
  $agent  = Get-Agent -Id $AgentId | Select-Object -First 1
  if (-not $agent)  { throw "Agent $($AgentId) not found." }
  $renderedUser = $prompt.user_template
  foreach ($k in $Inputs.Keys) {
    $renderedUser = $renderedUser -replace "\${`{\s*$([regex]::Escape($k))\s*}}", [string]$Inputs[$k]
  }
  $systemMsg = ($agent.role + "`n---`n" + $prompt.system)
  $resp = [ordered]@{ model=$Model; text="MODEL_CALL_PLACEHOLDER"; usage=@{prompt_tokens=0;completion_tokens=0;total_tokens=0} }
  $artDir  = Join-Path $Script:DataRoot 'artifacts'; New-Item -ItemType Directory -Force -Path $artDir | Out-Null
  $outPath = Join-Path $artDir ("$($ArtifactName).json")
  $payload = [ordered]@{ promptId=$PromptId; agentId=$AgentId; model=$Model; inputs=$Inputs; system=$systemMsg; user=$renderedUser; output=$resp; createdUtc=(Get-Date).ToUniversalTime().ToString("o"); promptChecksum=$prompt.checksum; agentChecksum=$agent.checksum } | ConvertTo-Json -Depth 10
  Set-Content -LiteralPath $outPath -Value $payload -Encoding UTF8
  @{ Output = $resp; ArtifactPath = $outPath }
}
function Update-PromptIndex { [CmdletBinding()] param([Parameter(Mandatory)][string]$Path) Write-Verbose ("Index update requested for {0}" -f $Path) }
Export-ModuleMember -Function Get-Prompt,Search-Prompt,Export-Prompt,Get-Agent,Invoke-Orchestration,Update-PromptIndex
