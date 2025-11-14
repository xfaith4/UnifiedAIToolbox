@{
    RootModule        = 'PromptLibrary.psm1'
    ModuleVersion     = '1.0.1'
    GUID              = 'f8b1a4a6-6a9e-4a52-8f07-9e3d8a70b1ef'
    Author            = 'Prompt Library Team'
    CompanyName       = 'Your Org'
    Description       = 'Approved-verb prompt renderer with schema-driven prompts and tests.'
    PowerShellVersion = '5.1'
    CompatiblePSEditions = @('Desktop','Core')

    FunctionsToExport = @('Get-Prompt','Test-PromptVars','Invoke-Prompt','ConvertFrom-Yaml','ConvertTo-Hashtable')
    CmdletsToExport   = @()
    VariablesToExport = @()
    AliasesToExport   = @('Render-Prompt')

    PrivateData = @{
        PSData = @{
            Tags        = @('prompts','ai','renderer','yaml')
            ReleaseNotes= 'Hardened Hashtable coercion; forced dictionary nodes; alias for back-compat.'
        }
    }
}
