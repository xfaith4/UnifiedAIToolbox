<#
.SYNOPSIS
    Updates the search index for prompts and agents.
.DESCRIPTION
    This function updates the SQLite search index with the latest prompts and agents from the data directory.
    It indexes all prompt YAML files and agent definitions, making them searchable.
.EXAMPLE
    Update-PromptIndex
    Updates the search index with the latest prompts and agents.
#>
[CmdletBinding()]
param()

# Import required modules
Import-Module $PSScriptRoot\..\Private\Database.psm1 -Force

# Initialize the database
$databasePath = Join-Path $Script:DataRoot 'prompts.db'
Initialize-Database -DatabasePath $databasePath

# Get all prompt files
$promptFiles = Get-ChildItem -Path (Join-Path $Script:DataRoot 'prompts') -Filter "*.yaml" -Recurse -File
$indexedCount = 0

# Index each prompt file
foreach ($file in $promptFiles) {
    try {
        $prompt = Get-Content -LiteralPath $file.FullName -Raw | ConvertFromYaml
        $prompt | Add-Member -NotePropertyName '_Path' -NotePropertyValue $file.FullName -Force
        $prompt | Add-Member -NotePropertyName '_Raw' -NotePropertyValue (Get-Content -LiteralPath $file.FullName -Raw) -Force
        
        # Extract tags
        $tags = @()
        if ($prompt.tags) {
            $tags = @($prompt.tags | ForEach-Object { $_ })
        }
        
        # Calculate checksum
        $checksum = Get-ContentHash -Text $prompt._Raw
        
        # Update index
        Update-PromptIndex -PromptId $prompt.id `
                          -Title $prompt.title `
                          -Version $prompt.version `
                          -Tags $tags `
                          -Checksum $checksum
        
        $indexedCount++
        Write-Verbose "Indexed prompt: $($prompt.id)"
    } catch {
        Write-Warning "Failed to index prompt $($file.FullName): $_"
    }
}

# Index agents
$agentFiles = Get-ChildItem -Path (Join-Path $Script:DataRoot 'agents') -Include '*.yaml', '*.json' -Recurse -File
$agentCount = 0

foreach ($file in $agentFiles) {
    try {
        $agents = Get-AgentFile -UpdateIndex
        $agentCount += $agents.Count
        Write-Verbose "Indexed $($agents.Count) agents from $($file.Name)"
    } catch {
        Write-Warning "Failed to index agents from $($file.FullName): $_"
    }
}

# Output summary
[PSCustomObject]@{
    PromptsIndexed = $indexedCount
    AgentsIndexed = $agentCount
    DatabasePath = $databasePath
}
