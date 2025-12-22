# Unified AI Toolbox

> **Enterprise-grade AI orchestration platform** for managing prompts, agents, and AI workflows across multiple providers.

[![Version](https://img.shields.io/badge/version-1.5-blue.svg)](https://github.com/xfaith4/UnifiedAIToolbox)
[![Status](https://img.shields.io/badge/status-production-green.svg)](https://github.com/xfaith4/UnifiedAIToolbox)

## 🌟 Overview

The Unified AI Toolbox is a comprehensive platform that unifies prompt management, agent orchestration, and AI provider integration into a single, powerful toolkit. Whether you're building AI workflows, managing prompt libraries, or orchestrating complex multi-agent systems, this toolbox provides the infrastructure you need.

## ✨ Key Features

### 🎯 Prompt Management

- **Searchable Library**: Fast SQLite-backed full-text search across thousands of prompts
- **YAML-based Storage**: Simple, version-controllable prompt definitions
- **Template Rendering**: Dynamic prompt generation with variable substitution
- **Prompt Refinement**: Iterative AI-powered prompt optimization

### 🤖 AI Provider Integration

- **Multiple Providers**: OpenAI (GPT-4, GPT-3.5) today, with Anthropic (Claude 3.5) and Azure OpenAI rolling out in Phase 3
- **Provider Abstraction**: Unified interface for all providers
- **Cost Tracking**: Real-time token usage and cost monitoring
- **Rate Limiting**: Built-in protection against quota exhaustion

### 🔄 Orchestration & Automation

- **Multi-Agent System**: 6 baseline agents (Supervisor, Researcher, Engineer, Critic, Synthesizer, Commissioner)
- **Run Tracking & Analytics**: Comprehensive tracking of orchestration runs with cost analysis, resource monitoring, and environmental impact calculations
- **Quality & Outcome Tracking**: Track success rates, quality scores, and cost efficiency with human ratings and automated test integration
- **Cost Transparency**: Track API, compute, storage costs with human-equivalent comparisons
- **Environmental Metrics**: Monitor energy consumption (kWh) and water usage (L)
- **Cost-Quality Analysis**: Compute cost per successful run, cost per high-quality run, and quality-adjusted cost index
- **Learning Loop**: Run feedback storage and pattern extraction for continuous improvement
- **GitHub Integration**: Clone repos, run code analysis, create PRs automatically
- **Codex Swarm**: Multi-agent code review (security, linting, testing, refactoring)
- **Workflow Automation**: PowerShell-based orchestration pipeline
- **Real-time Monitoring**: Live log streaming and progress tracking

### 💻 Multiple Interfaces

- **Web Dashboard**: Modern React/Vite interface for browser-based access
- **Desktop App**: Native WPF application for Windows with rich UI
- **CLI Tools**: PowerShell modules for scripting and automation
- **REST API**: FastAPI backend for programmatic access

### 🔒 Enterprise-Ready

- **Authentication**: JWT-based auth with role-based access control
- **Security Scanning**: Integrated CodeQL for vulnerability detection
- **Audit Logging**: Comprehensive activity tracking
- **CI/CD Pipeline**: Comprehensive GitHub Actions workflows with automated testing, building, and artifact management
- **Webhook Integration**: GitHub webhook support for automated orchestration triggers
- **PR Review Dashboard**: Collaborative pull request review with CI status tracking
- **Scheduled Analysis**: Automated daily repository health checks and code quality metrics

### 🔔 Monitoring & Alerts

- **Telemetry System**: JSONL-based event tracking with pluggable sinks
- **Alert Rules**: Threshold-based, pattern-based, and custom alert conditions
- **Alert Monitoring**: Real-time alerting for failures, performance issues, and anomalies
- **Unified CLI**: Single entry point (`tools/utb.ps1`) for all toolbox operations
- **Template Versioning**: Semantic versioning and changelog support for CI/CD templates

### 🛣️ Coming in Phase 3 (v2.0)

- **Multi-Tenancy**: Tenant isolation with PostgreSQL + Row-Level Security and per-tenant quotas
- **Cloud-Native Runtime**: Kubernetes + Helm deployment with Prometheus/Grafana monitoring
- **Performance Layer**: Redis caching and pgvector-backed semantic search
- **Enterprise Readiness**: SSO/SAML, tenant-level audit logging, and webhook/notification integrations

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** - [Download](https://nodejs.org/)
- **Python 3.12+** - [Download](https://www.python.org/)
- **PowerShell 7.4+** - [Download](https://github.com/PowerShell/PowerShell/releases) *(for orchestration)*
- **.NET 8 SDK** - [Download](https://dotnet.microsoft.com/download) *(for desktop app)*

### Launch in 30 Seconds

**Windows (PowerShell):**

```powershell
.\Start-Toolbox.ps1   # Interactive menu to launch services
```

**Windows (Bash/WSL):**

```bash
./launch.sh   # Automated launch with verification
```

**WSL Prompt API (recommended for GitHub PR orchestration):**

```bash
./scripts/start-prompt-api.sh
```

> The WSL launcher bootstraps `GITHUB_TOKEN` from `gh auth token` without logging or persisting it.

**Linux/Mac:**

```bash
./launch.sh
```

**Docker:**

```bash
docker compose up -d
```

> Running `./launch.sh` sets `NEXT_PUBLIC_API_BASE`, forces the orchestrator script path to the Windows MilestoneController.ps1, and runs a post-launch verification script so you see whether the API, dashboard, portal, and orchestrator handshake are healthy.
>
> The new `Start-Toolbox.ps1` provides an interactive menu to launch individual services or the full stack.

### Access Your Services

- 🌐 **Web Portal**: <http://localhost:3001>

**📖 Need more details?** See the [Launch Guide](docs/help/launch-guide.md) for comprehensive setup instructions.

### 🔧 Orchestration Configuration (Frontend ↔ Backend)

The Unified AI Toolbox features seamless integration between the Next.js web portal and the Prompt API backend for orchestration. This connection is now **pre-configured** and requires no manual setup for local development.

**What's Configured:**

- ✅ `.env.local` in `apps/unifiedtoolbox.webapp` with `NEXT_PUBLIC_API_BASE=http://localhost:8000`
- ✅ Docker Compose sets `NEXT_PUBLIC_API_BASE=http://prompt-api:8000` for container networking
- ✅ API health checks and connection validation built into the UI
- ✅ Automatic fallback to simulation mode if backend is unavailable

**Verify Configuration:**

```bash
python3 test-orchestration-config.py
```

This script validates that all environment variables and configuration files are properly set up.

**Troubleshooting:**

If the orchestrator page shows a red "Cannot connect to Prompt API" banner:

1. Verify the backend is running: `curl http://localhost:8000/health`
2. Check `.env.local` in `apps/unifiedtoolbox.webapp` contains `NEXT_PUBLIC_API_BASE=http://localhost:8000`
3. Restart the Next.js dev server after changing `.env.local`

For more details, see [apps/unifiedtoolbox.webapp/README.md](apps/unifiedtoolbox.webapp/README.md).

## 🧭 Orchestration Workflow

Use a simple intake → plan → execute loop for repository automation:

1. **Intake**: Capture the goal (issue, ticket, or `Goals/CurrentGoal.txt`).
2. **Plan**: Define the smallest viable steps and pick a runner (for example `scripts/Unified-Orchestration.ps1`).
3. **Execute**: Run the orchestration and review outputs before packaging results.

Artifacts are kept local in directories like `runs/`, `apps/orchestration-bridge/runs/`, `.uaitoolbox/`, and `artifacts/`. These locations are ignored by git so orchestration outputs stay local.

## 📁 Project Structure

```
UnifiedAIToolbox/
├── apps/
│   ├── OrchestrationDesktop/             # WPF desktop application
│   ├── OrchestrationDesktopLauncher/     # Desktop launcher utility
│   ├── PromptRefiner/                    # Prompt refinement tools
│   ├── UnifiedPromptApp/                 # Prompt API service & utilities
│   ├── orchestration-bridge/             # Python bridge for external agents
│   └── unifiedtoolbox.webapp/            # Next.js web portal
├── modules/
│   └── PromptLibrary/          # PowerShell prompt management
├── data/
│   ├── prompts/                # YAML prompt definitions
│   ├── agents/                 # Agent configurations
│   └── artifacts/              # Generated outputs
├── docs/
│   └── help/                   # User documentation
└── scripts/                    # Orchestration scripts
```

## 📚 Documentation

### Getting Started

- **[Quick Start Guide](docs/help/quick-start.md)** - Get up and running in minutes
- **[Launch Guide](docs/help/launch-guide.md)** - Detailed deployment instructions
- **[Architecture Overview](docs/help/architecture.md)** - System design and components

### CI/CD & Automation

- **[Workflow Guide](docs/WORKFLOW_GUIDE.md)** - ✨ Complete guide to GitHub Actions workflows, artifacts, and local testing
- **[Telemetry & AI Insights](docs/TELEMETRY_AND_AI_INSIGHTS.md)** - 🆕 Usage metrics and AI-powered analysis summaries
- **[CI/CD Blueprint](templates/ci-cd-blueprint/README.md)** - 🆕 Reusable workflow templates for other repos
- **[Unified CLI Guide](docs/UNIFIED_CLI.md)** - 🆕 Single command-line interface for all toolbox operations
- **[Alerting System](docs/ALERTING_SYSTEM.md)** - 🆕 Configure and monitor alerts for telemetry events
- **[Webhook Setup](docs/WEBHOOK_SETUP.md)** - Configure GitHub webhooks for automated orchestration
- **[GitHub Integration](docs/GITHUB_INTEGRATION.md)** - Complete guide to GitHub authentication and repo operations

### Features & Capabilities

- **[Project Roadmap](docs/PROJECT_ROADMAP.md)** - Current status, next steps, and future plans
- **[Orchestration Run Tracking](docs/ORCHESTRATION_RUN_TRACKING.md)** - Comprehensive run tracking with cost & environmental analytics
- **[Quality & Outcome Tracking](docs/QUALITY_TRACKING.md)** - 🆕 Track success rates, quality scores, and cost efficiency
- **[Orchestrator Enhancements](docs/ORCHESTRATOR_ENHANCEMENTS.md)** - Agent library, feedback/learning, cost tracking
- **[Prompt Refiner Guide](docs/help/prompt-refiner.md)** - Prompt optimization workflows

### Reference

- **[API Reference](docs/help/api-reference.md)** - REST API documentation
- **[Deployment Guide](docs/help/deployment.md)** - Production deployment checklist

## 🛠️ Development

### Quick Launch (API + Portal)

```bash
./launch.sh                # runs the FastAPI backend and the Next.js portal
./launch.sh --no-open      # skip opening the browser after services start
./launch.sh --frontend-only  # launch only the web portal (Next.js)
```

> Requires Node.js 18+ and Python 3.12.1+ (checked automatically).

### Build the Project

**Unified Web Portal (Next.js):**

```bash
cd apps/unifiedtoolbox.webapp
npm install
npm run dev         # Development server
npm run build       # Production build
npm test            # Runs lint checks
```

**Desktop App:**

```bash
cd apps/OrchestrationDesktop
dotnet restore
dotnet build
dotnet run
```

**API Service:**

```bash
cd apps/UnifiedPromptApp/services/prompt-api
python -m pip install -r requirements.txt
python app.py
```

### Run Tests

```bash
# PowerShell module tests
pwsh tests/Schema.Tests.ps1

# Python API tests
cd apps/UnifiedPromptApp/services/prompt-api && pytest

# JavaScript/TypeScript tests
cd apps/unifiedtoolbox.webapp && npm test
```

## 🔄 CI/CD & Automation

### GitHub Actions Workflows

The project includes comprehensive CI/CD workflows:

**Continuous Integration (`ci-comprehensive.yml`):**

- Runs on every push and pull request
- Tests PowerShell, Python, TypeScript, and C# code
- Builds dashboard, web app, and desktop applications
- Uploads build artifacts (30-day retention)
- Runs smoke tests and generates CI summary

**Scheduled Repository Analysis (`repo-analysis-scheduled.yml`):**

- Runs daily at 6 AM UTC
- Analyzes repository health, code quality, and prompt library
- Generates JSON and HTML reports
- Uploads analysis artifacts (90-day retention)

### Webhook Integration

Set up GitHub webhooks to trigger automated orchestration:

```bash
# Configure webhook secret
export GITHUB_WEBHOOK_SECRET=your-secure-secret

# Webhook endpoint
POST https://your-api-domain.com/webhooks/github
```

Webhooks automatically trigger:

- Repository analysis on push
- Code review on PR open/update
- Security scans on new PRs

See [Webhook Setup Guide](docs/WEBHOOK_SETUP.md) for detailed configuration.

### Artifact Management

Build artifacts are automatically collected and organized:

```bash
# Collect artifacts locally
pwsh scripts/Collect-BuildArtifacts.ps1 -Clean -Manifest

# Run repository analysis
pwsh scripts/Run-RepoAnalysis.ps1 -AnalysisType full

# Generate HTML report
pwsh scripts/Convert-RepoAnalysisToHtml.ps1 -JsonPath artifacts/repo-analysis/report.json
```

Artifacts are stored in standardized directories:

- `artifacts/builds/` - Build outputs (dashboard, webapp, desktop)
- `artifacts/reports/` - Analysis and health reports
- `artifacts/logs/` - Build and runtime logs
- `artifacts/packages/` - Packaged artifacts (databases, etc.)

See [Workflow Guide](docs/WORKFLOW_GUIDE.md) for comprehensive documentation.

### PR Review Dashboard

Access the collaborative PR review dashboard at `/github` in the web dashboard:

- View all open/closed pull requests
- Check CI status for each PR
- Filter by state, label, or author
- Sort by recent updates or creation date
- View PR statistics and metrics

## 🔧 Configuration

Create a `.env` file in the root directory:

```env
# API Keys
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key

# Service Configuration
API_PORT=8000
FRONTEND_PORT=5173
WEB_PORT=3000

# Web portal / orchestrator endpoint
NEXT_PUBLIC_API_BASE=http://localhost:8000

# Database
PROMPT_API_DB_PATH=./services/prompt-api/workbench.db

# Authentication
JWT_SECRET_KEY=your-secret-key-here

# GitHub Integration (optional)
GITHUB_TOKEN=your-github-personal-access-token
GITHUB_WEBHOOK_SECRET=your-webhook-secret
```

The Next.js portal uses `NEXT_PUBLIC_API_BASE` (default `http://localhost:8000`) to reach the prompt API so orchestrations run against the backend instead of the simulation fallback.

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built with modern tools and frameworks:

- React, Vite, TypeScript
- FastAPI, Python
- PowerShell Core
- .NET 8, WPF
- SQLite, Docker

## 📞 Support

- **Documentation**: Browse the [help docs](docs/help/)
- **Issues**: [GitHub Issues](https://github.com/xfaith4/UnifiedAIToolbox/issues)
- **Discussions**: [GitHub Discussions](https://github.com/xfaith4/UnifiedAIToolbox/discussions)

---

**Ready to transform your AI workflows?** Get started with our [Quick Start Guide](docs/help/quick-start.md) today! 🚀
