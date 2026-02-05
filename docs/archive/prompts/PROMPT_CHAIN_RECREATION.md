# Unified AI Toolbox - Prompt Chain Recreation Guide

**Version:** 1.0  
**Created:** January 2026  
**Author:** Professional Prompt Engineer  
**Purpose:** Progressive prompt chain to recreate the UnifiedAIToolbox from scratch

---

## 📋 Overview

This document provides a comprehensive series of AI prompts designed to recreate the Unified AI Toolbox through progressive prompt chaining. Each prompt builds upon the previous ones, creating a fully functional AI orchestration platform.

### What This Recreates

The Unified AI Toolbox is an enterprise-grade AI orchestration platform featuring:
- **Prompt Management System** with YAML-based storage and SQLite full-text search
- **Multi-Agent Orchestration** with 6+ specialized AI agents
- **Multi-Provider AI Integration** (OpenAI, Anthropic, Azure)
- **Web Portal** (Next.js/React) and **Desktop App** (WPF/.NET)
- **REST API** (FastAPI/Python) with comprehensive endpoints
- **Cost Tracking & Analytics** with environmental impact metrics
- **CI/CD Infrastructure** with GitHub Actions workflows
- **GitHub Integration** for automated repo operations
- **Telemetry & Alerting** systems

---

## 🎯 User Customization Variables

The following variables are left for users to customize based on their preferences:

### 🎨 Visual & Design Preferences
- **Color scheme**: Primary colors, accent colors, dark/light mode preferences
- **UI framework**: Keep Next.js/React or substitute with Vue, Angular, Svelte, etc.
- **Design system**: TailwindCSS, Material-UI, Ant Design, Chakra UI, or custom CSS
- **Typography**: Font families, sizes, spacing preferences
- **Layout style**: Dashboard grid system, navigation patterns

### 🤖 AI Model Configuration
- **Primary AI Provider**: OpenAI, Anthropic, Azure OpenAI, or others
- **Model Selection**: GPT-4o, GPT-4-turbo, Claude 3.5 Sonnet, etc.
- **Model Routing**: Which models for which agent types
- **Cost Preferences**: Balance between cost and quality
- **Rate Limits**: Tokens per minute, requests per minute

### 🛠️ Technology Stack Choices
- **Backend Language**: Keep Python/FastAPI or use Node.js, Go, Rust, etc.
- **Database**: Keep SQLite or use PostgreSQL, MongoDB, MySQL, etc.
- **Frontend Framework**: Next.js, Nuxt, SvelteKit, etc.
- **Desktop Platform**: Keep WPF/.NET or use Electron, Tauri, etc.
- **Deployment**: Docker, Kubernetes, serverless, bare metal

### 🔧 Feature Preferences
- **Authentication method**: JWT, OAuth, SAML, or others
- **Monitoring tools**: Keep custom or integrate Datadog, New Relic, etc.
- **Logging format**: JSONL, structured logs, or traditional logs
- **CI/CD platform**: GitHub Actions, GitLab CI, CircleCI, Jenkins

---

## 📚 Prompt Chain Structure

The prompt chain is organized into 10 progressive phases, each building upon the previous:

1. **Foundation & Setup** - Project structure and environment
2. **Core Infrastructure** - Database, authentication, basic API
3. **Prompt Management** - YAML storage, search, template rendering
4. **Agent System** - Agent definitions, contracts, routing
5. **Orchestration Engine** - Multi-agent workflows and task execution
6. **AI Provider Integration** - OpenAI, Anthropic, Azure connections
7. **Web Interfaces** - Dashboard and web portal
8. **Desktop Application** - Windows WPF application
9. **CI/CD & Automation** - GitHub Actions, webhooks, monitoring
10. **Advanced Features** - Analytics, learning loops, production polish

---

## 🚀 Phase 1: Foundation & Setup

### Prompt 1.1: Initialize Project Structure

```
You are an expert software architect designing a new AI orchestration platform called "Unified AI Toolbox". 

GOAL: Create the complete project directory structure and foundational configuration files.

REQUIREMENTS:
1. Create a multi-application monorepo structure with the following components:
   - Backend API service (Python/FastAPI)
   - Web portal (Next.js/TypeScript)
   - Desktop application (.NET/WPF for Windows)
   - Orchestration bridge (Python)
   - Shared modules (PowerShell for automation)

2. Directory structure should include:
   - /apps/ - All applications
   - /modules/ - PowerShell and shared code modules
   - /data/ - Data storage (prompts, agents, configs)
   - /docs/ - Documentation
   - /scripts/ - Automation and utility scripts
   - /tests/ - Test suites
   - /.github/workflows/ - CI/CD workflows

3. Create configuration files:
   - .gitignore (Python, Node.js, .NET, PowerShell artifacts)
   - .env.example (API keys, service ports, configuration)
   - docker-compose.yml (multi-service orchestration)
   - README.md (project overview, quick start)

4. Setup files for each application:
   - Python: requirements.txt, pyproject.toml
   - Node.js: package.json, tsconfig.json
   - .NET: .sln, .csproj files
   - PowerShell: module manifests (.psd1)

USER CUSTOMIZATION POINTS:
- ${PROJECT_NAME}: Default "UnifiedAIToolbox"
- ${PRIMARY_LANGUAGE_BACKEND}: Default "Python" (alternatives: Node.js, Go, Rust)
- ${PRIMARY_LANGUAGE_FRONTEND}: Default "TypeScript/React" (alternatives: Vue, Svelte)
- ${PACKAGE_MANAGER}: Default "npm" (alternatives: yarn, pnpm)

OUTPUT: Generate all directory structures, configuration files, and setup documentation.
```

### Prompt 1.2: Environment Configuration

```
You are a DevOps engineer setting up the development environment for the Unified AI Toolbox.

GOAL: Create comprehensive environment configuration with secure credential management.

REQUIREMENTS:
1. Create .env.example with all configuration variables:
   - API keys (OpenAI, Anthropic, Azure, GitHub)
   - Service ports (API, web, database)
   - Database paths and connection strings
   - Feature flags
   - Logging levels
   - CORS and security settings

2. Document environment variable categories:
   - Required vs Optional
   - Development vs Production
   - Security-sensitive variables

3. Create configuration loader utilities:
   - Python: Use pydantic-settings for type-safe config
   - Node.js: Use dotenv with validation
   - PowerShell: Secure credential storage

4. Setup local development secrets management:
   - Git-ignored .env file
   - Secret scanning rules
   - Credential rotation guidelines

USER CUSTOMIZATION POINTS:
- ${OPENAI_API_KEY}: User's OpenAI key
- ${DEFAULT_AI_MODEL}: User's preferred model (gpt-4o-mini, claude-3-sonnet, etc.)
- ${API_PORT}: Default 8000
- ${WEB_PORT}: Default 3000
- ${LOG_LEVEL}: Default "INFO"

OUTPUT: Complete .env.example, configuration loading code, and security documentation.
```

### Prompt 1.3: Launch Scripts

```
You are a system automation expert creating launch scripts for the Unified AI Toolbox.

GOAL: Create cross-platform launch scripts for starting services individually or together.

REQUIREMENTS:
1. Create launch scripts:
   - launch.sh (Linux/Mac/WSL) - Bash script with error handling
   - Launch.ps1 (Windows PowerShell) - Interactive menu system
   - Start-Toolbox.ps1 (Windows) - Service orchestration
   - docker-compose.yml and docker-compose.sh

2. Each script should:
   - Check prerequisites (Python, Node.js, .NET, Docker)
   - Validate environment configuration
   - Start services in correct order
   - Provide health checks
   - Show service URLs when ready
   - Handle graceful shutdown

3. Interactive menu (PowerShell) with options:
   - [1] Start API only
   - [2] Start Web Portal only
   - [3] Start Desktop App
   - [4] Start All Services
   - [5] Run Tests
   - [6] View Logs
   - [7] Stop All Services

4. Docker Compose configuration:
   - Multi-service setup
   - Volume mounts for data persistence
   - Network configuration
   - Health checks

USER CUSTOMIZATION POINTS:
- ${SHELL_PREFERENCE}: bash/zsh/fish
- ${STARTUP_MODE}: "interactive" or "automated"
- ${DEFAULT_SERVICES}: Which services to start by default

OUTPUT: Complete launch scripts with error handling and user documentation.
```

---

## 🗄️ Phase 2: Core Infrastructure

### Prompt 2.1: Database Schema & Migrations

```
You are a database architect designing the data layer for an AI orchestration platform.

GOAL: Create a comprehensive SQLite database schema with migration system.

REQUIREMENTS:
1. Design database schema with tables:
   - prompts: Store prompt templates (id, name, content, metadata, tags, version)
   - prompt_history: Track prompt changes over time
   - orchestrator_runs: Track orchestration executions
   - run_feedback: Quality assessments from Supervisor agent
   - learning_patterns: Extracted insights from successful runs
   - cost_tracking: Token usage and cost metrics
   - audit_trail: Security and compliance logging
   - users: User accounts (if authentication enabled)
   - api_keys: API key management

2. Enable SQLite extensions:
   - FTS5 (Full-Text Search) for prompt searching
   - JSON1 for JSON column support
   - Create indexes for performance

3. Create migration system:
   - Sequential migration files (001_initial.sql, 002_add_feedback.sql)
   - Python migration runner with version tracking
   - Rollback capabilities
   - Migration validation

4. Data integrity:
   - Foreign key constraints
   - Check constraints
   - Default values
   - Created/updated timestamps

USER CUSTOMIZATION POINTS:
- ${DATABASE_ENGINE}: Default "SQLite" (alternatives: PostgreSQL, MySQL, MongoDB)
- ${FTS_ENABLED}: Default true (full-text search)
- ${AUDIT_RETENTION_DAYS}: Default 90

OUTPUT: Complete schema SQL, migration system code, and database utilities.
```

### Prompt 2.2: FastAPI Application Foundation

```
You are a senior Python backend engineer creating the FastAPI application core.

GOAL: Build the FastAPI application structure with essential middleware and utilities.

REQUIREMENTS:
1. Create FastAPI application (app.py):
   - Application factory pattern
   - CORS middleware configuration
   - Request/response logging
   - Error handlers (404, 500, validation errors)
   - Health check endpoint
   - API versioning structure

2. Database connection management:
   - SQLite connection pooling
   - Context managers for transactions
   - Query utilities and helpers
   - Safe JSON loading with error handling

3. Pydantic models:
   - Request/response schemas
   - Validation rules
   - Type safety
   - API documentation

4. Utilities:
   - Logging configuration (structured logs)
   - Cache decorator for read operations
   - Rate limiting (if needed)
   - CORS origins configuration

5. API structure:
   - /health - Health check
   - /api/v1/prompts/* - Prompt management
   - /api/v1/orchestrate/* - Orchestration
   - /api/v1/analytics/* - Analytics
   - /docs - Swagger/OpenAPI docs

USER CUSTOMIZATION POINTS:
- ${CORS_ORIGINS}: Allowed origins for CORS
- ${LOG_FORMAT}: "json" or "text"
- ${RATE_LIMIT}: Requests per minute
- ${CACHE_TTL}: Cache time-to-live in seconds

OUTPUT: Complete FastAPI application skeleton with middleware and utilities.
```

### Prompt 2.3: Authentication & Authorization

```
You are a security engineer implementing authentication for the Unified AI Toolbox.

GOAL: Create a secure authentication system with JWT tokens and optional OAuth.

REQUIREMENTS:
1. JWT token authentication:
   - Token generation and validation
   - Refresh token mechanism
   - Token expiration handling
   - Secure secret key management

2. OAuth integration (optional):
   - GitHub OAuth flow
   - User profile retrieval
   - Token exchange
   - State parameter for CSRF protection

3. Authorization:
   - Role-based access control (RBAC)
   - Permission system (read, write, admin)
   - Protected route decorators
   - API key management

4. Security features:
   - Password hashing (bcrypt/argon2)
   - Rate limiting for auth endpoints
   - Brute force protection
   - Audit logging for auth events

5. Endpoints:
   - POST /auth/register
   - POST /auth/login
   - POST /auth/refresh
   - POST /auth/logout
   - GET /auth/me
   - GET /auth/github (OAuth)

USER CUSTOMIZATION POINTS:
- ${AUTH_ENABLED}: Default false (optional feature)
- ${AUTH_METHOD}: "jwt", "oauth", or "both"
- ${OAUTH_PROVIDER}: "github", "google", "azure"
- ${TOKEN_EXPIRY_HOURS}: Default 24

OUTPUT: Complete authentication system with secure credential handling.
```

---

## 📝 Phase 3: Prompt Management System

### Prompt 3.1: YAML Prompt Schema & Storage

```
You are a data engineer designing a flexible prompt storage system.

GOAL: Create a YAML-based prompt storage system with full-text search capabilities.

REQUIREMENTS:
1. YAML schema for prompts with fields: id, name, description, version, tags, metadata, variables, prompt text, examples, and checksum (SHA256)
2. YAML file management: Load all prompts from /data/prompts/, validate schema, calculate checksums
3. SQLite FTS5 integration: Index prompt content for full-text search, tag filtering, version tracking
4. Prompt operations: Search by keywords, filter by tags/category, get by ID, list all, version comparison

USER CUSTOMIZATION POINTS:
- ${PROMPT_STORAGE_DIR}: Default "/data/prompts/"
- ${ENABLE_CHECKSUM}: Default true
- ${MAX_PROMPT_SIZE}: Default 50KB

OUTPUT: YAML schema, loader utilities, and database integration code.
```

### Prompt 3.2: Prompt Template Engine

```
You are a template engine developer creating a variable substitution system.

GOAL: Build a template rendering engine with variable substitution and validation.

REQUIREMENTS:
1. Variable substitution: Support ${variable} and {{variable}} syntax, nested variables, default values, conditional blocks
2. Template rendering: Parse prompt template, validate required variables, substitute with values, handle missing variables
3. Variable validation: Type checking, required vs optional, pattern matching (regex), value constraints
4. API endpoints: GET /prompts/search, GET /prompts/{id}, POST /prompts/{id}/render, GET /prompts (list)

USER CUSTOMIZATION POINTS:
- ${TEMPLATE_SYNTAX}: "${}" or "{{}}" or "both"
- ${STRICT_VALIDATION}: Default true

OUTPUT: Template engine code, validation utilities, and API endpoints.
```

### Prompt 3.3: Prompt Refinement Workflow

```
You are an AI prompt optimization expert building a prompt improvement system.

GOAL: Create a prompt refinement workflow that uses AI to improve prompts.

REQUIREMENTS:
1. Refinement workflow: User provides initial prompt, system analyzes quality, AI generates improved version, user reviews
2. Quality analysis: Clarity score, specificity score, completeness check, best practices validation
3. Improvement suggestions: Add missing context, improve specificity, enhance structure, add examples
4. PowerShell module: Invoke-PromptRefinement, Get-PromptHistory, Search-Prompts cmdlets

USER CUSTOMIZATION POINTS:
- ${REFINEMENT_MODEL}: AI model for refinement
- ${AUTO_REFINE}: Automatically refine on save

OUTPUT: Refinement workflow code, API endpoints, and PowerShell module.
```

---

## 🤖 Phase 4: Agent System

### Prompt 4.1: Agent Schema & Definitions

```
You are an AI agent architect designing a multi-agent system.

GOAL: Create comprehensive agent definitions with clear roles, capabilities, and contracts.

REQUIREMENTS:
1. Agent YAML schema with: id, name, role, capabilities, style, constraints, io_contract (JSON Schema), prompt, routing_hints, checksum
2. Create baseline agents:
   - Supervisor: Quality assessment, feedback, learning
   - Researcher: Analysis, data gathering, recommendations
   - Engineer: Code generation, implementation, testing
   - Critic: Code review, security, quality assurance
   - Synthesizer: Documentation, integration, summary
   - Commissioner: Business value, ROI, planning
3. Agent selection logic: Match task to agent capabilities, consider cost constraints, handle multi-agent collaboration

USER CUSTOMIZATION POINTS:
- ${AGENT_COUNT}: Number of agents to include
- ${CUSTOM_AGENTS}: User-defined additional agents
- ${DEFAULT_AGENT_MODEL}: Default model for agents

OUTPUT: Complete agent definitions (YAML), agent loader, selection logic.
```

### Prompt 4.2: Agent Communication Protocol

```
You are a distributed systems engineer designing inter-agent communication.

GOAL: Create a robust communication protocol for agent-to-agent interaction.

REQUIREMENTS:
1. Message format: JSON with id, from, to, type (request/response/notification), timestamp, payload, context
2. Message passing: Synchronous requests, asynchronous notifications, message queue, timeout handling, retry logic
3. Context passing: Maintain conversation context, pass relevant data between agents, context pruning for token limits
4. Error handling: Agent unavailable, invalid input, timeout, partial failures
5. Monitoring: Track message flow, measure latency, log communications, debug mode

USER CUSTOMIZATION POINTS:
- ${MESSAGE_TIMEOUT_SEC}: Default 30 seconds
- ${MAX_RETRIES}: Default 3
- ${ENABLE_MESSAGE_LOG}: Default true

OUTPUT: Communication protocol code, message handlers, and monitoring.
```

### Prompt 4.3: Agent Routing & Selection

```
You are a task routing specialist building intelligent agent selection.

GOAL: Create a routing system that matches tasks to the best-fit agent(s).

REQUIREMENTS:
1. Task analysis: Parse task description, extract required capabilities, identify task type, estimate complexity
2. Agent matching: Match task capabilities to agent capabilities, consider agent load, prefer cost-effective agents
3. Routing strategies: Single agent (simple), Sequential (pipeline), Parallel (independent sub-tasks), Hierarchical (supervisor coordinates)
4. Dynamic routing: Learn from past successes, adjust based on feedback, handle failures, load balancing

USER CUSTOMIZATION POINTS:
- ${ROUTING_STRATEGY}: "simple", "ml-based", "rule-based"
- ${PREFER_COST_SAVINGS}: Boolean, prefer cheaper models

OUTPUT: Routing logic, agent selection algorithms, and orchestration endpoints.
```

---

## 🎭 Phase 5: Orchestration Engine

### Prompt 5.1: Task Execution Pipeline

```
You are a workflow orchestration expert building a task execution engine.

GOAL: Create a robust pipeline for executing multi-agent tasks with error handling.

REQUIREMENTS:
1. Execution pipeline stages: Intake (parse task), Planning (select agents), Execution (run agents), Review (quality check), Feedback (metrics)
2. Run tracking: Unique run_id, track status, store inputs/outputs/intermediates, log interactions, calculate costs
3. Error handling: Agent failures (retry/failover), partial success, timeout handling, error recovery
4. Quality gates: Validate outputs against schema, check completeness, security scanning, user approval checkpoints
5. Database schema for orchestrator_runs table with run_id, task, status, timestamps, tokens, cost, success_rate, agents_used, outputs

USER CUSTOMIZATION POINTS:
- ${TIMEOUT_MINUTES}: Default 30
- ${ENABLE_QUALITY_GATES}: Default true
- ${AUTO_RETRY_ON_FAILURE}: Default true

OUTPUT: Execution pipeline code, run tracking, and error handling.
```

### Prompt 5.2: Cost Tracking & Analytics

```
You are a financial analyst building cost tracking for AI operations.

GOAL: Create comprehensive cost tracking with analytics and optimization.

REQUIREMENTS:
1. Cost calculation: Track tokens per request, calculate cost per model, aggregate by run/agent/time, include compute costs
2. Metrics: Total tokens, cost in USD, cost per agent, cost per task type, average cost per run, cost trends
3. Environmental impact: Estimate kWh per token, water usage, CO2 emissions, carbon footprint
4. Cost optimization: Identify expensive operations, suggest cheaper alternatives, batching recommendations
5. Analytics endpoints: GET /analytics/costs/* and /analytics/environmental-impact

USER CUSTOMIZATION POINTS:
- ${COST_ALERT_THRESHOLD_USD}: Alert when exceeded
- ${TRACK_ENVIRONMENTAL}: Default true
- ${COST_OPTIMIZATION_MODE}: "balanced", "cheap", "quality"

OUTPUT: Cost tracking code, analytics endpoints, and visualization data.
```

### Prompt 5.3: Learning & Feedback Loop

```
You are a machine learning engineer building a feedback and learning system.

GOAL: Create a learning loop that improves orchestration over time.

REQUIREMENTS:
1. Feedback collection: Supervisor quality scores, user feedback, success/failure outcomes, performance metrics
2. Pattern extraction: Identify successful agent combinations, extract reusable techniques, detect pitfalls
3. Learning storage: learning_patterns table with pattern_id, type, description, occurrences, avg_quality_score, examples
4. Application: Suggest improvements, auto-adjust agent selection, warn about pitfalls, recommend optimizations
5. Feedback endpoints: POST/GET /orchestrate/run/{run_id}/feedback, GET /orchestrate/learning/patterns

USER CUSTOMIZATION POINTS:
- ${ENABLE_AUTO_LEARNING}: Default true
- ${MIN_PATTERN_OCCURRENCES}: Default 3
- ${FEEDBACK_REQUIRED}: Default false

OUTPUT: Feedback system, pattern extraction, and learning application code.
```

---

## 🔌 Phase 6: AI Provider Integration

### Prompt 6.1: OpenAI Integration

```
You are an AI integration specialist connecting to OpenAI's API.

GOAL: Create a robust OpenAI integration with error handling and rate limiting.

REQUIREMENTS:
1. OpenAI client setup: Initialize with API key, configure timeout/retry, handle rate limits, support multiple models (GPT-4, GPT-4o, GPT-3.5)
2. API operations: Chat completions (with streaming), token counting (tiktoken), cost calculation, response validation
3. Features: Streaming for long outputs, function calling for structured outputs, context management, exponential backoff retry
4. Prompt execution: Render template, add system/user messages, call API, parse response, log token usage/cost
5. Provider abstraction: Common interface for all providers, easy switching, fallback to alternatives

USER CUSTOMIZATION POINTS:
- ${OPENAI_API_KEY}: User's API key
- ${OPENAI_MODEL}: Default "gpt-4o-mini"
- ${OPENAI_MAX_TOKENS}: Default 4000
- ${ENABLE_STREAMING}: Default false

OUTPUT: OpenAI integration code, provider interface, and error handling.
```

### Prompt 6.2: Multi-Provider Support (Anthropic & Azure)

```
You are an AI integration specialist creating multi-provider support.

GOAL: Create integrations for Anthropic Claude and Azure OpenAI following a unified provider interface.

REQUIREMENTS:
1. Anthropic integration: Initialize client, support Claude 3.5 models, handle Anthropic-specific format, token counting, streaming
2. Azure OpenAI integration: Azure endpoint and API key, deployment names, managed identity support, region failover
3. Unified provider interface:
   - chat(prompt, model, params) -> Response
   - stream_chat(...) -> Iterator[str]
   - count_tokens(text) -> int
   - get_cost(tokens, model) -> float
4. Provider registry: Register providers, select by name, automatic failover, load balancing
5. Provider selection strategies: By cost (cheapest), by quality (best model), by availability (fallback), by capability

USER CUSTOMIZATION POINTS:
- ${ANTHROPIC_API_KEY}: User's Anthropic key
- ${AZURE_OPENAI_ENDPOINT}: Azure endpoint
- ${PRIMARY_PROVIDER}: Default provider
- ${FALLBACK_PROVIDER}: Backup provider
- ${PROVIDER_SELECTION_STRATEGY}: "cost", "quality", "balanced"

OUTPUT: Unified provider interface, multiple provider implementations, and selection logic.
```

---

## 🌐 Phase 7: Web Interfaces

### Prompt 7.1: Next.js Web Portal Foundation

```
You are a full-stack web developer creating a Next.js web portal.

GOAL: Build the Next.js application foundation with routing, API integration, and state management.

REQUIREMENTS:
1. Next.js 14+ setup: App router structure, TypeScript, environment variables, API route handlers
2. Project structure: app/ (pages), components/ (UI components), lib/ (API client, utils)
3. API client: Fetch wrapper with error handling, auth token management, request/response interceptors, type-safe calls
4. State management: React Context or Zustand/Redux, SWR/React Query for data fetching, local storage for preferences
5. Routing: / (home), /prompts (library), /prompts/[id] (details), /orchestrate (new run), /runs (history), /runs/[id] (details), /analytics (dashboard)

USER CUSTOMIZATION POINTS:
- ${WEB_FRAMEWORK}: Default "Next.js" (alternatives: Nuxt, SvelteKit)
- ${STATE_MANAGEMENT}: "context", "zustand", "redux"
- ${STYLING}: "tailwindcss", "styled-components", "emotion"

OUTPUT: Next.js project structure, API client, routing, and state management.
```

### Prompt 7.2: UI Component Library & Interfaces

```
You are a UI/UX designer creating a comprehensive component library and interfaces.

GOAL: Build reusable React components and complete user interfaces for prompt management and orchestration.

REQUIREMENTS:
1. Design system: Color palette, typography scale, spacing system, border radius, shadows, responsive breakpoints
2. Core components: Button, Input, Card, Table, Modal, Tabs, Badge, Loading (spinners, skeletons)
3. Complex components: CodeEditor (Monaco/CodeMirror), MarkdownRenderer, DataGrid, Chart, Timeline
4. Prompt library interface: Search bar, tag filtering, card/list view, pagination, prompt detail view with editor, test prompt modal
5. Orchestration interface: New orchestration form, run history list, run detail with agent outputs, real-time updates (WebSocket/SSE), analytics dashboard with charts
6. Styling: TailwindCSS or styled-components, dark mode support
7. Accessibility: ARIA labels, keyboard navigation, focus management, screen reader support

USER CUSTOMIZATION POINTS:
- ${PRIMARY_COLOR}: Default "#3B82F6" (blue)
- ${SECONDARY_COLOR}: Default "#10B981" (green)
- ${FONT_FAMILY}: Default "Inter, sans-serif"
- ${DARK_MODE}: Default true
- ${DEFAULT_VIEW}: "cards" or "list"
- ${ENABLE_REALTIME}: Default true

OUTPUT: Complete component library, prompt management UI, orchestration UI, and analytics dashboard.
```

---

## 🖥️ Phase 8: Desktop Application

### Prompt 8.1: WPF Desktop Application

```
You are a .NET desktop developer creating a WPF application for Windows.

GOAL: Build a Windows desktop application using WPF and .NET 8 with MVVM pattern.

REQUIREMENTS:
1. WPF project setup: .NET 8 WPF application, MVVM pattern, dependency injection, configuration (appsettings.json)
2. Project structure: Models/, ViewModels/, Views/, Services/, Resources/
3. Main window layout: Navigation menu (sidebar), content area, status bar with sections for prompt library, orchestration runner, settings
4. API integration: HttpClient for REST API calls, async/await patterns, error handling, response deserialization
5. MVVM infrastructure: Base ViewModel class, ICommand implementations (RelayCommand), INotifyPropertyChanged, data binding
6. UI views: Prompt library view (DataGrid, search, filters), orchestration view (task input, agent/model selection, progress), run history view, settings view
7. Styling: Modern flat design using ModernWPF or MaterialDesignInXAML, consistent color scheme, smooth animations, dark mode support

USER CUSTOMIZATION POINTS:
- ${DESKTOP_FRAMEWORK}: Default "WPF" (alternatives: WinUI 3, Avalonia, Electron)
- ${UI_LIBRARY}: Default "ModernWPF" (alternatives: MaterialDesignInXAML, MahApps.Metro)
- ${THEME}: "light", "dark", or "system"
- ${ACCENT_COLOR}: Default blue

OUTPUT: Complete WPF project with MVVM pattern, API integration, and polished UI.
```

---

## ⚙️ Phase 9: CI/CD & Automation

### Prompt 9.1: GitHub Actions Workflows

```
You are a DevOps engineer setting up CI/CD pipelines with GitHub Actions.

GOAL: Create comprehensive GitHub Actions workflows for testing, building, and deployment.

REQUIREMENTS:
1. CI workflow (.github/workflows/ci.yml): Trigger on push/PR, matrix testing (multiple OS, Python/Node versions), test stages (PowerShell, Python pytest, TypeScript Jest/Vitest, .NET build), code quality checks, upload test results/coverage
2. Build workflow: Build web portal (Next.js), build desktop app (.NET), build Docker images, create release artifacts, upload to GitHub Releases
3. Deployment workflow: Deploy API to cloud (AWS/Azure/GCP), deploy web portal (Vercel/Netlify), deploy Docker images, run database migrations
4. Scheduled workflows: Repository health analysis (daily), dependency updates (weekly), cleanup old artifacts (monthly)
5. Workflow features: Caching dependencies, parallel jobs, conditional execution, secrets management, status badges

USER CUSTOMIZATION POINTS:
- ${CI_OS_MATRIX}: Default ["ubuntu-latest", "windows-latest"]
- ${PYTHON_VERSIONS}: Default ["3.10", "3.11", "3.12"]
- ${NODE_VERSIONS}: Default ["18", "20"]
- ${DEPLOY_TARGET}: "aws", "azure", "gcp", "selfhosted"

OUTPUT: Complete GitHub Actions workflows with all CI/CD stages.
```

### Prompt 9.2: GitHub Webhook Integration & Monitoring

```
You are an integration engineer building GitHub webhook support and monitoring.

GOAL: Create webhook receiver and comprehensive telemetry/alerting systems.

REQUIREMENTS:
1. Webhook endpoint: POST /webhooks/github, HMAC SHA-256 signature verification, event type handling (push, pull_request, issues), async processing
2. Event handlers: Push (analyze changes), PR opened (code review orchestration), Issue opened (analyze/suggest solutions), Release created (generate notes)
3. Configuration: YAML config for event-to-orchestration mappings, webhook secret, IP whitelist, rate limiting
4. Structured logging: JSONL format, log levels, contextual information (request_id, user_id), log rotation/retention
5. Metrics collection: Request count/latency/errors, AI API calls/tokens/cost, orchestration runs/success rate, database query performance, system metrics (CPU, memory)
6. Alerting system: Alert rules (cost threshold, high error rate, long-running ops, service unavailable), alert channels (email, Slack/Teams webhook), monitoring dashboard

USER CUSTOMIZATION POINTS:
- ${ENABLE_WEBHOOKS}: Default false
- ${WEBHOOK_SECRET}: Generated secret
- ${LOG_LEVEL}: Default "INFO"
- ${ENABLE_TELEMETRY}: Default true
- ${ALERT_EMAIL}: User's email
- ${COST_ALERT_THRESHOLD}: USD amount

OUTPUT: Webhook receiver, event handlers, logging system, metrics collection, alerting, and monitoring dashboard.
```

---

## 🚀 Phase 10: Advanced Features & Polish

### Prompt 10.1: GitHub Repository Operations

```
You are a GitHub integration developer building repository automation features.

GOAL: Create comprehensive GitHub API integration for repository operations.

REQUIREMENTS:
1. GitHub API client: Authenticate with PAT or GitHub App, rate limit handling, pagination support
2. Repository operations: Clone repository, analyze code structure, search code files, read file contents, create branches, commit changes, create pull requests, add PR comments
3. Orchestration integration: "Analyze repository" task, "Code review PR" task, "Generate documentation" task, "Create feature" task (clone, code, commit, PR)
4. PowerShell module (GitHubRepoManager): Clone-GitHubRepo, Get-RepoStructure, New-GitHubPullRequest, Add-PRComment cmdlets
5. Endpoints: POST /github/analyze-repo, POST /github/review-pr, POST /github/create-pr

USER CUSTOMIZATION POINTS:
- ${GITHUB_TOKEN}: User's GitHub token
- ${DEFAULT_BRANCH}: Default "main"
- ${AUTO_PR_ON_COMPLETE}: Default false

OUTPUT: GitHub API client, repository operations, PowerShell module, and orchestration integration.
```

### Prompt 10.2: Advanced Analytics & Testing

```
You are a data analyst and QA engineer building analytics and comprehensive tests.

GOAL: Create advanced analytics features and complete test suites.

REQUIREMENTS:
1. Historical analysis: Cost trends over time, success rate by task type, agent performance comparison, model efficiency, quality score distributions
2. Predictive analytics: Estimate cost before running, predict task duration, suggest optimal agent combinations, identify cost-saving opportunities
3. Reporting: Daily/weekly/monthly reports, cost breakdown by project/team, ROI calculations, compliance reports
4. Visualizations: Line charts (trends), bar charts (comparisons), pie charts (distributions), heatmaps (patterns), Sankey diagrams (cost flow)
5. Unit tests: Python (pytest), TypeScript (Jest/Vitest), PowerShell (Pester), C# (xUnit) for all components
6. Integration tests: API endpoints, database operations, AI provider integrations (mocked), orchestration workflows
7. End-to-end tests: Playwright or Cypress for web UI, full orchestration runs, multi-user scenarios, performance tests
8. Continuous testing: Run tests in CI/CD, coverage reporting (>80% target), performance benchmarks

USER CUSTOMIZATION POINTS:
- ${ANALYTICS_RETENTION_DAYS}: Default 90
- ${ENABLE_PREDICTIONS}: Default true
- ${REPORT_SCHEDULE}: "daily", "weekly", "monthly"
- ${TEST_FRAMEWORK_JS}: "jest", "vitest", "mocha"
- ${E2E_FRAMEWORK}: "playwright", "cypress", "selenium"
- ${COVERAGE_THRESHOLD}: Default 80%

OUTPUT: Advanced analytics engine, visualizations, reporting, and complete test suites.
```

### Prompt 10.3: Documentation & Production Deployment

```
You are a technical writer and deployment specialist creating final documentation.

GOAL: Create comprehensive documentation and production deployment guides.

REQUIREMENTS:
1. User documentation: README.md (overview, quick start), getting started guide, user manual, API documentation (OpenAPI/Swagger), PowerShell cmdlet help, FAQ
2. Developer documentation: Architecture overview, component diagrams, database schema, API reference, contribution guide, development setup
3. Operational documentation: Deployment guide (Docker, cloud, bare metal), configuration reference, monitoring/alerting setup, backup/recovery, troubleshooting guide, security best practices
4. Deployment guides for multiple platforms:
   - Docker Compose: Simple deployment with docker-compose.yml
   - AWS: ECS, RDS, S3 setup
   - Azure: App Service, Cosmos DB setup
   - GCP: Cloud Run, Firestore setup
   - Self-hosted: Manual setup on Linux/Windows
5. Production checklist: Environment variables configured, database migrations run, API keys secured, monitoring enabled, backups configured, SSL certificates, performance tuning, security hardening

USER CUSTOMIZATION POINTS:
- ${DEPLOY_ENVIRONMENT}: "docker", "aws", "azure", "gcp", "selfhosted"
- ${DOMAIN_NAME}: User's domain
- ${SSL_PROVIDER}: "letsencrypt", "custom"

OUTPUT: Complete documentation suite, deployment guides for all platforms, and production checklist.
```

---

## 🎓 Using the Prompt Chain

### Execution Strategy

**Option 1: Sequential Execution**
Execute each prompt in order, building upon previous outputs:
1. Run Phase 1 prompts → Review outputs
2. Run Phase 2 prompts → Integrate with Phase 1
3. Continue through Phase 10

**Option 2: Parallel Execution**
Some phases can be developed in parallel:
- Phases 1-2 (Foundation) → Sequential
- Phases 3-6 (Core features) → Can be parallel
- Phases 7-8 (UIs) → Parallel with each other
- Phases 9-10 (Polish) → After core complete

**Option 3: Iterative Execution**
Execute prompts iteratively with refinement:
1. Run Phase 1 → Deploy → Test
2. Run Phase 2 → Deploy → Test
3. Continue with validated increments

### Customization Workflow

1. **Define Your Variables**: Before starting, decide on technology stack, AI models, UI/UX design, deployment target
2. **Customize Prompts**: Replace `${VARIABLE}` placeholders with your choices
3. **Execute with Context**: Provide previous phase outputs as context for subsequent phases
4. **Validate Incrementally**: Test each phase before moving to the next
5. **Iterate on Feedback**: Refine outputs based on testing and requirements

### Example Customization

```yaml
# My Custom Configuration
project_name: "MyAIOrchestrator"
primary_color: "#6366F1"  # Indigo
secondary_color: "#10B981"  # Green
backend: "Python"
frontend: "Next.js"
desktop: "Electron"  # Instead of WPF
database: "PostgreSQL"  # Instead of SQLite
ai_provider: "Anthropic"
default_model: "claude-3-sonnet"
deploy_target: "AWS"
theme: "dark"
```

---

## 📊 Expected Outcomes

### After Phase 1-2
- Project structure created
- Environment configured
- Database schema and API foundation ready

### After Phase 3-4
- Prompt management system functional
- Agent system defined
- Basic orchestration working

### After Phase 5-6
- AI providers integrated
- Multi-agent orchestration operational
- Cost tracking active

### After Phase 7-8
- Web portal accessible
- Desktop app functional
- Full user interface operational

### After Phase 9-10
- CI/CD pipelines running
- Monitoring and alerting active
- Production-ready deployment

---

## 🔍 Quality Checkpoints

At each phase, verify:

✅ **Code Quality**
- Clean, documented code
- Type safety (TypeScript, type hints)
- Error handling
- Security best practices

✅ **Functionality**
- Features work as specified
- Edge cases handled
- Performance acceptable
- User experience smooth

✅ **Testing**
- Unit tests written and passing
- Integration tests passing
- Manual testing completed

✅ **Documentation**
- Code commented
- API documented
- User guide updated
- Configuration explained

---

## 🎉 Success Criteria

The UnifiedAIToolbox recreation is complete when:

1. ✅ All 10 phases executed successfully
2. ✅ API server starts without errors
3. ✅ Web portal loads and functions
4. ✅ Desktop app launches (if included)
5. ✅ Prompts can be managed (CRUD operations)
6. ✅ Orchestration runs successfully
7. ✅ AI providers respond correctly
8. ✅ Cost tracking displays data
9. ✅ Tests pass (>80% coverage)
10. ✅ Documentation complete
11. ✅ Deployment successful
12. ✅ Monitoring operational

---

## 📚 Additional Resources

### Reference Documentation
- **Original Repository**: Study structure and implementation details
- **AI Provider Docs**: OpenAI, Anthropic, Azure OpenAI API references
- **Framework Docs**: FastAPI, Next.js, WPF documentation
- **Best Practices**: Software architecture, security, testing patterns

### Community & Support
- GitHub Discussions for Q&A
- Issues for bug reports
- Pull Requests for contributions
- Documentation updates

---

## 🏁 Conclusion

This prompt chain provides a comprehensive, step-by-step approach to recreating the Unified AI Toolbox. Each prompt is designed to be precise and actionable, building progressively toward a fully functional application.

**Key Principles**:
- **Progressive Building**: Each phase builds on previous work
- **Customizable**: Extensive user choice in technology and design
- **Production-Ready**: Includes testing, monitoring, CI/CD
- **Well-Documented**: Comprehensive documentation at every step

**Next Steps**:
1. Review the prompt chain structure
2. Define your customization variables
3. Begin with Phase 1, Prompt 1.1
4. Execute sequentially or in parallel as appropriate
5. Validate each phase before progressing
6. Celebrate when your UnifiedAIToolbox is operational!

---

**Version**: 1.0  
**Last Updated**: January 2026  
**Maintainer**: Professional Prompt Engineer  
**License**: MIT (matches original project)
