# Database.psm1 - SQLite database operations for PromptLibrary

# Try to import PSSQLite module (cross-platform PowerShell SQLite module)
# If not available, try System.Data.SQLite assembly
# If neither available, fall back to sqlite3 CLI
$script:dbConnection = $null
$script:dbPath = $null
$script:usePSSQLite = $false
$script:useSystemDataSQLite = $false
$script:useSqliteCLI = $false

# Try PSSQLite first (most portable) - but only if already installed
try {
    if (Get-Module -ListAvailable -Name PSSQLite) {
        Import-Module PSSQLite -ErrorAction Stop
        $script:usePSSQLite = $true
        Write-Verbose "Using PSSQLite module for database operations"
    } else {
        throw "PSSQLite not available"
    }
} catch {
    Write-Verbose "PSSQLite module not available, trying System.Data.SQLite..."
    
    # Try System.Data.SQLite assembly
    try {
        Add-Type -AssemblyName "System.Data.SQLite" -ErrorAction Stop
        $script:useSystemDataSQLite = $true
        Write-Verbose "Using System.Data.SQLite assembly for database operations"
    } catch {
        Write-Verbose "System.Data.SQLite not available, will use sqlite3 CLI if available"
        
        # Check if sqlite3 CLI is available
        if (Get-Command sqlite3 -ErrorAction SilentlyContinue) {
            $script:useSqliteCLI = $true
            Write-Verbose "Using sqlite3 CLI for database operations"
        } else {
            Write-Warning "No SQLite provider available. Database features will be limited."
            Write-Warning "Install PSSQLite with: Install-Module PSSQLite -Scope CurrentUser"
        }
    }
}

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

    $script:dbPath = $DatabasePath

    # Initialize based on available provider
    if ($script:usePSSQLite) {
        # PSSQLite doesn't use persistent connections, just store the path
        Write-Verbose "Database initialized at: $DatabasePath"
    } elseif ($script:useSystemDataSQLite) {
        $script:dbConnection = New-Object -TypeName System.Data.SQLite.SQLiteConnection
        $script:dbConnection.ConnectionString = "Data Source=$DatabasePath;Version=3;"
        $script:dbConnection.Open()
    } elseif ($script:useSqliteCLI) {
        # CLI doesn't need a connection, just verify the database file
        if (-not (Test-Path $DatabasePath)) {
            # Create empty database
            & sqlite3 $DatabasePath "SELECT 1;" 2>&1 | Out-Null
        }
    } else {
        throw "No SQLite provider available. Cannot initialize database."
    }

    # Create tables if they don't exist
    # From Private/ we need to go up to modules/, then up to repo root, then to data/sqlite
    $schemaPath = Join-Path $PSScriptRoot '..\..\..\data\sqlite\schema.sql'
    if (Test-Path $schemaPath) {
        $schema = Get-Content -Path $schemaPath -Raw
        
        if ($script:usePSSQLite) {
            # PSSQLite can execute multi-statement SQL
            try {
                Invoke-SqliteQuery -DataSource $DatabasePath -Query $schema -ErrorAction Stop
            } catch {
                Write-Warning "Error executing schema with PSSQLite: $_"
            }
        } elseif ($script:useSystemDataSQLite) {
            # System.Data.SQLite needs one statement at a time
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
        } elseif ($script:useSqliteCLI) {
            # Use sqlite3 CLI with input file redirection
            try {
                # sqlite3 works best with file redirection on Unix systems
                $result = & /bin/sh -c "sqlite3 '$DatabasePath' < '$schemaPath'" 2>&1
                if ($LASTEXITCODE -ne 0) {
                    Write-Warning "Error executing schema with sqlite3 CLI: $result"
                }
            } catch {
                Write-Warning "Error executing schema with sqlite3 CLI: $_"
            }
        }
    }
}

function Close-Database {
    if ($script:useSystemDataSQLite -and $script:dbConnection -and $script:dbConnection.State -eq 'Open') {
        $script:dbConnection.Close()
        $script:dbConnection.Dispose()
        $script:dbConnection = $null
    }
    # PSSQLite and CLI don't need explicit close
    $script:dbPath = $null
}

function Update-PromptIndex {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$PromptId,
        [string]$Title,
        [string]$Version = '1.0.0',
        [string]$Category = '',
        [string[]]$Tags = @(),
        [string[]]$Owners = @(),
        [string]$RiskTier = '',
        [string]$Description = '',
        [string]$Instructions = '',
        [string]$Checksum = $null,
        [string]$FilePath = ''
    )

    if (-not $script:dbPath -and -not $script:dbConnection) {
        throw "Database not initialized. Call Initialize-Database first."
    }

    $now = [DateTime]::UtcNow.ToString("o")
    $tagsJson = $Tags | ConvertTo-Json -Compress
    $ownersJson = $Owners | ConvertTo-Json -Compress
    
    $query = @"
INSERT OR REPLACE INTO prompts (id, title, version, category, tags, owners, risk_tier, description, instructions, checksum, file_path, updated_utc)
VALUES (@id, @title, @version, @category, @tags, @owners, @risk_tier, @description, @instructions, @checksum, @file_path, @updated_utc)
"@
    
    $params = @{
        id = $PromptId
        title = $Title
        version = $Version
        category = $Category
        tags = $tagsJson
        owners = $ownersJson
        risk_tier = $RiskTier
        description = $Description
        instructions = $Instructions
        checksum = $Checksum
        file_path = $FilePath
        updated_utc = $now
    }
    
    if ($script:usePSSQLite) {
        try {
            Invoke-SqliteQuery -DataSource $script:dbPath -Query $query -SqlParameters $params -ErrorAction Stop
        } catch {
            Write-Warning "Error updating prompt index with PSSQLite: $_"
        }
    } elseif ($script:useSystemDataSQLite) {
        $cmd = $script:dbConnection.CreateCommand()
        $cmd.CommandText = $query
        
        foreach ($key in $params.Keys) {
            $cmd.Parameters.AddWithValue("@$key", $params[$key]) | Out-Null
        }
        
        try {
            $cmd.ExecuteNonQuery() | Out-Null
        } catch {
            Write-Warning "Error updating prompt index: $_"
        } finally {
            $cmd.Dispose()
        }
    } elseif ($script:useSqliteCLI) {
        # Build SQL with escaped values for CLI
        $escapedValues = @()
        foreach ($key in @('id', 'title', 'version', 'category', 'tags', 'owners', 'risk_tier', 'description', 'instructions', 'checksum', 'file_path', 'updated_utc')) {
            $val = $params[$key]
            if ($null -eq $val) {
                $escapedValues += "NULL"
            } else {
                $escaped = $val.ToString().Replace("'", "''")
                $escapedValues += "'$escaped'"
            }
        }
        $cliQuery = "INSERT OR REPLACE INTO prompts (id, title, version, category, tags, owners, risk_tier, description, instructions, checksum, file_path, updated_utc) VALUES ($($escapedValues -join ', '));"
        
        try {
            $cliQuery | & sqlite3 $script:dbPath 2>&1 | Out-Null
        } catch {
            Write-Warning "Error updating prompt index with sqlite3 CLI: $_"
        }
    }
}

function Update-AgentIndex {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$AgentId,
        [string]$Name,
        [string]$Role = '',
        [string[]]$Capabilities = @(),
        [string]$Checksum = $null,
        [string]$FilePath = ''
    )

    if (-not $script:dbPath -and -not $script:dbConnection) {
        throw "Database not initialized. Call Initialize-Database first."
    }

    $now = [DateTime]::UtcNow.ToString("o")
    $capabilitiesJson = $Capabilities | ConvertTo-Json -Compress
    
    $query = @"
INSERT OR REPLACE INTO agents (id, name, role, capabilities, checksum, file_path, updated_utc)
VALUES (@id, @name, @role, @capabilities, @checksum, @file_path, @updated_utc)
"@
    
    $params = @{
        id = $AgentId
        name = $Name
        role = $Role
        capabilities = $capabilitiesJson
        checksum = $Checksum
        file_path = $FilePath
        updated_utc = $now
    }
    
    if ($script:usePSSQLite) {
        try {
            Invoke-SqliteQuery -DataSource $script:dbPath -Query $query -SqlParameters $params -ErrorAction Stop
        } catch {
            Write-Warning "Error updating agent index with PSSQLite: $_"
        }
    } elseif ($script:useSystemDataSQLite) {
        $cmd = $script:dbConnection.CreateCommand()
        $cmd.CommandText = $query
        
        foreach ($key in $params.Keys) {
            $cmd.Parameters.AddWithValue("@$key", $params[$key]) | Out-Null
        }
        
        try {
            $cmd.ExecuteNonQuery() | Out-Null
        } catch {
            Write-Warning "Error updating agent index: $_"
        } finally {
            $cmd.Dispose()
        }
    } elseif ($script:useSqliteCLI) {
        # Build SQL with escaped values for CLI
        $escapedValues = @()
        foreach ($key in @('id', 'name', 'role', 'capabilities', 'checksum', 'file_path', 'updated_utc')) {
            $val = $params[$key]
            if ($null -eq $val) {
                $escapedValues += "NULL"
            } else {
                $escaped = $val.ToString().Replace("'", "''")
                $escapedValues += "'$escaped'"
            }
        }
        $cliQuery = "INSERT OR REPLACE INTO agents (id, name, role, capabilities, checksum, file_path, updated_utc) VALUES ($($escapedValues -join ', '));"
        
        try {
            $cliQuery | & sqlite3 $script:dbPath 2>&1 | Out-Null
        } catch {
            Write-Warning "Error updating agent index with sqlite3 CLI: $_"
        }
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

    if (-not $script:dbPath -and -not $script:dbConnection) {
        throw "Database not initialized. Call Initialize-Database first."
    }

    $now = [DateTime]::UtcNow.ToString("o")
    
    $query = @"
INSERT INTO artifacts (prompt_id, agent_id, model, created_utc, path)
VALUES (@prompt_id, @agent_id, @model, @created_utc, @path)
"@
    
    $params = @{
        prompt_id = $PromptId
        agent_id = $AgentId
        model = $Model
        created_utc = $now
        path = $Path
    }
    
    if ($script:usePSSQLite) {
        try {
            Invoke-SqliteQuery -DataSource $script:dbPath -Query $query -SqlParameters $params -ErrorAction Stop
        } catch {
            Write-Warning "Error adding artifact record with PSSQLite: $_"
        }
    } elseif ($script:useSystemDataSQLite) {
        $cmd = $script:dbConnection.CreateCommand()
        $cmd.CommandText = $query
        
        foreach ($key in $params.Keys) {
            $cmd.Parameters.AddWithValue("@$key", $params[$key]) | Out-Null
        }
        
        try {
            $cmd.ExecuteNonQuery() | Out-Null
        } catch {
            Write-Warning "Error adding artifact record: $_"
        } finally {
            $cmd.Dispose()
        }
    } elseif ($script:useSqliteCLI) {
        $escapedValues = @()
        foreach ($key in @('prompt_id', 'agent_id', 'model', 'created_utc', 'path')) {
            $val = $params[$key]
            if ($null -eq $val) {
                $escapedValues += "NULL"
            } else {
                $escaped = $val.ToString().Replace("'", "''")
                $escapedValues += "'$escaped'"
            }
        }
        $cliQuery = "INSERT INTO artifacts (prompt_id, agent_id, model, created_utc, path) VALUES ($($escapedValues -join ', '));"
        
        try {
            $cliQuery | & sqlite3 $script:dbPath 2>&1 | Out-Null
        } catch {
            Write-Warning "Error adding artifact record with sqlite3 CLI: $_"
        }
    }
}

function Search-Prompts {
    [CmdletBinding()]
    param(
        [string]$Query,
        [string]$Category,
        [string]$Owner,
        [string[]]$Tags = @(),
        [string]$Category,
        [string]$RiskTier,
        [int]$Limit = 50
    )

    if (-not $script:dbPath -and -not $script:dbConnection) {
        throw "Database not initialized. Call Initialize-Database first."
    }

    # Use FTS5 for full-text search if query is provided
    if ($Query) {
        # Sanitize query for FTS5 MATCH operator
        $ftsQuery = $Query.Replace('"', '""')
        
        $sqlQuery = @"
SELECT p.id, p.title, p.version, p.category, p.tags, p.owners, p.risk_tier, p.description, p.file_path, p.updated_utc,
       rank
FROM prompts_fts
JOIN prompts p ON prompts_fts.id = p.id
WHERE prompts_fts MATCH @query
"@
        
        $whereClauses = @()
        if ($Tags -and $Tags.Count -gt 0) {
            $tagConditions = @()
            for ($i = 0; $i -lt $Tags.Count; $i++) {
                $tagConditions += "p.tags LIKE @tag$i"
            }
            $whereClauses += "(" + ($tagConditions -join " OR ") + ")"
        }
        
        if ($Category) {
            $whereClauses += "p.category = @category"
        }
        
        if ($RiskTier) {
            $whereClauses += "p.risk_tier = @risk_tier"
        }
        
        if ($whereClauses.Count -gt 0) {
            $sqlQuery += " AND " + ($whereClauses -join " AND ")
        }
        
        $sqlQuery += " ORDER BY rank LIMIT @limit"
        
        $params = @{
            query = $ftsQuery
            limit = $Limit
        }
        
        if ($Tags) {
            for ($i = 0; $i -lt $Tags.Count; $i++) {
                $params["tag$i"] = "%$($Tags[$i])%"
            }
        }
        if ($Category) { $params.category = $Category }
        if ($RiskTier) { $params.risk_tier = $RiskTier }
        
    } else {
        # Regular query without FTS
        $whereClauses = @()
        $params = @{ limit = $Limit }
        
        if ($Tags -and $Tags.Count -gt 0) {
            $tagConditions = @()
            for ($i = 0; $i -lt $Tags.Count; $i++) {
                $tagConditions += "tags LIKE @tag$i"
                $params["tag$i"] = "%$($Tags[$i])%"
            }
            $whereClauses += "(" + ($tagConditions -join " OR ") + ")"
        }
        
        if ($Category) {
            $whereClauses += "category = @category"
            $params.category = $Category
        }
        
        if ($RiskTier) {
            $whereClauses += "risk_tier = @risk_tier"
            $params.risk_tier = $RiskTier
        }
        
        $whereClause = if ($whereClauses.Count -gt 0) { "WHERE " + ($whereClauses -join " AND ") } else { "" }
        
        $sqlQuery = @"
SELECT id, title, version, category, tags, owners, risk_tier, description, file_path, updated_utc
FROM prompts
$whereClause
ORDER BY updated_utc DESC
LIMIT @limit
"@
    }
    
    # Execute query based on provider
    if ($script:usePSSQLite) {
        try {
            $results = Invoke-SqliteQuery -DataSource $script:dbPath -Query $sqlQuery -SqlParameters $params -As PSObject -ErrorAction Stop
            
            # Parse JSON fields
            foreach ($result in $results) {
                if ($result.tags) {
                    $result.tags = $result.tags | ConvertFrom-Json -ErrorAction SilentlyContinue
                }
                if ($result.owners) {
                    $result.owners = $result.owners | ConvertFrom-Json -ErrorAction SilentlyContinue
                }
            }
            
            return $results
        } catch {
            Write-Warning "Error searching prompts with PSSQLite: $_"
            return @()
        }
    } elseif ($script:useSystemDataSQLite) {
        $cmd = $script:dbConnection.CreateCommand()
        $cmd.CommandText = $sqlQuery
        
        foreach ($key in $params.Keys) {
            $cmd.Parameters.AddWithValue("@$key", $params[$key]) | Out-Null
        }
        
        try {
            $reader = $cmd.ExecuteReader()
            $results = @()
            
            while ($reader.Read()) {
                $result = [PSCustomObject]@{
                    Id = $reader["id"]
                    Title = if ($reader["title"] -is [DBNull]) { $null } else { $reader["title"] }
                    Version = $reader["version"]
                    Category = if ($reader["category"] -is [DBNull]) { $null } else { $reader["category"] }
                    Tags = if ($reader["tags"] -is [DBNull]) { @() } else { $reader["tags"] | ConvertFrom-Json -ErrorAction SilentlyContinue }
                    Owners = if ($reader["owners"] -is [DBNull]) { @() } else { $reader["owners"] | ConvertFrom-Json -ErrorAction SilentlyContinue }
                    RiskTier = if ($reader["risk_tier"] -is [DBNull]) { $null } else { $reader["risk_tier"] }
                    Description = if ($reader["description"] -is [DBNull]) { $null } else { $reader["description"] }
                    FilePath = if ($reader["file_path"] -is [DBNull]) { $null } else { $reader["file_path"] }
                    Updated = [DateTime]::Parse($reader["updated_utc"])
                }
                $results += $result
            }
            
            return $results
        } finally {
            if ($reader) { $reader.Close() }
            $cmd.Dispose()
        }
    } elseif ($script:useSqliteCLI) {
        # Format query for CLI (replace parameters)
        $cliQuery = $sqlQuery
        foreach ($key in $params.Keys) {
            $val = $params[$key]
            if ($val -is [int]) {
                $cliQuery = $cliQuery.Replace("@$key", $val.ToString())
            } else {
                $escaped = $val.ToString().Replace("'", "''")
                $cliQuery = $cliQuery.Replace("@$key", "'$escaped'")
            }
        }
        
        try {
            $output = & sqlite3 $script:dbPath -json $cliQuery 2>&1
            if ($output) {
                $results = $output | ConvertFrom-Json
                
                # Parse JSON fields
                foreach ($result in $results) {
                    if ($result.tags) {
                        $result.tags = $result.tags | ConvertFrom-Json -ErrorAction SilentlyContinue
                    }
                    if ($result.owners) {
                        $result.owners = $result.owners | ConvertFrom-Json -ErrorAction SilentlyContinue
                    }
                }
                
                return $results
            }
            return @()
        } catch {
            Write-Warning "Error searching prompts with sqlite3 CLI: $_"
            return @()
        }
    }
    
    return @()
}

export-modulemember -Function Initialize-Database, Close-Database, Update-PromptIndex, Update-AgentIndex, Add-ArtifactRecord, Search-Prompts
