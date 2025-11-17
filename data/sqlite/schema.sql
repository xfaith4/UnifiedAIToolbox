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

-- Cost tracking table for AI provider API calls
CREATE TABLE IF NOT EXISTS api_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL,
  input_cost REAL NOT NULL DEFAULT 0.0,
  output_cost REAL NOT NULL DEFAULT 0.0,
  total_cost REAL NOT NULL,
  prompt_id TEXT,
  agent_id TEXT,
  user_id TEXT,
  session_id TEXT,
  created_utc TEXT NOT NULL,
  metadata TEXT,
  FOREIGN KEY (prompt_id) REFERENCES prompts(id),
  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

-- Indexes for cost tracking queries
CREATE INDEX IF NOT EXISTS idx_api_costs_created ON api_costs(created_utc DESC);
CREATE INDEX IF NOT EXISTS idx_api_costs_provider ON api_costs(provider);
CREATE INDEX IF NOT EXISTS idx_api_costs_model ON api_costs(model);
CREATE INDEX IF NOT EXISTS idx_api_costs_user ON api_costs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_costs_session ON api_costs(session_id);
CREATE INDEX IF NOT EXISTS idx_api_costs_prompt ON api_costs(prompt_id);

-- View for cost summaries by provider
CREATE VIEW IF NOT EXISTS cost_summary_by_provider AS
SELECT 
  provider,
  COUNT(*) as call_count,
  SUM(total_tokens) as total_tokens,
  SUM(total_cost) as total_cost,
  AVG(total_cost) as avg_cost_per_call,
  MAX(created_utc) as last_call_utc
FROM api_costs
GROUP BY provider;

-- View for cost summaries by model
CREATE VIEW IF NOT EXISTS cost_summary_by_model AS
SELECT 
  provider,
  model,
  COUNT(*) as call_count,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(total_tokens) as total_tokens,
  SUM(total_cost) as total_cost,
  AVG(total_cost) as avg_cost_per_call,
  MAX(created_utc) as last_call_utc
FROM api_costs
GROUP BY provider, model;

-- View for daily cost summaries
CREATE VIEW IF NOT EXISTS cost_summary_by_day AS
SELECT 
  DATE(created_utc) as date,
  provider,
  COUNT(*) as call_count,
  SUM(total_tokens) as total_tokens,
  SUM(total_cost) as total_cost
FROM api_costs
GROUP BY DATE(created_utc), provider
ORDER BY date DESC;
