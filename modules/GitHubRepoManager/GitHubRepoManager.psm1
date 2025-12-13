$Script:ModuleVersion = '1.0.0'

$FunctionRoot = Join-Path -Path $PSScriptRoot -ChildPath 'functions'
Get-ChildItem -Path $FunctionRoot -Filter '*.ps1' | Sort-Object -Property Name | ForEach-Object {
    . $_.FullName
}

Export-ModuleMember -Function \
    Initialize-AllRepos, \
    Update-AllRepos, \
    Sync-AllRepos, \
    Export-RepoStatusReport, \
    Archive-InactiveRepos, \
    Start-RepoManagerGUI
