### BEGIN: RunStore.psm1
#requires -Version 5.1
using namespace System.Data
using namespace System.Data.SQLite

# region: Core helpers ---------------------------------------------------------

function New-SqliteConnection {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$DbPath
    )
    # Ensure folder exists
    $null = New-Item -ItemType Directory -Force -Path (Split-Path $DbPath)
    $connStr = "Data Source=$DbPath;Version=3;Pooling=True;Journal Mode=WAL;Synchronous=NORMAL"
    $conn = [SQLiteConnection]::new($connStr)
    $conn.Open()
    return $conn
}

function Invoke-NonQuery {
    param(
        [SQLiteConnection]$Conn,
        [string]$Sql,
        [hashtable]$Params
    )
    $cmd = $Conn.CreateCommand()
    $cmd.CommandText = $Sql
    foreach ($k in $Params.Keys) {
        $p = $cmd.CreateParameter()
        $p.ParameterName = $k
        $p.Value = $Params[$k]
        $null = $cmd.Parameters.Add($p)
    }
    $null = $cmd.ExecuteNonQuery()
    $cmd.Dispose()
}

function Invoke-Query {
    param(
        [SQLiteConnection]$Conn,
        [string]$Sql,
        [hashtable]$Params = @{}
    )
    $cmd = $Conn.CreateCommand()
    $cmd.CommandText = $Sql
    foreach ($k in $Params.Keys) {
        $p = $cmd.CreateParameter()
        $p.ParameterName = $k
        $p.Value = $Params[$k]
        $null = $cmd.Parameters.Add($p)
    }
    $adp = [SQLiteDataAdapter]::new($cmd)
    $dt = [DataTable]::new()
    $null = $adp.Fill($dt)
    $cmd.Dispose()
    $adp.Dispose()
    return $dt
}

# endregion

# region: Initialization -------------------------------------------------------

function Initialize-RunStore {
    <#
    .SYNOPSIS
      Create the SQLite DB with FTS5 and folders if missing.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$Root,           # e.g. G:\Development\20_Staging\AI-Toolbox\Orchestration\RunStore
        [string]$DbName = 'runstore.sqlite'
    )
    $storeDir = (Resolve-Path -LiteralPath $Root -ErrorAction SilentlyContinue) ?? (New-Item -ItemType Directory -Path $Root -Force).FullName
    $dbPath = Join-Path $storeDir $DbName
    $artDir = Join-Path $storeDir 'artifacts'
    $null = New-Item -ItemType Directory -Force -Path $artDir

    $conn = New-SqliteConnection -DbPath $dbPath
    try {
        $schema = @"
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS Runs (
  run_id        TEXT PRIMARY KEY,
  created_utc   TEXT NOT NULL,
  updated_utc   TEXT NOT NULL,
  status        TEXT NOT NULL,                 -- New | Running | Succeeded | Failed | Canceled
  model         TEXT,
  codex_model   TEXT,
  entry_point   TEXT,                          -- 'Validate' | 'RunCodexOnly' | 'RunUnifiedFlow'
  repo_root     TEXT,
  goal_file     TEXT,
  max_iterations INTEGER,
  pass_threshold INTEGER,
  metrics_json  TEXT                           -- JSON blob for arbitrary KPIs
);

CREATE TABLE IF NOT EXISTS RunNotes (
  run_id   TEXT NOT NULL,
  note_id  TEXT NOT NULL,
  ts_utc   TEXT NOT NULL,
  kind     TEXT NOT NULL,                      -- Log | Info | Warning | Error
  text     TEXT NOT NULL,
  PRIMARY KEY (run_id, note_id),
  FOREIGN KEY (run_id) REFERENCES Runs(run_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS RunArtifacts (
  run_id   TEXT NOT NULL,
  path_rel TEXT NOT NULL,                      -- relative path inside artifacts\<run_id>
  bytes    INTEGER,
  sha256   TEXT,
  PRIMARY KEY (run_id, path_rel),
  FOREIGN KEY (run_id) REFERENCES Runs(run_id) ON DELETE CASCADE
);

-- FTS5 for fast search across prompts/notes/log snippets/goal
CREATE VIRTUAL TABLE IF NOT EXISTS Runs_fts USING fts5(
  run_id UNINDEXED,
  goal,
  instruction,
  notes,
  content='',
  tokenize='porter'
);

"@
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = $schema
        $null = $cmd.ExecuteNonQuery()
        $cmd.Dispose()
    } finally {
        $conn.Close(); $conn.Dispose()
    }

    [pscustomobject]@{
        StoreRoot     = $storeDir
        DbPath        = $dbPath
        ArtifactsRoot = $artDir
    }
}

# endregion

# region: Run lifecycle --------------------------------------------------------

function New-RunRecord {
    <#
    .SYNOPSIS
      Create a run row and the artifact folder; return identifiers.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$StoreRoot,
        [Parameter(Mandatory)][string]$DbPath,
        [ValidateSet('Validate','RunCodexOnly','RunUnifiedFlow')][string]$EntryPoint,
        [string]$Model,
        [string]$CodexModel,
        [string]$RepoRoot,
        [string]$GoalFile,
        [int]$MaxIterations,
        [int]$PassThreshold,
        [string]$InstructionText = ''
    )
    $runId = [guid]::NewGuid().ToString('N')
    $now = (Get-Date).ToUniversalTime().ToString('o')

    $conn = New-SqliteConnection -DbPath $DbPath
    try {
        Invoke-NonQuery -Conn $conn -Sql @"
INSERT INTO Runs (run_id, created_utc, updated_utc, status, model, codex_model, entry_point, repo_root, goal_file, max_iterations, pass_threshold, metrics_json)
VALUES (@id, @c, @u, 'Running', @m, @cm, @ep, @rr, @gf, @mi, @pt, NULL);
"@ -Params @{
            '@id' = $runId; '@c' = $now; '@u' = $now
            '@m' = $Model; '@cm' = $CodexModel; '@ep' = $EntryPoint
            '@rr' = $RepoRoot; '@gf' = $GoalFile; '@mi' = $MaxIterations; '@pt' = $PassThreshold
        }

        # Seed FTS with goal & instruction (notes empty to start)
        Invoke-NonQuery -Conn $conn -Sql @"
INSERT INTO Runs_fts (run_id, goal, instruction, notes) VALUES (@id, @goal, @instr, '');
"@ -Params @{
            '@id' = $runId
            '@goal' = $GoalFile
            '@instr' = ($InstructionText ?? '')
        }
    } finally {
        $conn.Close(); $conn.Dispose()
    }

    $artBase = Join-Path $StoreRoot 'artifacts'
    $runDir  = Join-Path $artBase $runId
    $null = New-Item -ItemType Directory -Path (Join-Path $runDir 'prompts') -Force
    $null = New-Item -ItemType Directory -Path (Join-Path $runDir 'results') -Force

    # Create empty log file early for tailing
    $logPath = Join-Path $runDir 'output.log'
    if (-not (Test-Path $logPath)) { New-Item -ItemType File -Path $logPath | Out-Null }

    # Write a minimal summary.json
    $summary = [pscustomobject]@{
        run_id        = $runId
        created_utc   = $now
        status        = 'Running'
        entry_point   = $EntryPoint
        model         = $Model
        codex_model   = $CodexModel
        repo_root     = $RepoRoot
        goal_file     = $GoalFile
        max_iterations = $MaxIterations
        pass_threshold = $PassThreshold
    } | ConvertTo-Json -Depth 5
    $summary | Set-Content -Encoding UTF8 (Join-Path $runDir 'summary.json')

    [pscustomobject]@{
        RunId            = $runId
        ArtifactsFolder  = $runDir
        LogPath          = $logPath
    }
}

function Add-RunNote {
    <#
    .SYNOPSIS
      Append a note/log line and update FTS.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$DbPath,
        [Parameter(Mandatory)][string]$RunId,
        [ValidateSet('Log','Info','Warning','Error')][string]$Kind,
        [Parameter(Mandatory)][string]$Text,
        [string]$ArtifactsFolder
    )
    $noteId = [guid]::NewGuid().ToString('N')
    $now = (Get-Date).ToUniversalTime().ToString('o')

    $conn = New-SqliteConnection -DbPath $DbPath
    try {
        Invoke-NonQuery -Conn $conn -Sql @"
INSERT INTO RunNotes (run_id, note_id, ts_utc, kind, text)
VALUES (@rid, @nid, @ts, @k, @t);
"@ -Params @{ '@rid'=$RunId; '@nid'=$noteId; '@ts'=$now; '@k'=$Kind; '@t'=$Text }

        # Update the FTS notes column by concatenation (simple approach keeps it tiny & useful)
        Invoke-NonQuery -Conn $conn -Sql @"
UPDATE Runs_fts SET notes = notes || ' ' || @frag WHERE run_id = @rid;
"@ -Params @{ '@rid'=$RunId; '@frag'=$Text }
    } finally {
        $conn.Close(); $conn.Dispose()
    }

    if ($ArtifactsFolder) {
        # Also append to the on-disk rolling log for human reading
        Add-Content -Encoding UTF8 -Path (Join-Path $ArtifactsFolder 'output.log') -Value ("[{0}] {1}: {2}" -f (Get-Date).ToString('s'), $Kind, $Text)
    }
}

function Add-RunArtifact {
    <#
    .SYNOPSIS
      Register an on-disk artifact (DB stores metadata & hash for integrity).
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$DbPath,
        [Parameter(Mandatory)][string]$RunId,
        [Parameter(Mandatory)][string]$ArtifactFullPath,
        [Parameter(Mandatory)][string]$ArtifactsFolder
    )
    $rel = Resolve-Path $ArtifactFullPath | ForEach-Object {
        [IO.Path]::GetRelativePath($ArtifactsFolder, $_.Path)
    }
    $bytes = (Get-Item $ArtifactFullPath).Length
    $sha = Get-FileHash -Algorithm SHA256 -Path $ArtifactFullPath | Select-Object -ExpandProperty Hash

    $conn = New-SqliteConnection -DbPath $DbPath
    try {
        Invoke-NonQuery -Conn $conn -Sql @"
INSERT OR REPLACE INTO RunArtifacts (run_id, path_rel, bytes, sha256)
VALUES (@rid, @rel, @b, @s);
"@ -Params @{ '@rid'=$RunId; '@rel'=$rel; '@b'=$bytes; '@s'=$sha }
    } finally {
        $conn.Close(); $conn.Dispose()
    }
}

function Complete-RunRecord {
    <#
    .SYNOPSIS
      Mark a run finished and update summary.json
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$DbPath,
        [Parameter(Mandatory)][string]$RunId,
        [ValidateSet('Succeeded','Failed','Canceled')][string]$Status,
        [string]$MetricsJson = '{}',
        [string]$ArtifactsFolder
    )
    $now = (Get-Date).ToUniversalTime().ToString('o')
    $conn = New-SqliteConnection -DbPath $DbPath
    try {
        Invoke-NonQuery -Conn $conn -Sql @"
UPDATE Runs SET status=@s, updated_utc=@u, metrics_json=@m WHERE run_id=@id;
"@ -Params @{ '@s'=$Status; '@u'=$now; '@m'=$MetricsJson; '@id'=$RunId }
    } finally {
        $conn.Close(); $conn.Dispose()
    }

    if ($ArtifactsFolder) {
        $sumPath = Join-Path $ArtifactsFolder 'summary.json'
        $summary = Get-Content -Raw -Path $sumPath | ConvertFrom-Json
        $summary.status = $Status
        $summary.updated_utc = $now
        $summary.metrics = ($MetricsJson | ConvertFrom-Json)
        ($summary | ConvertTo-Json -Depth 8) | Set-Content -Encoding UTF8 $sumPath
    }
}

# endregion

# region: Queries & search -----------------------------------------------------

function Get-Run {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$DbPath,
        [Parameter(Mandatory)][string]$RunId
    )
    $conn = New-SqliteConnection -DbPath $DbPath
    try {
        Invoke-Query -Conn $conn -Sql "SELECT * FROM Runs WHERE run_id=@id" -Params @{ '@id'=$RunId }
    } finally { $conn.Close(); $conn.Dispose() }
}

function Search-Runs {
    <#
    .SYNOPSIS
      Full-text search across goal/instruction/notes with simple filters.
    .EXAMPLE
      Search-Runs -DbPath .\runstore.sqlite -Query "codex swarm pass"
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$DbPath,
        [Parameter(Mandatory)][string]$Query,
        [int]$Top = 50,
        [ValidateSet('Any','Succeeded','Failed','Running')][string]$Status = 'Any'
    )
    $conn = New-SqliteConnection -DbPath $DbPath
    try {
        $whereStatus = ($Status -eq 'Any') ? '' : " AND r.status=@st "
        $sql = @"
SELECT r.run_id, r.status, r.created_utc, r.updated_utc, r.model, r.codex_model, r.entry_point, r.goal_file,
       snippet(Runs_fts, 2, '[', ']', ' … ', 8) AS goal_snip,
       snippet(Runs_fts, 3, '[', ']', ' … ', 8) AS instr_snip,
       snippet(Runs_fts, 4, '[', ']', ' … ', 10) AS notes_snip
FROM Runs r
JOIN Runs_fts f ON f.run_id = r.run_id
WHERE f.Runs_fts MATCH @q $whereStatus
ORDER BY r.updated_utc DESC
LIMIT @top;
"@
        Invoke-Query -Conn $conn -Sql $sql -Params @{ '@q'=$Query; '@top'=$Top; '@st'=$Status }
    } finally {
        $conn.Close(); $conn.Dispose()
    }
}

# endregion

Export-ModuleMember -Function *-Run*, Initialize-RunStore, Search-Runs, Get-Run
### END: RunStore.psm1
