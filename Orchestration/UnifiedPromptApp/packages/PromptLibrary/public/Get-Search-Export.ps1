#requires -Version 5.1
using namespace System.IO

# NOTE: this file is dot-sourced by PromptLibrary.psm1 OR exported directly in its PSD1.
#       All cmdlets assume $Script:DataRoot was initialized in the module (see psm1).

function Get-Prompt {
    <#
    .SYNOPSIS
      Retrieve canonical prompt objects from /data/prompts.
    .DESCRIPTION
      Reads YAML files (truth in Git). Optional filters by Id, Tag(s), Title or free-text.
      Returns enriched objects with _Path and _Raw for roundtrip editing.
    #>
    [CmdletBinding()]
    param(
        [string]$Id,
        [string[]]$Tag,
        [string]$TitleLike,
        [string]$TextLike,
        [ValidateSet('Id','Title','Version','Updated')][string]$SortBy = 'Title',
        [switch]$Descending
    )

    $root = Join-Path $Script:DataRoot 'prompts'
    $items = Get-ChildItem -LiteralPath $root -Recurse -Filter *.yaml -ErrorAction SilentlyContinue

    $prompts = foreach ($f in $items) {
        try {
            $raw = Get-Content -LiteralPath $f.FullName -Raw
            $obj = ConvertFrom-Yaml -Yaml $raw
            $obj | Add-Member -NotePropertyName _Path -NotePropertyValue $f.FullName -Force
            $obj | Add-Member -NotePropertyName _Raw  -NotePropertyValue $raw -Force
            $obj | Add-Member -NotePropertyName _UpdatedUtc -NotePropertyValue $f.LastWriteTimeUtc -Force
            $obj
        } catch {
            Write-Warning ("⚠️  Skipped invalid YAML $($f.FullName): {0}" -f $_)
        }
    }

    if ($Id)        { $prompts = $prompts | Where-Object { $_.id -eq $Id } }
    if ($Tag)       { $prompts = $prompts | Where-Object { (($_.tags) -join ',') -match ($Tag -join '|') } }
    if ($TitleLike) { $prompts = $prompts | Where-Object { $_.title -match [Regex]::Escape($TitleLike) } }
    if ($TextLike)  { $prompts = $prompts | Where-Object { $_._Raw -match [Regex]::Escape($TextLike) } }

    $sortExpr = switch ($SortBy) {
        'Id'      { 'id' }
        'Title'   { 'title' }
        'Version' { 'version' }
        'Updated' { '_UpdatedUtc' }
    }

    if ($Descending) { $prompts | Sort-Object -Property $sortExpr -Descending }
    else             { $prompts | Sort-Object -Property $sortExpr }
}

function Search-Prompt {
    <#
    .SYNOPSIS
      Fast, sensible search over prompts with scoring.
    .DESCRIPTION
      Uses a simple scoring model: tag hits (+3), title hits (+2), body hits (+1).
      Returns objects with Score and lightweight fields suitable for binding in WPF or React.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Query,
        [int]$Max = 50,
        [switch]$IncludeBodySnippet
    )

    $terms = ($Query -split '\s+') | Where-Object { $_.Trim() } | ForEach-Object { [Regex]::Escape($_) }

    $results = foreach ($p in (Get-Prompt)) {
        $score = 0
        $tagText   = ($p.tags -join ' ')
        $titleText = "$($p.title)"
        $bodyText  = $p._Raw

        foreach ($t in $terms) {
            if ($tagText   -match $t) { $score += 3 }
            if ($titleText -match $t) { $score += 2 }
            if ($bodyText  -match $t) { $score += 1 }
        }

        if ($score -gt 0) {
            $snippet = $null
            if ($IncludeBodySnippet) {
                # crude but effective: first line that matches any term
                $line = ($bodyText -split "`r?`n") | Where-Object { $ln = $_; $terms | Where-Object { $ln -match $_ } } | Select-Object -First 1
                if ($line) { $snippet = $line.Trim() }
            }

            [PSCustomObject]@{
                Id        = $p.id
                Title     = $p.title
                Version   = [int]$p.version
                Tags      = @($p.tags)
                Score     = $score
                UpdatedUtc= $p._UpdatedUtc
                Path      = $p._Path
                Snippet   = $snippet
            }
        }
    }

    $results | Sort-Object Score -Descending | Select-Object -First $Max
}

function Export-Prompt {
    <#
    .SYNOPSIS
      Export prompts to CSV, JSON, or Markdown for sharing.
    .DESCRIPTION
      Accepts Id list or a search query. Creates /data/exports by default, safe filenames.
    #>
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [string[]]$Id,
        [string]$Query,
        [ValidateSet('Csv','Json','Markdown')][string]$Format = 'Json',
        [string]$OutFile,
        [switch]$OpenWhenDone
    )

    $list = @()
    if ($Id) {
        foreach ($i in $Id) { $list += (Get-Prompt -Id $i) }
    }
    elseif ($Query) {
        $ids = (Search-Prompt -Query $Query -Max 200).Id
        foreach ($i in $ids) { $list += (Get-Prompt -Id $i) }
    }
    else {
        throw "Provide -Id or -Query."
    }

    if (-not $list) { throw "No prompts matched selection." }

    $exportRoot = Join-Path $Script:DataRoot 'exports'
    New-Item -ItemType Directory -Force -Path $exportRoot | Out-Null

    if (-not $OutFile) {
        $ts = Get-Date -Format 'yyyyMMdd_HHmmss'
        $base = "prompts_$ts"
        $ext  = @{Csv='.csv'; Json='.json'; Markdown='.md'}[$Format]
        $OutFile = Join-Path $exportRoot ($base + $ext)
    }

    if ($PSCmdlet.ShouldProcess($OutFile, "Export $($list.Count) prompts as $Format"))) {
        switch ($Format) {
            'Json' {
                $payload = $list | ForEach-Object {
                    [ordered]@{
                        id            = $_.id
                        title         = $_.title
                        version       = [int]$_.version
                        tags          = @($_.tags)
                        model_hints   = @($_.model_hints)
                        inputs        = @($_.inputs)
                        system        = $_.system
                        user_template = $_.user_template
                        tests         = @($_.tests)
                        checksum      = $_.checksum
                    }
                } | ConvertTo-Json -Depth 10
                Set-Content -LiteralPath $OutFile -Value $payload -Encoding UTF8
            }
            'Csv' {
                $list | Select-Object id, title, version, @{n='tags';e={($_.tags -join ';')}}, checksum |
                    Export-Csv -LiteralPath $OutFile -NoTypeInformation -Encoding UTF8
            }
            'Markdown' {
                $sb = New-Object System.Text.StringBuilder
                foreach ($p in $list) {
@"
## $($p.title)  _(v$($p.version))_
**Id:** `$($p.id)`  
**Tags:** $((@($p.tags)) -join ', ')  
**Checksum:** `$($p.checksum)`

### System
