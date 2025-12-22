@{
  RootModule        = 'PromptLibrary.psm1'
  ModuleVersion     = '0.1.0'
  GUID              = 'c9b83b5f-0a1b-4b06-8e2b-4b17966d0199'
  Author            = 'UnifiedAIApp'
  CompanyName       = 'Unified'
  PowerShellVersion = '5.1'
  FunctionsToExport = @('Get-Prompt','Search-Prompt','Export-Prompt','Get-Agent','Invoke-Orchestration','Update-PromptIndex','Update-AgentIndex','Search-Prompts','Invoke-PromptYaml','Invoke-PromptOrchestration','New-RefinedPrompt','Get-ContentHash','ConvertTo-TemplateText','Get-PromptFile','Get-AgentFile','Update-PromptIndexAll','Test-OrchCli')
  CmdletsToExport   = @()
  VariablesToExport = @()
  AliasesToExport   = @()
}
