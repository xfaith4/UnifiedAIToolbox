param()
Import-Module (Join-Path $PSScriptRoot '..\modules\PromptLibrary\PromptLibrary.psd1') -Force
Get-ChildItem (Join-Path $PSScriptRoot '..\data\prompts') -Recurse -Filter *.yaml | ForEach-Object { Update-PromptIndex -Path $_.FullName -Verbose }
Write-Host 'Index rebuild complete (stub).'
