# Prompt Index Guide

## Overview

The UnifiedAIToolbox uses SQLite with FTS5 (Full-Text Search 5) to provide fast, powerful searching across all prompts and agents. This guide explains how to use and maintain the prompt index.

## Quick Start

### Build/Rebuild the Index

```powershell
# From repository root
pwsh ./scripts/Build-Index.ps1
```

This will:
- Index all `.prompt.yaml` files in `data/prompts/`
- Index all agent definitions in `data/agents/`
- Create/update `data/prompts.db` with FTS5 indexes
- Display statistics (prompts indexed, agents indexed, errors)

### Search Using SQLite

```bash
# Search for prompts containing "powershell"
sqlite3 data/prompts.db "
  SELECT p.id, p.title, p.version 
  FROM prompts_fts 
  JOIN prompts p ON prompts_fts.id = p.id 
  WHERE prompts_fts MATCH 'powershell'
"

# Search with filters
sqlite3 data/prompts.db "
  SELECT p.id, p.title, p.risk_tier 
  FROM prompts_fts 
  JOIN prompts p ON prompts_fts.id = p.id 
  WHERE prompts_fts MATCH 'review' 
    AND p.risk_tier = 'low'
"
```

### Search Using PowerShell Module

```powershell
# Import the module
Import-Module ./modules/PromptLibrary/PromptLibrary.psd1

# Search for prompts
Search-Prompts -Query "powershell" -Limit 10

# Search with filters
Search-Prompts -Query "review" -Category "engineering" -RiskTier "low"

# Search by tags only (no FTS)
Search-Prompts -Tags @("powershell", "review")
```

## Database Schema

### Tables

#### `prompts`
Stores prompt metadata:
- `id` - Unique identifier
- `title` - Prompt title
- `version` - Version string
- `category` - Category classification
- `tags` - JSON array of tags
- `owners` - JSON array of owner emails
- `risk_tier` - Risk level (low, medium, high)
- `description` - System description from blocks
- `instructions` - User instructions from blocks
- `checksum` - SHA256 hash for change detection
- `file_path` - Absolute path to YAML file
- `updated_utc` - Last update timestamp

#### `prompts_fts`
FTS5 virtual table for full-text search on:
- `title`
- `description`
- `instructions`
- `tags`
- `category`

#### `agents`
Stores agent metadata:
- `id` - Unique identifier
- `name` - Agent name
- `role` - Agent role description
- `capabilities` - JSON array of capabilities
- `checksum` - SHA256 hash
- `file_path` - Absolute path to definition file
- `updated_utc` - Last update timestamp

#### `agents_fts`
FTS5 virtual table for full-text search on:
- `name`
- `role`
- `capabilities`

#### `artifacts`
Tracks orchestration execution artifacts:
- `id` - Auto-increment ID
- `prompt_id` - Foreign key to prompts
- `agent_id` - Foreign key to agents
- `model` - Model used
- `created_utc` - Creation timestamp
- `path` - Path to artifact JSON file

## FTS5 Query Syntax

### Basic Search
```sql
WHERE prompts_fts MATCH 'word'
```

### Phrase Search
```sql
WHERE prompts_fts MATCH '"exact phrase"'
```

### Boolean Operators
```sql
-- AND (implicit)
WHERE prompts_fts MATCH 'word1 word2'

-- OR
WHERE prompts_fts MATCH 'word1 OR word2'

-- NOT
WHERE prompts_fts MATCH 'word1 NOT word2'
```

### Column-Specific Search
```sql
WHERE prompts_fts MATCH 'title:powershell'
WHERE prompts_fts MATCH 'category:engineering'
```

### Prefix Search
```sql
WHERE prompts_fts MATCH 'power*'
```

## Index Maintenance

### When to Rebuild

Rebuild the index when:
1. You add new prompt YAML files
2. You modify existing prompts
3. You add/modify agent definitions
4. After a `git pull` that changes prompt files

### Automatic Rebuilds

The CI workflow automatically rebuilds the index on every commit, ensuring it stays in sync.

### Incremental Updates

For single-file updates:

```powershell
Import-Module ./modules/PromptLibrary/PromptLibrary.psd1

# Update a specific prompt
$prompt = Get-Content ./data/prompts/my-prompt.yaml -Raw | ConvertFrom-Yaml
Update-PromptIndex -PromptId $prompt.id -Title $prompt.title `
    -Version $prompt.version -Category $prompt.category `
    -Tags $prompt.telemetry.tags ...
```

## Performance

### Benchmarks

With 18 prompts and 6 agents:
- Database size: 124KB
- Index build time: <5 seconds
- Search query time: <10ms
- Supports 10,000+ prompts efficiently

### Optimization Tips

1. **Use FTS for text search** - Much faster than LIKE queries
2. **Filter after FTS** - Use WHERE clauses to narrow results
3. **Limit results** - Use LIMIT to reduce result set size
4. **Index regularly** - Keep index up-to-date for best performance

## Troubleshooting

### Database Corruption

If you get "database disk image is malformed" errors:

```bash
# Delete and rebuild
rm data/prompts.db
pwsh ./scripts/Build-Index.ps1
```

### Missing Tables

If tables don't exist:

```bash
# Verify schema
sqlite3 data/prompts.db ".schema"

# If empty, rebuild
rm data/prompts.db
pwsh ./scripts/Build-Index.ps1
```

### FTS Not Working

If FTS queries fail, rebuild the FTS index:

```sql
-- Rebuild prompts FTS
INSERT INTO prompts_fts(prompts_fts) VALUES('rebuild');

-- Rebuild agents FTS
INSERT INTO agents_fts(agents_fts) VALUES('rebuild');
```

### PowerShell Module Not Loading

Ensure you're using PowerShell 5.1+ or PowerShell Core 7+:

```powershell
$PSVersionTable.PSVersion
```

## Integration

### Python (prompt-api service)

```python
import sqlite3

# Connect
conn = sqlite3.connect('data/prompts.db')
cursor = conn.cursor()

# Search
cursor.execute("""
    SELECT p.id, p.title, p.version 
    FROM prompts_fts 
    JOIN prompts p ON prompts_fts.id = p.id 
    WHERE prompts_fts MATCH ?
""", ('powershell',))

results = cursor.fetchall()
conn.close()
```

### Node.js (Dashboard)

```javascript
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('data/prompts.db');

db.all(`
  SELECT p.id, p.title, p.version 
  FROM prompts_fts 
  JOIN prompts p ON prompts_fts.id = p.id 
  WHERE prompts_fts MATCH ?
`, ['powershell'], (err, rows) => {
  if (err) throw err;
  console.log(rows);
  db.close();
});
```

## Next Steps

- [ ] REST API endpoint for search (`/api/prompts/search`)
- [ ] Dashboard search UI
- [ ] Real-time search as you type
- [ ] Advanced filters (category, tags, risk tier)
- [ ] Search result highlighting

## References

- [SQLite FTS5 Documentation](https://www.sqlite.org/fts5.html)
- [FTS5 Query Syntax](https://www.sqlite.org/fts5.html#full_text_query_syntax)
- [SQLite Documentation](https://www.sqlite.org/docs.html)
