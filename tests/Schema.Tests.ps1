
# Pester schema check (minimal)
Describe 'Prompt schema' {
    $files = Get-ChildItem "$PSScriptRoot/../data/prompts" -Recurse -Filter *.yaml
    It 'parses and contains required fields' -TestCases ($files | ForEach-Object { @{ Path = $_.FullName } }) {
        param($Path)
        $y = ConvertFrom-Yaml -Yaml (Get-Content -Raw -LiteralPath $Path)
        $y.id            | Should -Not -BeNullOrEmpty
        $y.title         | Should -Not -BeNullOrEmpty
        [int]$y.version  | Should -BeGreaterThan 0
        $y.user_template | Should -Not -BeNullOrEmpty
    }
}
