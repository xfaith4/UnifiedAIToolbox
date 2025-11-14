#Requires -Version 5.1
param(
    [string]$Root = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
)
$ErrorActionPreference = 'Stop'

Import-Module "$PSScriptRoot\..\render\PromptLibrary.psd1" -Force

function Normalize-Input {
    param($InputObject)
    if (Get-Command ConvertTo-Hashtable -ErrorAction SilentlyContinue) {
        return (ConvertTo-Hashtable -InputObject $InputObject)
    }
    $tmp = @($InputObject)
    if ($tmp.Count -eq 1 -and $tmp[0] -is [System.Collections.IDictionary]) { return $tmp[0] }
    return $InputObject
}

$promptFiles = Get-ChildItem -LiteralPath (Join-Path $Root 'prompts\catalog') -Recurse -Filter *.prompt.yaml
$fail = 0

foreach ($pf in $promptFiles) {
    try {
        Write-Host "Validating $($pf.FullName)..." -ForegroundColor Cyan
        $spec = Get-Prompt -Path $pf.FullName
        if (-not $spec.id) { throw "Missing id" }
        if (-not $spec.version) { throw "Missing version" }
        $blocks = ConvertTo-Hashtable $spec.blocks
        if (-not $blocks['system'] -or -not $blocks['instructions']) { throw "Missing required blocks" }
    } catch {
        $fail++; Write-Host "❌ $($pf.Name): $($_.Exception.Message)" -ForegroundColor Red
    }
}

$testFiles = Get-ChildItem -LiteralPath (Join-Path $Root 'prompts\catalog') -Recurse -Filter *.tests.yaml
foreach ($tf in $testFiles) {
    $cases = (Get-Content $tf.FullName -Raw | ConvertFrom-Yaml).cases
    $promptPath = $tf.FullName -replace '\.tests\.yaml$', '.prompt.yaml'
    $spec = Get-Prompt -Path $promptPath

    foreach ($c in $cases) {
        try {
            $in  = Normalize-Input $c.input
            $out = Invoke-Prompt -Spec $spec -Input $in
            $joined = ($out.messages | ForEach-Object { $_.content }) -join "`n"

            foreach ($a in $c.asserts) {
                if ($a.contains -and ($joined -notmatch [regex]::Escape($a.contains))) { throw "Missing text: $($a.contains)" }
                if ($a.not_contains -and ($joined -match [regex]::Escape($a.not_contains))) { throw "Unexpected text: $($a.not_contains)" }
                if ($a.contains_regex -and ($joined -notmatch $a.contains_regex)) { throw "Regex not found: $($a.contains_regex)" }
                if ($a.max_words) {
                    $wc = ($joined -split '\s+').Count
                    if ($wc -gt [int]$a.max_words) { throw "Word count $wc exceeds $($a.max_words)" }
                }
                if ($a.is_json) {
                    $jsonCandidate = ($joined -split "`n" | Select-Object -Last 1)
                    $null = $jsonCandidate | ConvertFrom-Json
                }
            }
            Write-Host "✅ $($tf.Name) :: $($c.name)"
        } catch {
            $fail++; Write-Host "❌ $($tf.Name) :: $($c.name) -> $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

if ($fail -gt 0) { throw "$fail test(s) failed." } else { Write-Host "All tests passed." -ForegroundColor Green }
