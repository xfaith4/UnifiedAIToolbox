CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  version INTEGER NOT NULL,
  tags TEXT,
  checksum TEXT,
  updated_utc TEXT
);
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
