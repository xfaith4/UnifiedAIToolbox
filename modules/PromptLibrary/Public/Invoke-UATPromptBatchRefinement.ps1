<#
.SYNOPSIS
  Batch-refine a folder of prompt YAML files using New-RefinedPrompt, leaving reviewable artifacts.

.DESCRIPTION
  - Works with two prompt YAML shapes:
      A) PromptLibrary-style: id/title/category/tags/system/user_template
      B) PromptSpec-style:   id/version/variables/blocks (refines blocks.instructions)
  - Default behavior is SAFE: does NOT overwrite original prompts.
    Instead it writes refined copies into an output folder and leaves per-prompt artifact folders.
  - Designed to be PS 5.1 + PS 7+ friendly (no YAML module dependency). It uses targeted text parsing.

.PARAMETER PromptRoot
  Root folder containing prompt YAML files. Defaults to data/prompts if present.

.PARAMETER Iterations
  Number of refinement iterations (1..10). Default: 3.

.PARAMETER SaveArtifacts
  If set, the refiner saves iteration_*.txt artifacts via New-RefinedPrompt.

.PARAMETER Mode
  Copy = write refined copies to OutRoot (default).
  InPlace = overwrite original prompts AND write refined copies to OutRoot for review.

.PARAMETER OutRoot
  Batch output folder. Default: artifacts/prompt-refine-batch_<timestamp>.

.PARAMETER IncludePatterns
  File patterns to include. Default: *.prompt.yaml, *.yaml.

.PARAMETER ExcludeRegex
  Regex for excluded files. Default excludes meta/tests.

.PARAMETER FailFast
  Stop on first error if set.

.OUTPUTS
  PSCustomObject with properties:
  file, id, title, kind, status, promptIdUsed, artifactsPath, outFile, error, tokensUsed, estimatedCost
#>

function Get-FirstYamlScalar {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string]$Key
    )
    $rx = "(?m)^\s*$([Regex]::Escape($Key))\s*:\s*(.+?)\s*$"
    $m = [regex]::Match($Text, $rx)
    if ($m.Success) { return $m.Groups[1].Value.Trim() }
    return $null
}

function Get-YamlInlineList {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string]$Key
    )
    $rx = "(?m)^\s*$([Regex]::Escape($Key))\s*:\s*\[(.*?)\]\s*$"
    $m = [regex]::Match($Text, $rx)
    if (-not $m.Success) { return @() }
    $inner = $m.Groups[1].Value
    if ([string]::IsNullOrWhiteSpace($inner)) { return @() }
    return ($inner -split ',') | ForEach-Object { $_.Trim().Trim("'`"") } | Where-Object { $_ }
}

function Get-YamlLiteralBlock {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string]$Key
    )
    $rx = "(?ms)^\s*$([Regex]::Escape($Key))\s*:\s*\|\s*\r?\n(?<block>(?:[ \t]+.*\r?\n?)*)"
    $m = [regex]::Match($Text, $rx)
    if (-not $m.Success) { return $null }

    $block = $m.Groups['block'].Value
    $contentLines = @()
    foreach ($ln in ($block -split "\r?\n")) { $contentLines += $ln }
    $nonEmpty = $contentLines | Where-Object { $_ -match '\S' }
    if (-not $nonEmpty) { return "" }

    $minIndent = ($nonEmpty | ForEach-Object {
            $mm = [regex]::Match($_, '^[ \t]+')
            if ($mm.Success) { $mm.Value.Length } else { 0 }
        } | Measure-Object -Minimum).Minimum

    $normalized = ($contentLines | ForEach-Object {
            if ($_ -match '^\s*$') { return '' }
            return $_.Substring([Math]::Min($minIndent, $_.Length))
        }) -join "`n"

    return $normalized.TrimEnd()
}

function Replace-YamlLiteralBlock {
    param(
        [Parameter(Mandatory = $true)][string]$Text,
        [Parameter(Mandatory = $true)][string]$Key,
        [Parameter(Mandatory = $true)][string]$NewContent,
        [Parameter(Mandatory = $false)][int]$Indent = 2
    )

    $indentStr = (' ' * $Indent)
    $newBlockLines = @()
    foreach ($ln in ($NewContent -split "\r?\n")) {
        if ($ln -eq '') { $newBlockLines += ($indentStr); continue }
        $newBlockLines += ($indentStr + $ln)
    }
    $replacement = "$($Key): |`n" + ($newBlockLines -join "`n") + "`n"

    $rx = "(?ms)^\s*$([Regex]::Escape($Key))\s*:\s*\|\s*\r?\n(?:[ \t]+.*\r?\n?)*"
    if (-not ([regex]::IsMatch($Text, $rx))) { return $null }
    return ([regex]::Replace($Text, $rx, $replacement, 1))
}

function Get-Placeholders {
    param([Parameter(Mandatory = $true)][string]$Text)
    $hits = @()
    foreach ($m in [regex]::Matches($Text, '\$\{[A-Za-z0-9_]+\}')) { $hits += $m.Value }
    foreach ($m in [regex]::Matches($Text, '\{\{[A-Za-z0-9_]+\}\}')) { $hits += $m.Value }
    $hits | Sort-Object -Unique
}

function Get-SiblingTestConstraints {
    param(
        [Parameter(Mandatory = $true)][string]$PromptPath
    )
    $dir = [System.IO.Path]::GetDirectoryName($PromptPath)
    $name = [System.IO.Path]::GetFileName($PromptPath)

    $base = $name -replace '\.prompt\.yaml$', '.yaml'
    $base = $base -replace '\.yaml$', ''
    $testsPath = [System.IO.Path]::Combine($dir, ($base + '.tests.yaml'))

    if (-not (Test-Path -LiteralPath $testsPath)) { return @() }

    $t = Get-Content -LiteralPath $testsPath -Raw -Encoding UTF8

    $constraints = @()
    foreach ($m in [regex]::Matches($t, "(?m)^\s*-\s*contains:\s*(.+?)\s*$")) {
        $constraints += ("- Output MUST contain the substring: " + $m.Groups[1].Value.Trim())
    }
    foreach ($m in [regex]::Matches($t, "(?m)^\s*-\s*not_contains:\s*(.+?)\s*$")) {
        $constraints += ("- Output MUST NOT contain the substring: " + $m.Groups[1].Value.Trim())
    }
    foreach ($m in [regex]::Matches($t, "(?m)^\s*-\s*contains_regex:\s*`"?(.+?)`"?\s*$")) {
        $constraints += ("- Output MUST match this regex somewhere: " + $m.Groups[1].Value.Trim())
    }
    foreach ($m in [regex]::Matches($t, "(?m)^\s*-\s*max_words:\s*([0-9]+)\s*$")) {
        $constraints += ("- Keep the output under " + $m.Groups[1].Value.Trim() + " words.")
    }

    return ($constraints | Sort-Object -Unique)
}

function Get-RefinedTextFromArtifacts {
    param([Parameter(Mandatory = $true)][string]$ArtifactsPath)

    if (-not (Test-Path -LiteralPath $ArtifactsPath)) { return $null }

    $files = Get-ChildItem -LiteralPath $ArtifactsPath -Filter 'iteration_*.txt' -ErrorAction SilentlyContinue |
        Sort-Object Name
    if (-not $files) { return $null }

    $last = $files[-1].FullName
    $raw = Get-Content -LiteralPath $last -Raw -Encoding UTF8

    $m = [regex]::Match($raw, "(?ms)Refined Result:\s*(?<r>.+?)\s*$")
    if ($m.Success) { return $m.Groups['r'].Value.Trim() }

    return $null
}

function Invoke-UATPromptBatchRefinement {
    [CmdletBinding(SupportsShouldProcess = $true)]
    param(
        [Parameter(Mandatory = $false)]
        [string]$PromptRoot = (Join-Path $Script:DataRoot 'prompts'),

        [Parameter(Mandatory = $false)]
        [ValidateRange(1, 10)]
        [int]$Iterations = 3,

        [Parameter(Mandatory = $false)]
        [switch]$SaveArtifacts,

        [Parameter(Mandatory = $false)]
        [ValidateSet('Copy', 'InPlace')]
        [string]$Mode = 'Copy',

        [Parameter(Mandatory = $false)]
        [string]$OutRoot = (Join-Path $Script:RepoRoot 'artifacts' ('prompt-refine-batch_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))),

        [Parameter(Mandatory = $false)]
        [string[]]$IncludePatterns = @('*.prompt.yaml', '*.yaml'),

        [Parameter(Mandatory = $false)]
        [string]$ExcludeRegex = '(\.meta\.yaml$|\.tests\.yaml$)',

        [Parameter(Mandatory = $false)]
        [switch]$FailFast
    )

    Set-StrictMode -Version Latest
    $ErrorActionPreference = 'Stop'

    if (-not (Test-Path -LiteralPath $PromptRoot)) {
        $fallback = Join-Path $Script:RepoRoot 'prompts'
        if (Test-Path -LiteralPath $fallback) {
            $PromptRoot = $fallback
        } else {
            throw "PromptRoot not found: $($PromptRoot)"
        }
    }

    $all = @()
    foreach ($pat in $IncludePatterns) {
        $all += Get-ChildItem -LiteralPath $PromptRoot -Recurse -File -Filter $pat -ErrorAction SilentlyContinue
    }
    $files = $all | Where-Object { $_.FullName -notmatch $ExcludeRegex } | Sort-Object FullName -Unique

    if (-not $files -or $files.Count -eq 0) {
        Write-Warning "No prompt files found under $($PromptRoot) using patterns: $($IncludePatterns -join ', ')"
        return
    }

    $refinedDir = Join-Path $OutRoot 'refined_prompts'
    $artifactsDir = Join-Path $OutRoot 'artifacts'
    New-Item -ItemType Directory -Force -Path $refinedDir, $artifactsDir | Out-Null

    $summary = @()

    foreach ($f in $files) {
        $path = $f.FullName
        $rel = try { Resolve-Path -LiteralPath $path -Relative } catch { $path }

        $entry = [ordered]@{
            file = $rel
            id = $null
            title = $null
            kind = $null
            status = 'skipped'
            promptIdUsed = $null
            artifactsPath = $null
            tokensUsed = $null
            estimatedCost = $null
            error = $null
            outFile = $null
        }

        try {
            $text = Get-Content -LiteralPath $path -Raw -Encoding UTF8

            $id = Get-FirstYamlScalar -Text $text -Key 'id'
            if (-not $id) { throw "No 'id:' found (top-level). Skipping." }
            $entry.id = $id

            $title = Get-FirstYamlScalar -Text $text -Key 'title'
            if (-not $title) { $title = $id }
            $entry.title = $title

            $hasUserTemplate = [regex]::IsMatch($text, "(?m)^\s*user_template\s*:\s*\|")
            $hasBlocksInstructions = [regex]::IsMatch($text, "(?ms)^\s*blocks\s*:\s*\r?\n.*^\s*instructions\s*:\s*\|")

            if ($hasUserTemplate) { $entry.kind = 'PromptLibrary' }
            elseif ($hasBlocksInstructions) { $entry.kind = 'PromptSpecBlocks' }
            else {
                $summary += [pscustomobject]$entry
                Write-Output ([pscustomobject]$entry)
                continue
            }

            $category = Get-FirstYamlScalar -Text $text -Key 'category'
            if (-not $category) { $category = 'general' }

            $tags = Get-YamlInlineList -Text $text -Key 'tags'
            if (-not $tags) { $tags = @() }

            $sourcePrompt = $null
            $replaceKey = $null

            if ($entry.kind -eq 'PromptLibrary') {
                $sourcePrompt = Get-YamlLiteralBlock -Text $text -Key 'user_template'
                $replaceKey = 'user_template'
            } else {
                $sourcePrompt = Get-YamlLiteralBlock -Text $text -Key 'instructions'
                $replaceKey = 'instructions'
            }

            if ([string]::IsNullOrWhiteSpace($sourcePrompt)) { throw "Prompt text block '$replaceKey' was empty." }

            $placeholders = Get-Placeholders -Text $sourcePrompt
            $testConstraints = Get-SiblingTestConstraints -PromptPath $path

            $goals = @(
                "Make the prompt more specific and actionable.",
                "Add relevant context and constraints.",
                "Ensure clarity and a strong structure for automation/orchestration.",
                "Keep the prompt concise and unambiguous.",
                "Return only the refined prompt text (no preface, no metadata)."
            )

            if ($placeholders.Count -gt 0) {
                $goals += ("Preserve these placeholders EXACTLY (do not rename/remove/add): " + ($placeholders -join ', '))
            }
            if ($testConstraints.Count -gt 0) {
                $goals += "These behavioral constraints come from the prompt's tests and must still hold:"
                $goals += $testConstraints
            }

            $promptIdUsed = $id
            if ($Mode -eq 'Copy') {
                $stamp = (Get-Date -Format 'yyyyMMdd')
                $promptIdUsed = ($id + '__refined_' + $stamp)
            }
            $entry.promptIdUsed = $promptIdUsed

            $invokeLabel = "$($promptIdUsed) <= $($id) ($($entry.kind))"

            if ($PSCmdlet.ShouldProcess($invokeLabel, "Refine prompt")) {

                $artifactTarget = Join-Path $artifactsDir ($promptIdUsed -replace '[^A-Za-z0-9_\-\.]+', '_')
                New-Item -ItemType Directory -Force -Path $artifactTarget | Out-Null

                $args = @{
                    UserPrompt = $sourcePrompt
                    PromptId = $promptIdUsed
                    Title = $title
                    Category = $category
                    Tags = $tags
                    RefinementIterations = $Iterations
                    RefinementGoals = $goals
                }
                if ($SaveArtifacts) { $args.SaveArtifacts = $true }

                $result = New-RefinedPrompt @args

                if ($result) {
                    if ($result.PSObject.Properties.Name -contains 'TokensUsed') { $entry.tokensUsed = $result.TokensUsed }
                    if ($result.PSObject.Properties.Name -contains 'EstimatedCost') { $entry.estimatedCost = $result.EstimatedCost }
                    if ($result.PSObject.Properties.Name -contains 'ArtifactsPath') { $entry.artifactsPath = $result.ArtifactsPath }
                }

                $artPath = $entry.artifactsPath
                if (-not $artPath) { $artPath = $artifactTarget }

                if ($entry.artifactsPath -and (Test-Path -LiteralPath $entry.artifactsPath)) {
                    Copy-Item -LiteralPath (Join-Path $entry.artifactsPath '*') -Destination $artifactTarget -Recurse -Force -ErrorAction SilentlyContinue
                    $artPath = $artifactTarget
                }

                $refinedText = $null
                foreach ($p in @('RefinedPrompt', 'FinalPrompt', 'PromptText', 'Prompt')) {
                    if ($result -and ($result.PSObject.Properties.Name -contains $p)) {
                        $refinedText = [string]$result.$p
                        if (-not [string]::IsNullOrWhiteSpace($refinedText)) { break }
                    }
                }
                if (-not $refinedText) {
                    $refinedText = Get-RefinedTextFromArtifacts -ArtifactsPath $artPath
                }
                if (-not $refinedText) { throw "Could not determine refined text (no recognizable property and no iteration_*.txt found)." }

                $outFileName = [System.IO.Path]::GetFileName($path)
                $outFileName = $outFileName -replace '\.yaml$', ''
                $outFileName = $outFileName + '.refined.yaml'
                $outPath = Join-Path $refinedDir $outFileName

                $outText = $text
                if ($Mode -eq 'Copy') {
                    $outText = [regex]::Replace($outText, "(?m)^\s*id\s*:\s*.+\s*$", ("id: " + $promptIdUsed), 1)
                }

                $patched = Replace-YamlLiteralBlock -Text $outText -Key $replaceKey -NewContent $refinedText -Indent 2
                if (-not $patched) { throw "Failed to patch YAML literal block '$replaceKey'." }

                Set-Content -LiteralPath $outPath -Value $patched -Encoding UTF8

                if ($Mode -eq 'InPlace') {
                    Set-Content -LiteralPath $path -Value $patched -Encoding UTF8
                }

                $entry.outFile = (try { Resolve-Path -LiteralPath $outPath -Relative } catch { $outPath })
                $entry.artifactsPath = (try { Resolve-Path -LiteralPath $artPath -Relative } catch { $artPath })
                $entry.status = 'ok'
            } else {
                $entry.status = 'whatif'
            }
        } catch {
            $entry.status = 'error'
            $entry.error = [string]$_.Exception.Message
            if ($FailFast) { throw }
        }

        $summary += [pscustomobject]$entry
        Write-Output ([pscustomobject]$entry)
    }

    $summaryPath = Join-Path $OutRoot 'summary.json'
    $summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $summaryPath -Encoding UTF8
}

Export-ModuleMember -Function Invoke-UATPromptBatchRefinement
