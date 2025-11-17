CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  version TEXT NOT NULL,
  category TEXT,
  owner TEXT,
  tags TEXT,
  description TEXT,
  checksum TEXT,
  updated_utc TEXT
);

CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompts(category);
CREATE INDEX IF NOT EXISTS idx_prompts_owner ON prompts(owner);
CREATE INDEX IF NOT EXISTS idx_prompts_updated ON prompts(updated_utc);

-- Full-text search index for prompts
CREATE VIRTUAL TABLE IF NOT EXISTS prompts_fts USING fts5(
  id UNINDEXED,
  title,
  description,
  tags,
  content='prompts',
  content_rowid='rowid'
);

-- Triggers to keep FTS index in sync with prompts table
CREATE TRIGGER IF NOT EXISTS prompts_ai AFTER INSERT ON prompts BEGIN
  INSERT INTO prompts_fts(rowid, id, title, description, tags)
  VALUES (new.rowid, new.id, new.title, new.description, new.tags);
END;

CREATE TRIGGER IF NOT EXISTS prompts_ad AFTER DELETE ON prompts BEGIN
  DELETE FROM prompts_fts WHERE rowid = old.rowid;
END;

CREATE TRIGGER IF NOT EXISTS prompts_au AFTER UPDATE ON prompts BEGIN
  DELETE FROM prompts_fts WHERE rowid = old.rowid;
  INSERT INTO prompts_fts(rowid, id, title, description, tags)
  VALUES (new.rowid, new.id, new.title, new.description, new.tags);
END;

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  capabilities TEXT,
  checksum TEXT,
  updated_utc TEXT
);

CREATE TABLE IF NOT EXISTS artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prompt_id TEXT,
  agent_id TEXT,
  model TEXT,
  created_utc TEXT,
  path TEXT
);
