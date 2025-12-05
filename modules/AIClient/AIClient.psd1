@{
    # Module manifest for module 'AIClient'
    ModuleVersion = '1.0.0'
    GUID = '9b8c7d4e-5f6a-7b8c-9d0e-1f2a3b4c5d6e'
    Author = 'Unified AI Toolbox'
    CompanyName = 'Unknown'
    Copyright = '(c) 2024. All rights reserved.'
    Description = 'AI client abstraction for OpenAI-compatible APIs'
    PowerShellVersion = '5.1'
    RootModule = 'AIClient.psm1'
    FunctionsToExport = @(
        'Initialize-AIClient',
        'Invoke-AICompletion',
        'Test-AIConnection'
    )
    CmdletsToExport = @()
    VariablesToExport = @()
    AliasesToExport = @()
    PrivateData = @{
        PSData = @{
            Tags = @('AI', 'OpenAI', 'LLM', 'API')
            ProjectUri = 'https://github.com/xfaith4/UnifiedAIToolbox'
        }
    }
}
