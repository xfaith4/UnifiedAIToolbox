# Unified AI Toolbox - Application Rebuild Prompt Chain

**Purpose**: This document provides an industry-standard, phased prompt chain that can recreate the Unified AI Toolbox application from scratch at any time.

**Approach**: Each phase builds on the previous one, following software engineering best practices with proper dependency ordering, modular architecture, and comprehensive testing.

---

## Overview

The Unified AI Toolbox is an **AI orchestration platform** that provides:
- Prompt management with YAML-based library and full-text search
- Multi-agent orchestration system with specialized agents
- FastAPI backend with OpenAPI documentation
- Next.js/React web portal for prompt and agent management
- GitHub integration for automated repository operations
- Artifact normalization pipeline for generated code
- Cost tracking and telemetry for AI operations

**Tech Stack**:
- Backend: Python 3.12+, FastAPI, SQLite
- Frontend: Next.js 16, React 19, TypeScript, TailwindCSS, MUI
- Automation: Bash, PowerShell 7+
- AI: OpenAI GPT models (GPT-5.2, GPT-4, GPT-4o)

---

## Phase 1: Foundation & Project Structure

**Objective**: Establish the project foundation with proper directory structure, configuration, and documentation framework.

### Prompt 1.1: Initialize Project Structure

```
Create a monorepo project structure for "UnifiedAIToolbox", an AI orchestration platform. 

Requirements:
1. Initialize a Git repository with proper .gitignore for Python, Node.js, and IDE files
2. Create the following directory structure:
   - /apps (for application services)
   - /docs (for documentation)
   - /data (for prompts, agents, and databases)
   - /scripts (for automation scripts)
   - /modules (for PowerShell modules)
   - /templates (for CI/CD blueprints)
   - /contracts (for JSON schemas)
   - /tests (for integration tests)
   - /config (for configuration files)

3. Create package.json for npm workspace management with these workspaces:
   - apps/unifiedtoolbox.webapp
   - apps/orchestration-bridge
   - apps/UnifiedPromptApp

4. Create a comprehensive README.md with:
   - Project overview and key features
   - Quick start guide with prerequisites
   - Installation instructions for Linux/Mac/Windows
   - Project structure documentation
   - Links to detailed documentation

5. Create .env.example with configuration sections for:
   - OpenAI API configuration (OPENAI_API_KEY, OPENAI_MODEL)
   - Service ports (API_PORT, WEB_PORT)
   - Feature flags (NORMALIZE_ARTIFACTS, MCP_ENFORCEMENT_ENABLED)
   - Optional GitHub integration (GITHUB_TOKEN)

Tech Stack: Git, npm workspaces
Deliverables: Repository structure, package.json, README.md, .env.example
```

### Prompt 1.2: Create Core Documentation

```
Create comprehensive documentation structure for the UnifiedAIToolbox platform.

Create the following documentation files in /docs:

1. **architecture.md**: System architecture overview including:
   - Frontend: Next.js 16 (React 19, TypeScript) architecture
   - Backend: FastAPI (Python 3.12+) REST API structure
   - Data layer: SQLite databases, YAML prompt storage
   - Authentication: JWT-based auth with role-based access
   - Integration patterns: MCP registry, prompt library, agent library
   - Logging and telemetry approach

2. **orchestration.md**: Orchestration system documentation including:
   - Run types (UI orchestration, repository orchestration, app factory)
   - Artifact layout and structure (run.json, steps.jsonl, decisions.jsonl)
   - Run tracking service details
   - Run lifecycle stages
   - Optional safety gates

3. **integrations.md**: External integration documentation for:
   - OpenAI API integration patterns
   - GitHub API integration for repo operations
   - MCP (Model Context Protocol) server integration
   - Artifact normalization pipeline

4. **getting-started.md**: Developer onboarding guide with:
   - Environment setup steps
   - Running services individually
   - Development workflow
   - Testing approach
   - Common troubleshooting

5. **AGENTS.md** (in root): Codex orchestration rules including:
   - Intake → Plan → Execute → Verify → Report workflow
   - Definition of done criteria
   - Artifact location conventions

Deliverables: Complete documentation framework in /docs and AGENTS.md
```

### Prompt 1.3: Create Build and Launch Scripts

```
Create cross-platform launcher scripts for the UnifiedAIToolbox platform.

Requirements:

1. **launch.sh** (Linux/Mac/WSL):
   - Check for .env file, create from .env.example if missing
   - Validate OPENAI_API_KEY is set
   - Create Python virtual environment (.venv)
   - Install Python dependencies from requirements.txt
   - Install Node.js dependencies for web app
   - Start FastAPI backend in background (port 8000)
   - Start Next.js web portal in background (port 3000)
   - Display service URLs (web portal, API docs, health check)
   - Provide graceful shutdown handling (Ctrl+C)

2. **Start-Toolbox.ps1** (Windows PowerShell):
   - Same functionality as launch.sh but for Windows
   - Use PowerShell-native commands (Test-Path, Start-Process)
   - Handle virtual environment activation on Windows
   - Display colored output using Write-Host
   - Provide proper cleanup on termination

3. **requirements.txt** (Python dependencies):
   - fastapi[all]>=0.104.0
   - uvicorn[standard]>=0.24.0
   - pydantic>=2.0.0
   - python-jose[cryptography]
   - python-multipart
   - pyyaml
   - aiofiles
   - openai>=1.0.0
   - pytest>=7.4.0
   - httpx

Both scripts should:
- Check prerequisites (Python 3.12+, Node.js 18+)
- Provide clear error messages for missing dependencies
- Be idempotent (safe to run multiple times)
- Include helpful status messages with emojis
- Open browser automatically on successful launch

Deliverables: launch.sh, Start-Toolbox.ps1, requirements.txt
```

---

## Phase 2: Backend Infrastructure

**Objective**: Build the FastAPI backend with core services for prompt management, authentication, and orchestration.

### Prompt 2.1: Create FastAPI Application Structure

```
Create the FastAPI backend application structure for UnifiedAIToolbox.

Location: /apps/UnifiedPromptApp/services/prompt-api/

Requirements:

1. **app.py** (main FastAPI application):
   - Initialize FastAPI app with title, version, description
   - Configure CORS middleware for frontend access
   - Mount static files and templates
   - Include routers for: prompts, agents, orchestration, auth, health
   - Add OpenAPI documentation configuration
   - Implement startup/shutdown event handlers
   - Add global exception handlers

2. **config.py** (configuration management):
   - Load environment variables using python-dotenv
   - Define configuration class with:
     * OpenAI settings (API key, model, temperature)
     * Service ports (API_PORT, WEB_PORT)
     * Database paths
     * Feature flags (NORMALIZE_ARTIFACTS, MCP_ENFORCEMENT_ENABLED)
     * GitHub integration settings
   - Implement singleton pattern for config access
   - Validate required settings on startup

3. **auth.py** (JWT authentication):
   - Implement JWT token generation and validation
   - Create password hashing utilities (bcrypt)
   - Define User model with roles (admin, user, readonly)
   - Implement authentication dependency for protected routes
   - Create login endpoint
   - Implement role-based access control decorators

4. **database.py** (SQLite connection management):
   - Create database connection utilities
   - Implement connection pooling
   - Add migration support
   - Create table initialization functions

5. Directory structure:
   ```
   apps/UnifiedPromptApp/services/prompt-api/
   ├── app.py
   ├── config.py
   ├── auth.py
   ├── database.py
   ├── routers/
   ├── models/
   ├── services/
   ├── tests/
   └── requirements.txt
   ```

Tech Stack: FastAPI, Pydantic v2, python-jose, bcrypt, SQLite
Deliverables: Core FastAPI application structure with authentication
```

### Prompt 2.2: Implement Prompt Management System

```
Create the prompt management system with YAML storage and SQLite full-text search.

Location: /apps/UnifiedPromptApp/services/prompt-api/

Requirements:

1. **prompt_registry.py** (prompt storage and indexing):
   - Load YAML prompt files from data/prompts/
   - Parse prompt metadata (name, version, description, tags, model)
   - Index prompts into SQLite with FTS5 full-text search
   - Implement CRUD operations for prompts
   - Add prompt versioning support
   - Create search functionality with filters (tags, model, date range)
   - Implement prompt rendering with variable substitution

2. **routers/prompts.py** (REST API endpoints):
   - GET /api/prompts - List all prompts with pagination
   - GET /api/prompts/search - Full-text search with filters
   - GET /api/prompts/{prompt_id} - Get single prompt details
   - POST /api/prompts - Create new prompt
   - PUT /api/prompts/{prompt_id} - Update prompt
   - DELETE /api/prompts/{prompt_id} - Delete prompt
   - POST /api/prompts/{prompt_id}/render - Render prompt with variables
   - GET /api/prompts/tags - Get all available tags

3. **models/prompt.py** (Pydantic models):
   - PromptMetadata model (name, version, description, tags, model, created_at)
   - PromptCreate model (for POST requests)
   - PromptUpdate model (for PUT requests)
   - PromptResponse model (for API responses)
   - SearchQuery model (query, tags, model, date_range)

4. **YAML prompt schema** (data/prompts/):
   ```yaml
   name: string
   version: string
   description: string
   tags: [string]
   model: string
   messages:
     - role: system|user|assistant
       content: string
   variables: {key: default_value}
   ```

5. **tests/test_prompt_registry.py**:
   - Test prompt loading from YAML
   - Test FTS5 search functionality
   - Test prompt versioning
   - Test variable substitution
   - Test CRUD operations

Tech Stack: PyYAML, SQLite FTS5, Pydantic v2
Deliverables: Complete prompt management system with REST API
```

### Prompt 2.3: Create Multi-Agent Orchestration Engine

```
Build the multi-agent orchestration system with supervisor, researcher, and engineer agents.

Location: /apps/UnifiedPromptApp/services/prompt-api/

Requirements:

1. **orchestrator_schemas.py** (data models):
   - RunMetadata model (run_id, status, start_time, end_time, cost)
   - AgentStep model (step_id, agent_type, action, input, output, tokens, cost)
   - DecisionRecord model (decision_id, context, reasoning, choice)
   - ArtifactManifest model (path, hash, size, type)
   - OrchestrationRequest model (task, context, agents, constraints)

2. **orchestrator.py** (orchestration engine):
   - Implement Supervisor agent (task decomposition, agent coordination)
   - Implement Researcher agent (information gathering, analysis)
   - Implement Engineer agent (code generation, artifact creation)
   - Implement Critic agent (quality review, feedback)
   - Create agent communication protocol
   - Implement decision logging (decisions.jsonl)
   - Add step tracking (steps.jsonl)
   - Implement cost tracking per agent/step
   - Add run state management (queued, running, completed, failed)

3. **routers/orchestration.py** (REST API endpoints):
   - POST /api/orchestrate - Start new orchestration run
   - GET /api/runs - List all runs with filters
   - GET /api/runs/{run_id} - Get run details
   - GET /api/runs/{run_id}/steps - Get run steps (JSONL stream)
   - GET /api/runs/{run_id}/decisions - Get decisions (JSONL stream)
   - GET /api/runs/{run_id}/artifacts - Get artifact manifest
   - DELETE /api/runs/{run_id} - Cancel/delete run
   - GET /api/runs/{run_id}/logs - Stream logs (SSE)

4. **orchestrator_logger.py** (JSONL logging):
   - Implement structured logging to JSONL files
   - Add log rotation and retention
   - Create log streaming for real-time updates
   - Implement log parsing and filtering

5. **Agent configurations** (data/agents/):
   - Create YAML definitions for each agent type
   - Include system prompts, capabilities, constraints
   - Define agent specializations and handoff protocols

6. **tests/test_orchestration.py**:
   - Test agent initialization
   - Test task decomposition
   - Test agent coordination
   - Test decision logging
   - Test cost tracking
   - Test run lifecycle management

Tech Stack: OpenAI API, asyncio, JSONL, Server-Sent Events
Deliverables: Complete multi-agent orchestration system with API
```

### Prompt 2.4: Implement GitHub Integration

```
Create GitHub integration for automated repository operations and PR management.

Location: /apps/UnifiedPromptApp/services/prompt-api/

Requirements:

1. **github_api.py** (GitHub API client):
   - Initialize GitHub client with token from environment
   - Implement repository operations:
     * Clone repository (using git CLI)
     * Create/update files
     * Commit changes with meaningful messages
     * Create pull requests with description
     * Add/update PR comments
     * Manage branches
   - Add rate limit handling
   - Implement error handling with retries

2. **routers/github.py** (REST API endpoints):
   - POST /api/github/clone - Clone repository
   - POST /api/github/repos/{owner}/{repo}/files - Create/update file
   - POST /api/github/repos/{owner}/{repo}/commits - Commit changes
   - POST /api/github/repos/{owner}/{repo}/pulls - Create pull request
   - GET /api/github/repos/{owner}/{repo}/pulls - List pull requests
   - GET /api/github/repos/{owner}/{repo} - Get repository info

3. **models/github.py** (Pydantic models):
   - RepositoryInfo model
   - CloneRequest model
   - FileUpdate model
   - CommitRequest model
   - PullRequestCreate model
   - PullRequestResponse model

4. **Repository orchestration endpoint**:
   - POST /api/orchestrate/repo - Orchestrate changes on a repository
   - Input: repo URL, task description, constraints
   - Process: Clone → Analyze → Plan → Execute → Create PR
   - Output: PR URL, run summary, cost breakdown
   - Use Server-Sent Events for real-time progress updates

5. **tests/test_github_api.py**:
   - Test repository cloning
   - Test file operations
   - Test PR creation
   - Test error handling
   - Mock GitHub API responses

Tech Stack: PyGithub or httpx for GitHub API, git CLI
Deliverables: GitHub integration with repository orchestration
```

### Prompt 2.5: Build Artifact Normalization Pipeline

```
Create an artifact normalization pipeline that cleans up and validates generated code.

Location: /apps/orchestration-bridge/src/normalize/

Requirements:

1. **normalizer.py** (main normalization orchestrator):
   - Intake: Unzip and index generated artifacts
   - Cleanup:
     * Strip markdown code fences from code files (```python, ```javascript, etc.)
     * Split bundled multi-file blobs into discrete files
     * Relocate orphaned/misplaced files to appropriate locations
   - Scaffolding: Create missing configuration files
     * Frontend: package.json, vite.config.ts, tsconfig.json, index.html
     * Backend: requirements.txt, pyproject.toml, __init__.py markers
   - Validation: Run sanity checks
     * Python syntax validation
     * package.json structure validation
     * YAML parsing validation
   - Reporting: Generate normalization_report.md with all transformations

2. **blob_splitter.py** (file extraction):
   - Detect bundled files in single artifacts
   - Extract individual files based on markers/comments
   - Preserve file permissions and metadata

3. **scaffolder.py** (configuration generation):
   - Generate package.json for Node.js projects
   - Generate requirements.txt for Python projects
   - Create tsconfig.json with sensible defaults
   - Create vite.config.ts for Vite projects
   - Add __init__.py markers for Python packages

4. **compose_fixer.py** (Docker Compose cleanup):
   - Fix common Docker Compose issues
   - Validate compose file structure
   - Add missing environment variables

5. **Configuration** (.env):
   - NORMALIZE_ARTIFACTS=true (enable/disable)
   - NORMALIZE_STRICT=false (fail on unresolved issues)

6. **tests/test_normalizer.py**:
   - Test markdown fence stripping
   - Test file splitting
   - Test scaffolding generation
   - Test validation checks
   - Test report generation

Tech Stack: Python 3.12+, pathlib, AST parser, YAML parser
Deliverables: Complete artifact normalization pipeline
```

---

## Phase 3: Frontend Web Application

**Objective**: Build the Next.js web portal with modern UI for prompt management, orchestration, and monitoring.

### Prompt 3.1: Initialize Next.js Application

```
Create the Next.js 16 web portal with TypeScript, TailwindCSS, and Material-UI.

Location: /apps/unifiedtoolbox.webapp/

Requirements:

1. **Initialize Next.js project**:
   - Use Next.js 16 with App Router
   - Configure TypeScript with strict mode
   - Set up TailwindCSS for styling
   - Add Material-UI (MUI) components
   - Configure ESLint and Prettier

2. **package.json dependencies**:
   ```json
   {
     "dependencies": {
       "next": "^16.0.0",
       "react": "^19.0.0",
       "react-dom": "^19.0.0",
       "@mui/material": "^6.0.0",
       "@emotion/react": "^11.11.0",
       "@emotion/styled": "^11.11.0",
       "recharts": "^2.12.0",
       "reactflow": "^11.11.0",
       "axios": "^1.6.0"
     }
   }
   ```

3. **Application structure**:
   ```
   apps/unifiedtoolbox.webapp/
   ├── src/
   │   ├── app/              # App Router pages
   │   ├── components/       # Reusable components
   │   ├── lib/              # Utilities and services
   │   ├── types/            # TypeScript type definitions
   │   └── styles/           # Global styles
   ├── public/               # Static assets
   ├── next.config.js
   ├── tailwind.config.js
   ├── tsconfig.json
   └── package.json
   ```

4. **next.config.js** (configuration):
   - Configure API base URL from environment
   - Set up image optimization
   - Configure build output directory
   - Add rewrites for API proxying if needed

5. **.env.local.example**:
   ```
   NEXT_PUBLIC_API_BASE=http://localhost:8000
   NEXT_PUBLIC_WEB_PORT=3000
   ```

6. **tsconfig.json** (TypeScript configuration):
   - Enable strict mode
   - Set up path aliases (@/ for src/)
   - Configure JSX for React 19

Deliverables: Initialized Next.js application with TypeScript and styling
```

### Prompt 3.2: Create Core UI Components

```
Build the core UI components and layout system for the web portal.

Location: /apps/unifiedtoolbox.webapp/src/components/

Requirements:

1. **AppLayout.tsx** (main layout component):
   - Header with logo and navigation
   - Sidebar with menu items (Prompts, Agents, Orchestration, GitHub, Settings)
   - Main content area with proper spacing
   - Footer with version and status
   - Responsive design (mobile, tablet, desktop)

2. **Header.tsx** (application header):
   - Application title and logo
   - User menu with profile and logout
   - Global search bar
   - Notification indicator
   - Cost/usage stats in header (token count, API calls)

3. **Sidebar.tsx** (navigation sidebar):
   - Menu items with icons:
     * 🎯 Prompts Library
     * 🤖 Agents
     * 🔄 Orchestration
     * 💻 GitHub Integration
     * 📊 Analytics
     * ⚙️ Settings
   - Active route highlighting
   - Collapsible on mobile
   - Role-based menu item visibility

4. **theme.ts** (Material-UI theme):
   - Define color palette (primary, secondary, accent)
   - Configure typography
   - Set up dark/light mode support
   - Define spacing and breakpoints

5. **KpiCard.tsx** (metric display card):
   - Display key metrics (API calls, tokens, cost)
   - Support trend indicators (up/down arrows)
   - Configurable refresh interval
   - Loading and error states

Tech Stack: Next.js 16, React 19, TypeScript, MUI, TailwindCSS
Deliverables: Core UI components and layout system
```

### Prompt 3.3: Build Prompt Library Interface

```
Create the prompt library interface for browsing, searching, and managing prompts.

Location: /apps/unifiedtoolbox.webapp/src/app/prompts/

Requirements:

1. **page.tsx** (prompts library page):
   - Display prompts in card/list view (toggle)
   - Full-text search with instant results
   - Filter by tags, model, date range
   - Sort by name, date, usage count
   - Pagination (20 items per page)
   - Action buttons: Edit, Delete, Duplicate, Export

2. **[id]/page.tsx** (single prompt view):
   - Display full prompt details (metadata, messages, variables)
   - Show prompt history/versions
   - Render preview with test variables
   - Usage statistics (run count, success rate, avg cost)
   - Related prompts section
   - Edit button

3. **components/PromptCard.tsx**:
   - Compact prompt display with key info
   - Tags as chips
   - Model indicator badge
   - Quick action buttons
   - Hover effects and animations

4. **components/PromptEditor.tsx**:
   - YAML editor with syntax highlighting (use CodeMirror or Monaco)
   - Real-time validation
   - Variable insertion helper
   - Template selection
   - Save/Cancel buttons
   - Version history viewer

5. **components/PromptSearch.tsx**:
   - Search input with autocomplete
   - Tag filter chips
   - Model filter dropdown
   - Date range picker
   - Clear filters button
   - Search suggestions

6. **lib/services/promptStore.ts** (API client):
   - Fetch prompts with filters
   - Search prompts
   - Create/update/delete prompts
   - Render prompts with variables
   - Get prompt history
   - Error handling with toasts

Tech Stack: React 19, TypeScript, CodeMirror/Monaco, MUI, axios
Deliverables: Complete prompt library interface
```

### Prompt 3.4: Create Orchestration Interface

```
Build the orchestration interface with visual workflow designer and run monitoring.

Location: /apps/unifiedtoolbox.webapp/src/app/engine/

Requirements:

1. **page.tsx** (orchestration designer):
   - Visual workflow canvas using ReactFlow
   - Agent nodes (Supervisor, Researcher, Engineer, Critic)
   - Connection edges showing data flow
   - Task input form (description, context, constraints)
   - Agent selection and configuration
   - Start/Stop orchestration buttons
   - Real-time status display

2. **components/orchestration/WorkflowCanvas.tsx**:
   - Drag-and-drop agent nodes
   - Connect agents with edges
   - Configure node properties (system prompt, constraints)
   - Validate workflow before execution
   - Save/load workflow templates

3. **components/orchestration/RunMonitor.tsx**:
   - Real-time run status display
   - Agent activity timeline
   - Token usage and cost tracking (live updates)
   - Decision log viewer (streaming JSONL)
   - Step viewer with expand/collapse
   - Artifact preview
   - Error handling display

4. **components/orchestration/AgentActivityTally.tsx**:
   - Bar chart of agent activity
   - Token consumption per agent
   - Cost breakdown by agent
   - Success/failure rates
   - Time spent per agent

5. **runs/page.tsx** (run history):
   - List all orchestration runs
   - Filter by status, date, agent
   - Sort by date, cost, duration
   - Run details modal
   - Delete/archive runs
   - Export run data

6. **lib/services/orchestratorApi.ts**:
   - Start orchestration (POST /api/orchestrate)
   - Stream run updates (SSE /api/runs/{run_id}/logs)
   - Fetch run details
   - Fetch run steps (JSONL)
   - Fetch decisions (JSONL)
   - Cancel run

Tech Stack: ReactFlow, Recharts, Server-Sent Events, MUI
Deliverables: Complete orchestration interface with visual designer
```

### Prompt 3.5: Build GitHub Integration Interface

```
Create the GitHub integration interface for repository management and PR tracking.

Location: /apps/unifiedtoolbox.webapp/src/app/github/

Requirements:

1. **page.tsx** (GitHub repositories list):
   - Display connected repositories
   - Add new repository button
   - Repository stats (stars, forks, issues, PRs)
   - Quick actions: Clone, View on GitHub, Orchestrate
   - Search and filter repositories

2. **[owner]/[repo]/page.tsx** (repository details):
   - Repository information (description, language, topics)
   - Recent commits timeline
   - Pull requests list with status
   - Issues list
   - Orchestration history for this repo
   - "Orchestrate Changes" button

3. **components/github/RepositoryCard.tsx**:
   - Repository name and description
   - Language badge
   - Statistics (stars, forks)
   - Last updated timestamp
   - Action buttons

4. **components/github/PullRequestList.tsx**:
   - List PRs with status badges (open, merged, closed)
   - PR title and description preview
   - Author and timestamp
   - Review status indicators
   - Link to GitHub
   - Associated run ID (if orchestrated)

5. **components/github/OrchestrationDialog.tsx**:
   - Task description input (large text area)
   - Context fields (issue number, existing files to consider)
   - Agent selection (which agents to use)
   - Constraints input (coding standards, libraries to use)
   - Branch name input
   - PR title and description templates
   - Start orchestration button
   - Real-time progress display

6. **lib/services/github.ts**:
   - Fetch repositories
   - Clone repository
   - Fetch pull requests
   - Fetch issues
   - Start repository orchestration
   - Poll orchestration status

Tech Stack: React 19, TypeScript, MUI, axios
Deliverables: Complete GitHub integration interface
```

---

## Phase 4: Integration & Orchestration Features

**Objective**: Integrate all components and add advanced orchestration features.

### Prompt 4.1: Implement Cost Tracking and Analytics

```
Build comprehensive cost tracking and analytics for AI operations.

Location: /apps/UnifiedPromptApp/services/prompt-api/

Requirements:

1. **cost_metrics.py** (cost calculation):
   - Define token costs for each OpenAI model:
     * GPT-5.2: $X per 1K input tokens, $Y per 1K output tokens
     * GPT-4: $0.03/$0.06 per 1K tokens
     * GPT-4o: $0.005/$0.015 per 1K tokens
     * GPT-4o-mini: $0.00015/$0.0006 per 1K tokens
   - Calculate cost per request
   - Calculate cost per run
   - Calculate cost per agent
   - Track cumulative costs
   - Support custom cost overrides

2. **telemetry.py** (telemetry collection):
   - Track API calls with timestamps
   - Log token usage (input/output)
   - Record response times
   - Capture error rates
   - Store telemetry in SQLite
   - Implement retention policy (90 days)

3. **routers/analytics.py** (analytics API):
   - GET /api/analytics/costs - Cost summary (daily, weekly, monthly)
   - GET /api/analytics/usage - Token usage statistics
   - GET /api/analytics/runs - Run statistics (count, success rate, avg cost)
   - GET /api/analytics/agents - Agent performance metrics
   - GET /api/analytics/trends - Time-series data for charts
   - GET /api/analytics/export - Export data as CSV/JSON

4. **Analytics page** (frontend):
   - Cost dashboard with line charts (Recharts)
   - Token usage breakdown (pie chart)
   - Run success rates (bar chart)
   - Agent performance comparison
   - Date range selector
   - Export button
   - Cost alerts configuration

5. **tests/test_cost_metrics.py**:
   - Test cost calculations for each model
   - Test telemetry logging
   - Test analytics queries
   - Test data retention

Tech Stack: SQLite, Pydantic, Recharts
Deliverables: Cost tracking and analytics system
```

### Prompt 4.2: Implement MCP (Model Context Protocol) Integration

```
Create MCP integration for managing and securing Model Context Protocol servers.

Location: /apps/orchestration-bridge/src/utils/ and data/mcp/

Requirements:

1. **mcp_registry.py** (MCP registry management):
   - Load MCP servers from data/mcp/servers.json
   - Validate server configurations
   - Implement deny-by-default policy enforcement
   - Track server availability and health
   - Log MCP tool calls
   - Implement server allowlist/denylist

2. **MCP registry schema** (data/mcp/servers.json):
   ```json
   {
     "servers": [
       {
         "id": "string",
         "name": "string",
         "type": "string",
         "command": "string",
         "args": ["string"],
         "env": {"key": "value"},
         "allowed": boolean,
         "capabilities": ["string"]
       }
     ]
   }
   ```

3. **orchestration_mcp_middleware.py** (middleware):
   - Intercept tool calls during orchestration
   - Validate against MCP registry
   - Enforce access policies
   - Log all tool invocations
   - Handle denied tool calls gracefully

4. **routers/mcp.py** (MCP management API):
   - GET /api/mcp/servers - List all MCP servers
   - GET /api/mcp/servers/{id} - Get server details
   - PUT /api/mcp/servers/{id} - Update server config
   - POST /api/mcp/servers/{id}/test - Test server connection
   - GET /api/mcp/servers/{id}/logs - Get server logs

5. **MCP UI page** (frontend):
   - List all MCP servers with status badges
   - Allow/deny toggle for each server
   - Server configuration editor
   - Connection test button
   - Usage logs viewer
   - Add new server form

6. **docs/mcp/README.md**:
   - MCP overview and purpose
   - Server configuration guide
   - Policy enforcement explanation
   - Troubleshooting guide

7. **tests/test_mcp_registry.py**:
   - Test server loading
   - Test policy enforcement
   - Test tool call logging
   - Test allowlist/denylist

Tech Stack: Python 3.12+, JSON schema validation
Deliverables: Complete MCP integration with registry management
```

### Prompt 4.3: Create Run Observatory and Tracking

```
Build a comprehensive run tracking system with centralized storage and querying.

Location: /apps/orchestration-bridge/

Requirements:

1. **Run tracking service** (lib/api-server.js):
   - Express.js API server on port 8001
   - Endpoints:
     * GET /api/runs - List all runs with filters
     * GET /api/runs/{run_id} - Get run details
     * POST /api/runs - Create new run entry
     * PUT /api/runs/{run_id} - Update run status
     * DELETE /api/runs/{run_id} - Delete run
   - Store runs in apps/orchestration-bridge/runs/
   - Maintain index.json for quick lookups

2. **Run storage structure**:
   ```
   apps/orchestration-bridge/runs/
   ├── index.json              # Quick index
   └── {run_id}/
       ├── run.json            # Run metadata
       ├── steps.jsonl         # Step events
       ├── decisions.jsonl     # Decision log
       ├── artifacts.json      # Artifact manifest
       └── logs/               # Full logs
   ```

3. **config/run-observatory.json** (configuration):
   - Configure run storage location (local or network path)
   - Set retention policies
   - Define archival rules
   - Configure cost tracking

4. **Run observatory UI** (frontend):
   - Runs explorer with filters (status, date, cost, agent)
   - Run timeline visualization
   - Cost breakdown chart
   - Step-by-step replay
   - Search runs by task description
   - Export run data

5. **lib/services/runObservatory.ts** (API client):
   - Fetch runs with filters
   - Stream run logs
   - Update run status
   - Export run data

Tech Stack: Express.js, Node.js, React
Deliverables: Run tracking service and UI
```

### Prompt 4.4: Add Telemetry and Monitoring

```
Implement comprehensive telemetry and monitoring for the platform.

Location: /apps/UnifiedPromptApp/services/prompt-api/

Requirements:

1. **telemetry_logger.py** (structured logging):
   - Log all API requests with timing
   - Log all OpenAI API calls with tokens/cost
   - Log orchestration events
   - Log errors with stack traces
   - Output to JSONL files
   - Implement log rotation (daily, max 100MB)

2. **health_check.py** (health monitoring):
   - Check database connectivity
   - Check OpenAI API availability
   - Check disk space
   - Check memory usage
   - Return health status with details

3. **routers/telemetry.py** (telemetry API):
   - GET /health - Basic health check
   - GET /api/telemetry/stats - Platform statistics
   - GET /api/telemetry/errors - Recent errors
   - GET /api/telemetry/performance - Performance metrics
   - GET /api/telemetry/logs - Query logs with filters

4. **Monitoring dashboard** (frontend):
   - System health indicators
   - Request rate chart
   - Error rate chart
   - Response time chart
   - Token usage gauge
   - Cost meter
   - Recent errors list

5. **Alerting configuration**:
   - Define alert thresholds in config
   - Email notifications for critical errors
   - Slack webhooks for alerts
   - Cost threshold alerts

Tech Stack: Python logging, JSONL, SQLite
Deliverables: Complete telemetry and monitoring system
```

---

## Phase 5: Testing, Deployment & Documentation

**Objective**: Ensure quality through testing, provide deployment options, and complete documentation.

### Prompt 5.1: Create Comprehensive Test Suite

```
Build a comprehensive test suite covering all components of the platform.

Requirements:

1. **Backend API tests** (pytest):
   - Unit tests for all service modules:
     * test_prompt_registry.py
     * test_orchestration.py
     * test_github_api.py
     * test_cost_metrics.py
     * test_mcp_registry.py
   - Integration tests:
     * test_api_endpoints.py (all REST endpoints)
     * test_authentication.py (JWT auth flow)
     * test_orchestration_flow.py (end-to-end run)
   - Test fixtures in conftest.py
   - Mock external APIs (OpenAI, GitHub)

2. **Frontend tests** (Jest, React Testing Library):
   - Component tests:
     * test_PromptCard.test.tsx
     * test_WorkflowCanvas.test.tsx
     * test_RunMonitor.test.tsx
   - Integration tests:
     * test_PromptLibrary.test.tsx (full page)
     * test_OrchestrationFlow.test.tsx
   - API client tests:
     * test_promptStore.test.ts
     * test_orchestratorApi.test.ts

3. **End-to-end tests** (Playwright):
   - User workflows:
     * Create and save a prompt
     * Start an orchestration run
     * Create a GitHub PR
     * View cost analytics
   - Test across browsers (Chrome, Firefox, Safari)

4. **Test configuration**:
   - pytest.ini for backend tests
   - jest.config.js for frontend tests
   - playwright.config.ts for e2e tests
   - CI pipeline configuration (.github/workflows/test.yml)

5. **Test data**:
   - Create fixtures in tests/fixtures/
   - Sample prompts, agents, runs
   - Mock API responses

6. **Coverage requirements**:
   - Backend: 80% code coverage minimum
   - Frontend: 70% code coverage minimum
   - Generate coverage reports (coverage.xml, lcov.info)

Tech Stack: pytest, Jest, React Testing Library, Playwright
Deliverables: Complete test suite with good coverage
```

### Prompt 5.2: Create Deployment Configurations

```
Set up deployment configurations for various environments (development, staging, production).

Requirements:

1. **Docker configuration**:
   - Create Dockerfile for FastAPI backend:
     * Multi-stage build (build + runtime)
     * Use Python 3.12 slim base image
     * Install dependencies
     * Copy application code
     * Set up non-root user
     * Expose port 8000
   
   - Create Dockerfile for Next.js frontend:
     * Multi-stage build (dependencies + build + runtime)
     * Use Node 18 alpine base image
     * Build static export
     * Use nginx for serving
     * Expose port 3000

   - Create docker-compose.yml:
     * Define services: api, web, database
     * Set up networking
     * Configure volumes for data persistence
     * Set environment variables
     * Health checks for all services

2. **Kubernetes manifests** (optional, for production):
   - deployment-api.yaml (FastAPI deployment)
   - deployment-web.yaml (Next.js deployment)
   - service-api.yaml (API service)
   - service-web.yaml (Web service)
   - ingress.yaml (routing configuration)
   - configmap.yaml (configuration)
   - secret.yaml (sensitive data)

3. **CI/CD pipeline** (.github/workflows/):
   - **ci.yml** (continuous integration):
     * Run on push and pull requests
     * Check out code
     * Set up Python and Node.js
     * Install dependencies
     * Run linters (flake8, eslint)
     * Run tests
     * Generate coverage reports
     * Upload to Codecov
   
   - **deploy.yml** (continuous deployment):
     * Trigger on push to main branch
     * Build Docker images
     * Push to container registry
     * Deploy to staging/production
     * Run smoke tests
     * Rollback on failure

4. **Environment configurations**:
   - .env.development
   - .env.staging
   - .env.production
   - Document required environment variables

5. **Monitoring and logging** (production):
   - Configure log aggregation (e.g., ELK stack)
   - Set up metrics collection (Prometheus)
   - Configure alerting (PagerDuty, Slack)
   - Add distributed tracing (OpenTelemetry)

Tech Stack: Docker, docker-compose, Kubernetes, GitHub Actions
Deliverables: Complete deployment configurations
```

### Prompt 5.3: Create User Documentation

```
Create comprehensive user documentation for the Unified AI Toolbox platform.

Requirements:

1. **docs/getting-started.md**:
   - Prerequisites (Python, Node.js, OpenAI API key)
   - Installation steps (detailed, with screenshots)
   - First-time setup (configuration, API key)
   - Running the application
   - Accessing the web portal
   - Troubleshooting common issues

2. **docs/user-guide/**:
   - **prompts.md**: How to create, manage, and use prompts
   - **agents.md**: Understanding and configuring agents
   - **orchestration.md**: Running orchestration workflows
   - **github-integration.md**: Connecting and managing GitHub repos
   - **cost-analytics.md**: Understanding and monitoring costs
   - **mcp-servers.md**: Managing MCP servers

3. **docs/api-reference.md**:
   - API endpoint documentation (generated from OpenAPI)
   - Authentication guide
   - Request/response examples
   - Error codes and handling
   - Rate limiting information

4. **docs/architecture.md** (updated):
   - High-level architecture diagram
   - Component descriptions
   - Data flow diagrams
   - Technology stack details
   - Design decisions and rationale

5. **docs/development.md**:
   - Development environment setup
   - Code structure and organization
   - Coding standards and conventions
   - Testing guidelines
   - Contribution workflow
   - Git branching strategy

6. **docs/deployment.md**:
   - Deployment options (local, Docker, Kubernetes)
   - Configuration management
   - Environment variables
   - Scaling considerations
   - Backup and recovery
   - Monitoring and maintenance

7. **Video tutorials** (optional):
   - Quick start video (5 minutes)
   - Creating and using prompts (10 minutes)
   - Running orchestration workflows (15 minutes)
   - GitHub integration demo (10 minutes)

8. **FAQ.md**:
   - Common questions and answers
   - Troubleshooting guide
   - Performance optimization tips

Tech Stack: Markdown, diagrams (Mermaid or draw.io)
Deliverables: Complete user documentation
```

### Prompt 5.4: Create Developer Documentation

```
Create comprehensive developer documentation for contributors and maintainers.

Requirements:

1. **CONTRIBUTING.md**:
   - How to contribute (issues, pull requests)
   - Code of conduct
   - Development setup
   - Testing requirements
   - Code review process
   - Release process

2. **docs/development/**:
   - **setup.md**: Development environment setup
   - **architecture-deep-dive.md**: Detailed architecture
   - **backend-guide.md**: Backend development guide
   - **frontend-guide.md**: Frontend development guide
   - **testing-guide.md**: Testing approach and tools
   - **debugging-guide.md**: Debugging tips and tools

3. **Code documentation**:
   - Add docstrings to all Python functions (Google style)
   - Add JSDoc comments to TypeScript functions
   - Document complex algorithms and business logic
   - Add inline comments for non-obvious code

4. **API documentation**:
   - OpenAPI/Swagger documentation (auto-generated)
   - API versioning strategy
   - Deprecation policy
   - Breaking change notifications

5. **Architecture Decision Records** (ADRs):
   - docs/adr/0001-use-fastapi.md
   - docs/adr/0002-use-nextjs.md
   - docs/adr/0003-sqlite-for-storage.md
   - docs/adr/0004-yaml-for-prompts.md
   - docs/adr/0005-multi-agent-architecture.md

6. **Performance guide**:
   - Performance considerations
   - Optimization techniques
   - Profiling tools
   - Caching strategies

7. **Security guide**:
   - Security best practices
   - Authentication and authorization
   - API key management
   - Dependency scanning
   - Security audit checklist

Tech Stack: Markdown, OpenAPI/Swagger
Deliverables: Complete developer documentation
```

### Prompt 5.5: Final Integration and Quality Assurance

```
Perform final integration, quality assurance, and prepare for release.

Requirements:

1. **Integration testing**:
   - Test all components working together
   - Verify all API endpoints
   - Test authentication flow end-to-end
   - Verify orchestration runs complete successfully
   - Test GitHub integration with real repositories
   - Verify cost tracking accuracy
   - Test MCP server integration

2. **Performance testing**:
   - Load testing (100 concurrent users)
   - Stress testing (maximum capacity)
   - Measure response times (target: <200ms for API, <2s for pages)
   - Identify bottlenecks
   - Optimize slow queries
   - Add caching where appropriate

3. **Security audit**:
   - Run dependency vulnerability scan (npm audit, pip-audit)
   - Check for exposed secrets
   - Verify authentication and authorization
   - Test input validation
   - Check for SQL injection vulnerabilities
   - Verify CORS configuration
   - Test rate limiting

4. **User acceptance testing**:
   - Create test scenarios for key workflows
   - Get feedback from test users
   - Document and fix UX issues
   - Verify all features work as expected
   - Test on different devices and browsers

5. **Documentation review**:
   - Verify all documentation is accurate
   - Check for broken links
   - Ensure screenshots are up to date
   - Verify code examples work
   - Get documentation reviewed by team

6. **Release preparation**:
   - Update CHANGELOG.md with all changes
   - Tag release version (v2.0.0)
   - Create release notes
   - Prepare announcement
   - Update README badges
   - Create demo video

7. **Post-release monitoring**:
   - Set up error tracking (Sentry)
   - Configure performance monitoring
   - Set up user analytics (optional)
   - Create incident response plan
   - Define support channels

Deliverables: Production-ready application with complete QA
```

---

## Phase 6: Advanced Features (Optional)

**Objective**: Add advanced features for power users and enterprise scenarios.

### Prompt 6.1: Implement Parallel Teams (Advanced Orchestration)

```
Implement parallel teams feature for running multiple agent teams concurrently.

Requirements:

1. Enable parallel team execution in orchestration
2. Configure max parallel teams (default: 4)
3. Implement team coordination and merge strategies
4. Add conflict resolution for parallel changes
5. Create UI for managing parallel teams
6. Document parallel teams usage and best practices

Tech Stack: asyncio, multiprocessing
Deliverables: Parallel teams orchestration feature
```

### Prompt 6.2: Add Requirement Wizard

```
Create an interactive requirement wizard for guided task specification.

Requirements:

1. Multi-step wizard for capturing requirements
2. Templates for common task types
3. Requirement validation and suggestions
4. Export to structured format
5. Integration with orchestration engine

Tech Stack: React, TypeScript, MUI Stepper
Deliverables: Requirement wizard interface
```

### Prompt 6.3: Implement Hardening Pipeline

```
Build an automated hardening pipeline for generated artifacts.

Requirements:

1. Security scanning (dependency vulnerabilities)
2. Code quality checks (linting, complexity analysis)
3. License compliance checking
4. Best practices validation
5. Generate hardening report
6. Auto-fix common issues where possible

Tech Stack: Bandit, Safety, Semgrep, ESLint
Deliverables: Hardening pipeline with auto-fixes
```

---

## Execution Guidelines

### Order of Execution

Execute prompts **strictly in order** (1.1 → 1.2 → 1.3 → 2.1 → ... → 5.5). Each prompt builds on the previous ones.

### Best Practices

1. **Version Control**: Commit after each prompt completion
2. **Testing**: Run tests after each major component
3. **Documentation**: Update docs as you build
4. **Code Review**: Review generated code before moving to next prompt
5. **Incremental**: Build incrementally, don't skip steps

### Quality Checks

After each phase:
- ✅ All tests pass
- ✅ Linters pass (flake8, eslint)
- ✅ Documentation is updated
- ✅ Code is committed to version control
- ✅ Manual smoke testing completed

### Customization

You can customize prompts by:
- Adding specific requirements for your use case
- Changing technology choices (e.g., PostgreSQL instead of SQLite)
- Adjusting UI frameworks or styling
- Adding domain-specific features

### Troubleshooting

If a prompt doesn't produce expected results:
1. Review the generated code
2. Check for missing dependencies
3. Verify configurations are correct
4. Run tests to identify issues
5. Refer to documentation for that component
6. Adjust prompt and regenerate

---

## Success Criteria

The application is successfully rebuilt when:

1. ✅ All services start without errors
2. ✅ Web portal is accessible and functional
3. ✅ API endpoints respond correctly
4. ✅ Authentication works
5. ✅ Prompts can be created, searched, and used
6. ✅ Orchestration runs complete successfully
7. ✅ GitHub integration works
8. ✅ Cost tracking is accurate
9. ✅ Tests pass (>80% coverage)
10. ✅ Documentation is complete and accurate

---

## Maintenance and Updates

To maintain and update the application:

1. **Regular updates**: Run `npm update` and `pip install -U` monthly
2. **Security patches**: Monitor and apply security updates immediately
3. **Feature additions**: Follow the same phased approach
4. **Bug fixes**: Fix, test, document, deploy
5. **Documentation**: Keep docs in sync with code changes

---

## Appendix: Prompt Engineering Best Practices

These prompts follow industry best practices:

1. **Clear Objectives**: Each prompt has a specific, measurable goal
2. **Context**: Prompts provide necessary context and constraints
3. **Structured Output**: Deliverables are clearly defined
4. **Incremental**: Build in small, testable increments
5. **Technology Specific**: Tech stack is explicitly stated
6. **Testable**: Each component has clear success criteria
7. **Maintainable**: Code structure supports future changes
8. **Documented**: Documentation is built alongside code

### Prompt Structure Template

```
[Title: Clear, action-oriented]

[Context: What we're building and why]

Requirements:
1. [Specific requirement with details]
2. [Another requirement]
...

Tech Stack: [Technologies to use]
Deliverables: [What should be produced]

[Optional: Code examples, schemas, or references]
```

---

## Version History

- **v1.0.0** (2026-02-14): Initial prompt chain creation
  - Complete phased approach for rebuilding UnifiedAIToolbox
  - 5 main phases with 15+ detailed prompts
  - Industry-standard best practices applied
  - Comprehensive testing and deployment guidance

---

## Support and Feedback

For questions or improvements to this prompt chain:
- Open an issue on GitHub
- Submit a pull request with enhancements
- Contact the maintainers

---

**End of Prompt Chain Documentation**
