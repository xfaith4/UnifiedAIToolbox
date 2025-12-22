@{
    RootModule        = 'PromptIntegration.psm1'
    ModuleVersion     = '0.1.0'
    GUID              = 'a1b2c3d4-e5f6-4a5b-8c7d-9e0f1a2b3c4d'
    Author            = 'UnifiedAIToolbox Team'
    CompanyName       = 'Unified'
    Copyright         = '(c) 2025 Unified. All rights reserved.'
    Description       = 'Integration module for UnifiedAIToolbox and Prompt Library'
    PowerShellVersion = '5.1'
    
    # Functions to export from this module
    FunctionsToExport = @(
        'Start-PromptLibrary',
        'Stop-PromptLibrary',
        'Get-PromptList',
        'Invoke-Prompt'
    )
    
    # Private data to pass to the module specified in RootModule/ModuleToProcess
    PrivateData = @{
        PSData = @{
            Tags = @('UnifiedAIToolbox', 'PromptLibrary', 'AI', 'Orchestration')
            LicenseUri = 'https://example.com/license'
            ProjectUri = 'https://github.com/yourorg/UnifiedAIToolbox'
            ReleaseNotes = 'Initial release of PromptIntegration module'
        }
    }
}
