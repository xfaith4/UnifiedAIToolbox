@{
    # Script module or binary module file associated with this manifest.
    RootModule        = 'PromptLibrary.psm1'

    ModuleVersion     = '0.1.0'

    GUID              = '00000000-0000-4000-8000-000000000001'
    Author            = 'UnifiedAIApp'
    CompanyName       = 'Unified'
    Copyright         = '(c) UnifiedAIApp'

    PowerShellVersion = '5.1'

    # Modules to import as nested modules
    NestedModules     = @()

    # Scripts to process (dot-sourced at import)
    ScriptsToProcess  = @(
        'Public/Get-Search-Export.ps1'
    )

    FunctionsToExport = @(
        'Get-Prompt',
        'Search-Prompt',
        'Export-Prompt',
        'Get-Agent',
        'Invoke-Orchestration',
        'Update-PromptIndex'
    )
    CmdletsToExport   = @()
    VariablesToExport = @()
    AliasesToExport   = @()

    PrivateData       = @{
        PSData = @{
            Tags       = @('AI','Prompts','Agents','Orchestration')
            ProjectUri = 'https://example.com'
        }
    }
}
