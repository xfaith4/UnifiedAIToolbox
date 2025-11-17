# Database.psm1 - SQLite database operations for PromptLibrary

# Import required assemblies - System.Data.SQLite must be installed
# Install with: Install-Package System.Data.SQLite.Core -Scope CurrentUser
try {
    Add-Type -AssemblyName "System.Data.SQLite" -ErrorAction Stop
} catch {
    Write-Warning "System.Data.SQLite assembly not available. Database features will be limited."
    Write-Warning "Install with: Install-Package System.Data.SQLite.Core or use NuGet"
}

$script:dbConnection = $null

function Initialize-Database {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$DatabasePath
    )

    $dbDir = Split-Path -Parent $DatabasePath
    if (-not (Test-Path -Path $dbDir)) {
        New-Item -ItemType Directory -Path $dbDir -Force | Out-Null
    }

    $script:dbConnection = New-Object -TypeName System.Data.SQLite.SQLiteConnection
    $script:dbConnection.ConnectionString = "Data Source=$DatabasePath;Version=3;"
    $script:dbConnection.Open()

    # Create tables if they don't exist
    $schemaPath = Join-Path $PSScriptRoot '..\..\data\sqlite\schema.sql'
    if (Test-Path $schemaPath) {
        $schema = Get-Content -Path $schemaPath -Raw
        $commands = $schema -split ';' | Where-Object { $_.Trim() -ne '' }
        
        foreach ($command in $commands) {
            try {
                $cmd = $script:dbConnection.CreateCommand()
                $cmd.CommandText = $command.Trim()
                $cmd.ExecuteNonQuery() | Out-Null
            } catch {
                Write-Warning "Error executing SQL: $_"
            } finally {
                if ($cmd) { $cmd.Dispose() }
            }
        }
    }
}

function Close-Database {
    if ($script:dbConnection -and $script:dbConnection.State -eq 'Open') {
        $script:dbConnection.Close()
        $script:dbConnection.Dispose()
        $script:dbConnection = $null
    }
}

function Update-PromptIndex {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$PromptId,
        [string]$Title,
        [string]$Version = '1.0.0',
        [string[]]$Tags = @(),
        [string]$Checksum = $null
    )

    if (-not $script:dbConnection) {
        throw "Database not initialized. Call Initialize-Database first."
    }

    $now = [DateTime]::UtcNow.ToString("o")
    $tagsJson = $Tags | ConvertTo-Json -Compress
    
    $cmd = $script:dbConnection.CreateCommand()
    $cmd.CommandText = @"
    INSERT OR REPLACE INTO prompts (id, title, version, tags, checksum, updated_utc)
    VALUES (@id, @title, @version, @tags, @checksum, @updated_utc)
"@
    
    $cmd.Parameters.AddWithValue("@id", $PromptId) | Out-Null
    $cmd.Parameters.AddWithValue("@title", $Title) | Out-Null
    $cmd.Parameters.AddWithValue("@version", $Version) | Out-Null
    $cmd.Parameters.AddWithValue("@tags", $tagsJson) | Out-Null
    $cmd.Parameters.AddWithValue("@checksum", $Checksum) | Out-Null
    $cmd.Parameters.AddWithValue("@updated_utc", $now) | Out-Null
    
    try {
        $cmd.ExecuteNonQuery() | Out-Null
    } finally {
        $cmd.Dispose()
    }
}

function Update-AgentIndex {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$AgentId,
        [string]$Name,
        [string[]]$Capabilities = @(),
        [string]$Checksum = $null
    )

    if (-not $script:dbConnection) {
        throw "Database not initialized. Call Initialize-Database first."
    }

    $now = [DateTime]::UtcNow.ToString("o")
    $capabilitiesJson = $Capabilities | ConvertTo-Json -Compress
    
    $cmd = $script:dbConnection.CreateCommand()
    $cmd.CommandText = @"
    INSERT OR REPLACE INTO agents (id, name, capabilities, checksum, updated_utc)
    VALUES (@id, @name, @capabilities, @checksum, @updated_utc)
"@
    
    $cmd.Parameters.AddWithValue("@id", $AgentId) | Out-Null
    $cmd.Parameters.AddWithValue("@name", $Name) | Out-Null
    $cmd.Parameters.AddWithValue("@capabilities", $capabilitiesJson) | Out-Null
    $cmd.Parameters.AddWithValue("@checksum", $Checksum) | Out-Null
    $cmd.Parameters.AddWithValue("@updated_utc", $now) | Out-Null
    
    try {
        $cmd.ExecuteNonQuery() | Out-Null
    } finally {
        $cmd.Dispose()
    }
}

function Add-ArtifactRecord {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$PromptId,
        [string]$AgentId,
        [string]$Model,
        [string]$Path
    )

    if (-not $script:dbConnection) {
        throw "Database not initialized. Call Initialize-Database first."
    }

    $now = [DateTime]::UtcNow.ToString("o")
    
    $cmd = $script:dbConnection.CreateCommand()
    $cmd.CommandText = @"
    INSERT INTO artifacts (prompt_id, agent_id, model, created_utc, path)
    VALUES (@prompt_id, @agent_id, @model, @created_utc, @path)
"@
    
    $cmd.Parameters.AddWithValue("@prompt_id", $PromptId) | Out-Null
    $cmd.Parameters.AddWithValue("@agent_id", $AgentId) | Out-Null
    $cmd.Parameters.AddWithValue("@model", $Model) | Out-Null
    $cmd.Parameters.AddWithValue("@created_utc", $now) | Out-Null
    $cmd.Parameters.AddWithValue("@path", $Path) | Out-Null
    
    try {
        $cmd.ExecuteNonQuery() | Out-Null
    } finally {
        $cmd.Dispose()
    }
}

function Search-Prompts {
    [CmdletBinding()]
    param(
        [string]$Query,
        [string[]]$Tags = @(),
        [int]$Limit = 10
    )

    if (-not $script:dbConnection) {
        throw "Database not initialized. Call Initialize-Database first."
    }

    $whereClauses = @()
    $parameters = @{}
    $paramCount = 0

    if ($Query) {
        $whereClauses += "(title LIKE @query OR id LIKE @query)"
        $parameters["@query"] = "%$Query%"
    }

    if ($Tags -and $Tags.Count -gt 0) {
        $tagConditions = @()
        foreach ($tag in $Tags) {
            $paramName = "@tag$paramCount"
            $tagConditions += "tags LIKE $paramName"
            $parameters[$paramName] = "%$tag%"
            $paramCount++
        }
        $whereClauses += "(" + ($tagConditions -join " OR ") + ")"
    }

    $whereClause = if ($whereClauses.Count -gt 0) { "WHERE " + ($whereClauses -join " AND ") } else { "" }
    
    $query = @"
    SELECT id, title, version, tags, updated_utc 
    FROM prompts 
    $whereClause
    ORDER BY updated_utc DESC
    LIMIT $Limit
"@
    
    $cmd = $script:dbConnection.CreateCommand()
    $cmd.CommandText = $query
    
    foreach ($key in $parameters.Keys) {
        $cmd.Parameters.AddWithValue($key, $parameters[$key]) | Out-Null
    }
    
    try {
        $reader = $cmd.ExecuteReader()
        $results = @()
        
        while ($reader.Read()) {
            $result = [PSCustomObject]@{
                Id = $reader["id"]
                Title = $reader["title"]
                Version = $reader["version"]
                Tags = $reader["tags"] | ConvertFrom-Json -ErrorAction SilentlyContinue | ForEach-Object { $_ }
                Updated = [DateTime]::Parse($reader["updated_utc"])
            }
            $results += $result
        }
        
        return $results
    } finally {
        if ($reader) { $reader.Close() }
        $cmd.Dispose()
    }
}

export-modulemember -Function Initialize-Database, Close-Database, Update-PromptIndex, Update-AgentIndex, Add-ArtifactRecord, Search-Prompts
