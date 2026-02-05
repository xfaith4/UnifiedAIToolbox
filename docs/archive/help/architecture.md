# Architecture Overview

## System Architecture

The Unified AI Toolbox is built on a modern, microservices-inspired architecture that separates concerns while maintaining tight integration between components.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
├─────────────────┬─────────────────┬───────────────────────────┤
│  Web Dashboard  │   Web Portal    │   Desktop App (WPF)       │
│  (React/Vite)   │   (Next.js)     │   (Windows)               │
└────────┬────────┴────────┬────────┴──────────┬────────────────┘
         │                 │                    │
         └─────────────────┼────────────────────┘
                           │
              ┌────────────▼────────────┐
              │     API Gateway         │
              │  (FastAPI/REST)         │
              └────────────┬────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼─────┐    ┌─────▼──────┐   ┌─────▼──────┐
    │  Prompt  │    │    AI      │   │   GitHub   │
    │ Service  │    │ Providers  │   │  Service   │
    └────┬─────┘    └─────┬──────┘   └─────┬──────┘
         │                │                 │
    ┌────▼─────┐    ┌─────▼──────┐   ┌─────▼──────┐
    │ SQLite   │    │  OpenAI    │   │  Git Ops   │
    │   FTS5   │    │ Anthropic  │   │   Codex    │
    └──────────┘    │   Azure    │   └────────────┘
                    └────────────┘
```

## Component Overview

### Frontend Applications

#### Web Dashboard (React/Vite)
- **Technology**: React 18, TypeScript, Vite, TailwindCSS
- **Port**: 5173 (default)
- **Purpose**: Primary web interface for prompt management and orchestration
- **Features**:
  - Prompt library with full-text search
  - Agent library management
  - GitHub integration UI
  - Orchestrator controls
  - Cost tracking dashboard
  - Settings management

#### Web Portal (Next.js)
- **Technology**: Next.js 16, React 19
- **Port**: 3000 (default)
- **Purpose**: Unified web portal with enhanced routing
- **Features**:
  - Server-side rendering
  - Optimized performance
  - SEO-friendly pages

#### Desktop Application (WPF)
- **Technology**: .NET 8, WPF, XAML
- **Platform**: Windows
- **Purpose**: Native Windows application for power users
- **Features**:
  - Repository path discovery
  - Environment validation
  - Orchestration pipeline execution
  - Real-time console log visualization
  - Instruction library integration
  - Settings persistence

### Backend Services

#### Prompt API (FastAPI)
- **Technology**: Python 3.12+, FastAPI, Uvicorn
- **Port**: 8000 (default)
- **Purpose**: REST API for all prompt and orchestration operations
- **Endpoints**:
  - `/prompts/*` - Prompt CRUD operations
  - `/agents/*` - Agent management
  - `/search` - Full-text search
  - `/orchestrator/*` - Workflow execution
  - `/github/*` - Repository operations
  - `/costs/*` - Usage tracking

#### PowerShell Modules
- **Module**: PromptLibrary
- **Purpose**: Core prompt management and orchestration logic
- **Functions**:
  - `Get-Prompt` - Load prompts from YAML
  - `New-RefinedPrompt` - AI-powered prompt refinement
  - `Invoke-Orchestrator` - Run orchestration workflows
  - `Update-PromptIndex` - SQLite indexing

### Data Layer

#### SQLite Databases
1. **prompts.db**
   - FTS5 full-text search index
   - Prompt metadata and content
   - Tag and category indexes

2. **auth.db**
   - User accounts and credentials
   - JWT refresh tokens
   - Role-based permissions

3. **audit.db**
   - Activity logs
   - Cost tracking
   - Usage analytics

#### File System
- **data/prompts/** - YAML prompt definitions
- **data/agents/** - Agent configurations
- **data/artifacts/** - Generated outputs
- **runs/** - Execution history

### AI Provider Integration

#### Provider Abstraction Layer
```python
class AIProvider:
    def generate(prompt, model, params)
    def stream(prompt, model, params)
    def count_tokens(text, model)
    def estimate_cost(tokens, model)
```

#### Supported Providers
- **OpenAI**: GPT-4, GPT-4o, GPT-3.5-turbo
- **Anthropic**: Claude 3.5, Claude 3 Opus/Sonnet/Haiku
- **Azure OpenAI**: Azure-hosted models

#### Features
- Automatic retry with exponential backoff
- Rate limiting per provider
- Token counting and cost tracking
- Streaming support
- Error handling and fallback

### Orchestration Engine

#### Workflow Pipeline
1. **Goal Resolution**: Parse and validate goals
2. **Context Building**: Gather repository context
3. **Prompt Generation**: Render templates with variables
4. **AI Invocation**: Call provider APIs
5. **Artifact Creation**: Save outputs
6. **Quality Assessment**: Commissioner scoring
7. **Iteration**: Repeat if needed

#### Codex Swarm
Multi-agent code review system with specialized agents:
- **Critic Agent**: Overall code quality assessment
- **Security Agent**: Vulnerability scanning
- **Lint Agent**: Code style enforcement
- **Test Agent**: Test coverage analysis
- **Refactor Agent**: Improvement suggestions

### Security Architecture

#### Authentication Flow
```
1. User login → POST /auth/login
2. Server validates credentials (bcrypt)
3. Server generates JWT access token (60 min) + refresh token (7 days)
4. Client stores tokens
5. Client includes access token in Authorization header
6. Server validates JWT on each request
7. Client refreshes tokens when expired
```

#### Authorization (RBAC)
- **Admin**: Full access to all resources
- **User**: Read/write access to own resources
- **ReadOnly**: Read-only access

#### Security Features
- Password hashing with bcrypt (cost 12)
- JWT with short-lived access tokens
- HTTPS/TLS encryption
- CORS configuration
- Input validation and sanitization
- SQL injection prevention
- CodeQL security scanning

## Data Flow

### Prompt Search Flow
```
User types search query
    ↓
Dashboard debounces input (300ms)
    ↓
API: GET /search?q=query
    ↓
SQLite FTS5 query
    ↓
Results with highlights
    ↓
Dashboard renders results (<100ms total)
```

### Orchestration Flow
```
User clicks "Run Orchestration"
    ↓
Desktop/Web → API: POST /orchestrator/run
    ↓
Load goal file and context
    ↓
Render prompt templates
    ↓
Call AI provider (OpenAI/Anthropic)
    ↓
Save artifacts to filesystem
    ↓
Index in SQLite
    ↓
Stream logs back to client (SSE)
    ↓
Display results
```

### GitHub Integration Flow
```
User enters repo URL
    ↓
API: POST /github/clone
    ↓
Git clone with progress tracking
    ↓
API: POST /github/codex/run
    ↓
Launch 5 parallel agent analyses
    ↓
Aggregate findings
    ↓
Stream logs to client
    ↓
Display findings grouped by agent
```

## Performance Characteristics

### Latency Targets
- **Dashboard Load**: <2s (on 3G connection)
- **API Response**: <500ms (P95)
- **Search Query**: <100ms
- **Prompt Indexing**: <1s per 100 prompts

### Scalability
- **Concurrent Users**: 50+ supported
- **Prompt Library**: 10,000+ prompts indexed
- **API Throughput**: 1000+ req/min
- **Database Size**: Efficient up to 1GB+

### Optimization Techniques
- **Frontend**: Code splitting, lazy loading, tree shaking
- **Backend**: Connection pooling, query optimization, caching
- **Database**: FTS5 indexes, WAL mode, prepared statements
- **Network**: Compression, HTTP/2, CDN for static assets

## Deployment Architecture

### Native Deployment
```
Host Machine
├── Node.js processes (Dashboard, Portal)
├── Python process (API)
├── SQLite databases
└── File system (prompts, artifacts)
```

### Docker Deployment
```
Docker Host
├── dashboard container (port 5173)
├── webapp container (port 3000)
├── api container (port 8000)
└── Volumes:
    ├── data/ (prompts, artifacts)
    ├── databases/ (SQLite files)
    └── logs/
```

### Production Deployment
```
Load Balancer (nginx)
    ↓
├── Frontend (static files via CDN)
├── API (multiple instances)
├── Database (SQLite with backups)
└── Storage (shared filesystem/S3)
```

## Technology Stack Summary

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18, TypeScript, Vite | Modern web UI |
| **Desktop** | .NET 8, WPF, XAML | Native Windows app |
| **API** | Python 3.12, FastAPI | REST API backend |
| **Scripting** | PowerShell 7.4+ | Orchestration logic |
| **Database** | SQLite with FTS5 | Data storage + search |
| **Search** | FTS5 full-text search | Fast prompt search |
| **AI** | OpenAI, Anthropic SDKs | AI provider integration |
| **Testing** | Vitest, pytest, Pester | Automated testing |
| **CI/CD** | GitHub Actions | Automation pipeline |

## Design Principles

1. **Separation of Concerns**: Each component has a clear, single responsibility
2. **API-First**: All functionality exposed via REST API
3. **Data-Driven**: YAML/JSON for configuration, SQLite for data
4. **Cross-Platform**: Works on Windows, Linux, macOS (except WPF app)
5. **Developer-Friendly**: Easy to extend, well-documented
6. **Enterprise-Ready**: Security, authentication, audit logging
7. **Performance-Focused**: Fast load times, efficient queries
8. **Observable**: Comprehensive logging and monitoring

## Extension Points

### Adding a New AI Provider
1. Implement `AIProvider` interface
2. Add provider configuration
3. Update provider factory
4. Add tests

### Adding a New Frontend Page
1. Create React component in `apps/dashboard/src/pages/`
2. Add route in `App.tsx`
3. Add navigation link in `Layout.tsx`
4. Implement API calls using service layer

### Adding a New Orchestration Agent
1. Create agent YAML in `data/agents/`
2. Define agent prompt template
3. Update orchestration script
4. Add agent to Codex swarm configuration

## Future Architecture Enhancements

### Phase 3 Roadmap
- **Multi-tenancy**: Isolated data per organization
- **Distributed caching**: Redis for session/query cache
- **Message queue**: RabbitMQ for async workflows
- **Kubernetes**: Container orchestration
- **Observability**: Prometheus + Grafana monitoring
- **Cloud storage**: S3/Azure Blob for artifacts
- **WebSocket**: Real-time collaboration features
