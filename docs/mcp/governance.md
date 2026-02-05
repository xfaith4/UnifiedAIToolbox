# MCP Governance

Purpose: Describe MCP governance controls, policy enforcement, and audit logging.

## Overview
MCP governance enforces deny-by-default access to MCP servers and tools, with allowlists and audit trails.

Key components:
- **Policy engine** — evaluates tool calls (allow/deny + reason)
- **Runtime enforcer** — blocks unauthorized calls, logs decisions
- **Audit logger** — JSONL/SQLite logs with redaction

## Core data models
- **InstallRecord** — server installation state (enabled/disabled)
- **Collection** — grouped MCP servers
- **Allowlist** — allowed servers/tools scoped to run/job/user/global
- **AuditEvent** — policy decisions and tool executions

## API surface (summary)
Routes are under `/api/mcp/*`:
- Registry: `/registry/sync`, `/registry/sources`
- Servers: `/servers/search`, `/servers/{id}`
- Collections: `/collections` (CRUD)
- Installs: `/installs` (CRUD + enable/disable)
- Allowlists: `/allowlists` (CRUD + bind)
- Audit: `/audit/query`, `/audit/events/{id}`, `/audit/summary`

## Enforcement flow (high level)
1. Orchestrator requests a tool call.
2. Policy engine evaluates installation + allowlists + denials.
3. Decision is logged (allow/deny).
4. Allowed call executes; response is logged with redaction.

## Redaction rules
Fields matching `api_key`, `secret`, `password`, `token`, `credential`, `auth`, `bearer` are redacted.

## Security defaults
- **Deny by default**
- **Fail secure** on policy errors
- **Audit-first** logging

## Related docs
- [MCP library](library.md)
- [Registry ingestion](registry-ingestion.md)
