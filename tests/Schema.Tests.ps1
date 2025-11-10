$scriptPath = $PSCommandPath
if (-not $scriptPath) {
    $scriptPath = $MyInvocation.MyCommand.Path
}
if (-not $scriptPath) {
    throw "Unable to determine schema test path."
}
$here = Split-Path -Parent $scriptPath
$repoRoot = Split-Path -Parent $here
$moduleDir = Join-Path $repoRoot 'modules'
$modulePath = Join-Path (Join-Path $moduleDir 'PromptLibrary') 'PromptLibrary.psd1'
$promptDataPath = Join-Path (Join-Path $repoRoot 'data') 'prompts'
Import-Module $modulePath -Force
$script:PromptFiles = Get-ChildItem $promptDataPath -Recurse -Filter *.prompt.yaml

Describe 'Prompt schema' {
    It 'parses prompt yaml' -TestCases ($script:PromptFiles | ForEach-Object { @{ Path = $_.FullName } }) {
        param($Path)

        $yaml = Get-Content -Raw -LiteralPath $Path
        { PromptLibrary\Invoke-PromptYaml -Yaml $yaml } | Should -Not -Throw
    }
}
