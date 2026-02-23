# MCP Library

Purpose: Explain MCP Library capabilities, UI workflow, and current status.

## Overview

The MCP Library lets you browse MCP servers, manage collections, install/enable servers, and bind allowlists to runs.

## What you can do

- Browse/search servers with filters (tags, status, capabilities)
- View server details (capabilities, auth requirements, provenance)
- Manage collections (curated bundles)
- Install/enable/disable servers
- Bind allowlists to runs (deny-by-default enforcement)

## Run allowlisting (high level)

1. Select allowed servers or collections for a run.
2. Create a run-scoped allowlist.
3. MCP tool calls are evaluated against the allowlist.

## Audit trail

All policy decisions and tool executions are logged with redaction. Use audit endpoints in `mcp/governance.md`.

## Status and roadmap

- Backend governance and storage are implemented.
- UI browse/search is available; collections and installs may require follow-up UX work.

## Related docs

- [MCP governance](governance.md)
- [Registry ingestion](registry-ingestion.md)
