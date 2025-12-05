@{
    # Module manifest for module 'Telemetry'
    ModuleVersion = '1.0.0'
    GUID = '8a7b9c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d'
    Author = 'Unified AI Toolbox'
    CompanyName = 'Unknown'
    Copyright = '(c) 2024. All rights reserved.'
    Description = 'Telemetry collection and storage for Unified AI Toolbox'
    PowerShellVersion = '5.1'
    RootModule = 'Telemetry.psm1'
    FunctionsToExport = @(
        'Send-TelemetryEvent',
        'Initialize-TelemetrySink',
        'Get-TelemetryEvents',
        'Get-TelemetryStats'
    )
    CmdletsToExport = @()
    VariablesToExport = @()
    AliasesToExport = @()
    PrivateData = @{
        PSData = @{
            Tags = @('Telemetry', 'Metrics', 'Analytics', 'Monitoring')
            ProjectUri = 'https://github.com/xfaith4/UnifiedAIToolbox'
        }
    }
}
