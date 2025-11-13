#requires -Version 5.1
using namespace System.IO
function Get-Prompt {
  [CmdletBinding()]
  param([string]$Id,[string[]]$Tag,[string]$TitleLike,[string]$TextLike)
  $root = Join-Path $Script:DataRoot 'prompts'
  $items = Get-ChildItem -LiteralPath $root -Recurse -Filter *.yaml -ErrorAction SilentlyContinue
  $prompts = foreach ($f in $items) {
    try {
      $raw = Get-Content -LiteralPath $f.FullName -Raw
      $obj = ConvertFrom-Yaml -Yaml $raw
      $obj | Add-Member -NotePropertyName _Path -NotePropertyValue $f.FullName -Force
      $obj | Add-Member -NotePropertyName _Raw  -NotePropertyValue $raw      -Force
      $obj
    } catch { Write-Warning ("Skipped invalid YAML {0}: {1}" -f $f.FullName, $_) }
  }
  if ($Id)        { $prompts = $prompts | Where-Object { $_.id -eq $Id } }
  if ($Tag)       { $prompts = $prompts | Where-Object { (($_.tags) -join ',') -match ($Tag -join '|') } }
  if ($TitleLike) { $prompts = $prompts | Where-Object { $_.title -match [Regex]::Escape($TitleLike) } }
  if ($TextLike)  { $prompts = $prompts | Where-Object { $_._Raw -match [Regex]::Escape($TextLike) } }
  $prompts
}
function Search-Prompt {
  [CmdletBinding()] param([Parameter(Mandatory)][string]$Query,[int]$Max=50)
  $terms = ($Query -split '\s+') | Where-Object { $_.Trim() } | ForEach-Object { [Regex]::Escape($_) }
  $results = foreach ($p in (Get-Prompt)) {
    $score = 0; $tagText = ($p.tags -join ' '); $titleText = "$($p.title)"; $bodyText  = $p._Raw
    foreach ($t in $terms) { if ($tagText -match $t) { $score+=3 }; if ($titleText -match $t) { $score+=2 }; if ($bodyText -match $t) { $score+=1 } }
    if ($score -gt 0) { [PSCustomObject]@{ Id=$p.id; Title=$p.title; Version=[int]$p.version; Tags=@($p.tags); Score=$score; Path=$p._Path } }
  }
  $results | Sort-Object Score -Descending | Select-Object -First $Max
}
function Export-Prompt {
  [CmdletBinding(SupportsShouldProcess)]
  param([string[]]$Id,[string]$Query,[ValidateSet('Csv','Json','Markdown')][string]$Format='Json',[string]$OutFile)
  $list = @()
  if ($Id) { foreach ($i in $Id) { $list += (Get-Prompt -Id $i) } }
  elseif ($Query) { $ids = (Search-Prompt -Query $Query -Max 200).Id; foreach ($i in $ids) { $list += (Get-Prompt -Id $i) } }
  else { throw "Provide -Id or -Query." }
  if (-not $list) { throw "No prompts matched selection." }
  $exportRoot = Join-Path $Script:DataRoot 'exports'; New-Item -ItemType Directory -Force -Path $exportRoot | Out-Null
  if (-not $OutFile) { $ts=Get-Date -Format 'yyyyMMdd_HHmmss'; $ext=@{Csv='.csv'; Json='.json'; Markdown='.md'}[$Format]; $OutFile = Join-Path $exportRoot ("prompts_{0}{1}" -f $ts,$ext) }
  switch ($Format) {
    'Json' { ($list | ConvertTo-Json -Depth 10) | Set-Content -LiteralPath $OutFile -Encoding UTF8 }
    'Csv'  { $list | Select-Object id,title,version,@{n='tags';e={($_.tags -join ';')}} | Export-Csv -LiteralPath $OutFile -NoTypeInformation -Encoding UTF8 }
    'Markdown' {
      $sb = New-Object System.Text.StringBuilder
      foreach ($p in $list) {
        $null = $sb.AppendLine("## $($p.title)  _(v$([int]$p.version))_")
        $null = $sb.AppendLine("**Id:** `$($p.id)`  ")
        $null = $sb.AppendLine("**Tags:** $((@($p.tags)) -join ', ')  ")
        $null = $sb.AppendLine("")
        $null = $sb.AppendLine("### System");       $null = $sb.AppendLine("``"); $null = $sb.AppendLine("$($p.system)");        $null = $sb.AppendLine("``")
        $null = $sb.AppendLine(""); $null = $sb.AppendLine("### User Template"); $null = $sb.AppendLine("``"); $null = $sb.AppendLine("$($p.user_template)"); $null = $sb.AppendLine("``")
        $null = $sb.AppendLine("\n---\n")
      }
      Set-Content -LiteralPath $OutFile -Value $sb.ToString() -Encoding UTF8
    }
  }
  Get-Item -LiteralPath $OutFile
}
