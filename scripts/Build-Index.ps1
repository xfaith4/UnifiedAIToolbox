
param()

# Bootstrap module
$moduleManifest = Join-Path $PSScriptRoot '..\modules\PromptLibrary\PromptLibrary.psd1'
Import-Module $moduleManifest -Force

# Walk all prompts and "index" (no-op stub until SQLite is wired)
Get-ChildItem (Join-Path $PSScriptRoot '..\data\prompts') -Recurse -Filter *.yaml | ForEach-Object {
    Update-PromptIndex -Path $_.FullName -Verbose
}
Write-Host "Index rebuild complete (stub)."
