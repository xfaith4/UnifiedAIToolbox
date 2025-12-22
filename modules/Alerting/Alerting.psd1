@{
    RootModule = 'Alerting.psm1'
    ModuleVersion = '1.0.0'
    GUID = 'b8c3f4a5-6d7e-8f9a-0b1c-2d3e4f5a6b7c'
    Author = 'Unified AI Toolbox'
    CompanyName = 'Unified AI Toolbox'
    Copyright = '(c) 2024 Unified AI Toolbox. All rights reserved.'
    Description = 'Alerting module for Unified AI Toolbox - Monitor telemetry and trigger alerts based on configurable rules'
    PowerShellVersion = '5.1'
    
    FunctionsToExport = @(
        'Initialize-AlertingSystem',
        'New-AlertRule',
        'Add-AlertRule',
        'Remove-AlertRule',
        'Get-AlertRules',
        'Test-AlertCondition',
        'Send-Alert',
        'Get-Alerts',
        'Get-AlertStats',
        'Clear-Alerts'
    )
    
    CmdletsToExport = @()
    VariablesToExport = @()
    AliasesToExport = @()
    
    PrivateData = @{
        PSData = @{
            Tags = @('Alerting', 'Telemetry', 'Monitoring', 'Notifications')
            LicenseUri = 'https://github.com/xfaith4/UnifiedAIToolbox/blob/main/LICENSE'
            ProjectUri = 'https://github.com/xfaith4/UnifiedAIToolbox'
        }
    }
}
