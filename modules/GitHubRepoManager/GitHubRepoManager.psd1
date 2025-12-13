@{
    RootModule = 'GitHubRepoManager.psm1'
    ModuleVersion = '1.0.0'
    GUID = 'b8ab867a-1234-4b1d-8a3c-934b8bf5e6d2'
    Author = 'UnifiedAIToolbox'
    CompanyName = 'UnifiedAIToolbox'
    Copyright = '(c) UnifiedAIToolbox'
    Description = 'PowerShell module for cloning, updating, syncing, exporting status, and archiving GitHub repositories with a WPF GUI.'
    PowerShellVersion = '5.1'
    FunctionsToExport = @(
        'Initialize-AllRepos',
        'Update-AllRepos',
        'Sync-AllRepos',
        'Export-RepoStatusReport',
        'Archive-InactiveRepos',
        'Start-RepoManagerGUI'
    )
    FileList = @( 'GitHubRepoManager.psm1' )
}
