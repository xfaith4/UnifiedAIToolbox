-- Prompts table with core metadata
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  title TEXT,
  version TEXT NOT NULL DEFAULT '1.0.0',
  category TEXT,
  tags TEXT,
  owners TEXT,
  risk_tier TEXT,
  description TEXT,
  instructions TEXT,
  checksum TEXT,
  file_path TEXT,
  updated_utc TEXT NOT NULL
);

-- FTS5 virtual table for full-text search on prompts
CREATE VIRTUAL TABLE IF NOT EXISTS prompts_fts USING fts5(
  id UNINDEXED,
  title,
  description,
  instructions,
  tags,
  category,
  content='prompts',
  content_rowid='rowid'
);

-- Triggers to keep FTS index in sync with prompts table
CREATE TRIGGER IF NOT EXISTS prompts_ai AFTER INSERT ON prompts BEGIN
  INSERT INTO prompts_fts(rowid, id, title, description, instructions, tags, category)
  VALUES (new.rowid, new.id, new.title, new.description, new.instructions, new.tags, new.category);
END;

CREATE TRIGGER IF NOT EXISTS prompts_ad AFTER DELETE ON prompts BEGIN
  INSERT INTO prompts_fts(prompts_fts, rowid, id, title, description, instructions, tags, category)
  VALUES('delete', old.rowid, old.id, old.title, old.description, old.instructions, old.tags, old.category);
END;

CREATE TRIGGER IF NOT EXISTS prompts_au AFTER UPDATE ON prompts BEGIN
  INSERT INTO prompts_fts(prompts_fts, rowid, id, title, description, instructions, tags, category)
  VALUES('delete', old.rowid, old.id, old.title, old.description, old.instructions, old.tags, old.category);
  INSERT INTO prompts_fts(rowid, id, title, description, instructions, tags, category)
  VALUES (new.rowid, new.id, new.title, new.description, new.instructions, new.tags, new.category);
END;

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  capabilities TEXT,
  checksum TEXT,
  file_path TEXT,
  updated_utc TEXT NOT NULL
);

-- FTS5 virtual table for full-text search on agents
CREATE VIRTUAL TABLE IF NOT EXISTS agents_fts USING fts5(
  id UNINDEXED,
  name,
  role,
  capabilities,
  content='agents',
  content_rowid='rowid'
);

-- Triggers to keep FTS index in sync with agents table
CREATE TRIGGER IF NOT EXISTS agents_ai AFTER INSERT ON agents BEGIN
  INSERT INTO agents_fts(rowid, id, name, role, capabilities)
  VALUES (new.rowid, new.id, new.name, new.role, new.capabilities);
END;

CREATE TRIGGER IF NOT EXISTS agents_ad AFTER DELETE ON agents BEGIN
  INSERT INTO agents_fts(agents_fts, rowid, id, name, role, capabilities)
  VALUES('delete', old.rowid, old.id, old.name, old.role, old.capabilities);
END;

CREATE TRIGGER IF NOT EXISTS agents_au AFTER UPDATE ON agents BEGIN
  INSERT INTO agents_fts(agents_fts, rowid, id, name, role, capabilities)
  VALUES('delete', old.rowid, old.id, old.name, old.role, old.capabilities);
  INSERT INTO agents_fts(rowid, id, name, role, capabilities)
  VALUES (new.rowid, new.id, new.name, new.role, new.capabilities);
END;

-- Artifacts table for tracking orchestration runs
CREATE TABLE IF NOT EXISTS artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_id TEXT,
  agent_id TEXT,
  model TEXT,
  created_utc TEXT NOT NULL,
  path TEXT,
  FOREIGN KEY (prompt_id) REFERENCES prompts(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Index for faster artifact queries
CREATE INDEX IF NOT EXISTS idx_artifacts_created ON artifacts(created_utc DESC);
CREATE INDEX IF NOT EXISTS idx_artifacts_prompt ON artifacts(prompt_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_agent ON artifacts(agent_id);
