# Unified AI Toolbox

> **AI orchestration platform** for managing prompts, agents, and AI workflows with OpenAI.

[![Version](https://img.shields.io/badge/version-1.5-blue.svg)](https://github.com/xfaith4/UnifiedAIToolbox)

## 🌟 Overview

The Unified AI Toolbox is a platform that provides prompt management, agent orchestration, and OpenAI integration. It includes a web portal for managing AI workflows, a prompt library with YAML-based storage, and PowerShell-based orchestration scripts.

**✨ [View Animated Demo](demo-animated.html)** - Experience a visual journey through the toolbox's capabilities!

## Orchestration workflow

For Codex-driven changes, keep the loop short and local:

- **Intake**: restate the goal, identify required files/scripts, and call out missing inputs before execution.
- **Plan**: propose the smallest viable plan using existing scripts/templates.
- **Execute**: make targeted changes and keep artifacts local (store in `.uaitoolbox/` or `runs/`).

## ✨ Key Features

### 🎯 Prompt Management

- **YAML-based Prompt Library**: Extensive prompt collection stored as version-controllable YAML files
- **SQLite Database**: Fast full-text search and prompt metadata storage
- **Template Rendering**: Dynamic prompt generation with variable substitution
- **Prompt Refinement**: AI-powered prompt optimization workflow

### 🤖 AI Provider Integration

- **OpenAI Support**: GPT-4, GPT-4o, GPT-4o-mini, GPT-3.5-turbo
- **Cost Tracking**: Real-time token usage and cost monitoring with detailed analytics
- **Cost Metrics API**: Track API costs, compute costs, and cost-per-run analysis

### 🔄 Orchestration & Automation

<img width="1911" height="903" alt="Screenshot 2025-12-02 224242" src="https://github.com/user-attachments/assets/805d27a9-b2ec-428b-a6d9-afab27bc9698" />

- **Multi-Agent System**: Agent library with specialized agents including Supervisor, Researcher, Engineer, Critic, Synthesizer, Commissioner, and more
- **Run Tracking**: Track orchestration runs with cost analysis, quality metrics, and environmental impact
- **PowerShell Orchestration**: Automated workflows with `Start-Toolbox.ps1` and orchestration scripts
- **GitHub Integration**: Clone repos, analyze code, create PRs automatically via GitHub API
- **Real-time Monitoring**: Live log streaming and progress tracking

<img width="1904" height="896" alt="Screenshot 2025-12-02 224357" src="https://github.com/user-attachments/assets/9d40727f-c3fa-419e-886e-ba07c857dd3c" />

### 💻 Interfaces

- **Web Portal**: Next.js application for prompt management and orchestration
- **Desktop App**: WPF application for Windows
- **REST API**: FastAPI backend with OpenAPI documentation
- **PowerShell Modules**: CLI tools for automation and scripting

### 🔒 Security & CI/CD

- **Authentication**: JWT-based auth with GitHub OAuth support
- **GitHub Actions**: CI workflows for testing, building, and artifact management
- **Telemetry**: JSONL-based event tracking and monitoring
- **Webhook Support**: GitHub webhook integration for automated orchestration

### 📊 Orchestrator Decision Logging

The toolbox includes deterministic, machine-readable tracing for orchestration runs:

- **Run-level metadata**: Tracks goals, context, and completion criteria for each orchestration run
- **Step-level events**: JSONL logs capturing every agent call with inputs, outputs, and validation
- **Decision ledger**: Records architectural decisions with rationale, confidence, and alternatives
- **Conflict resolution**: Logs conflicts between artifacts and how they were resolved
- **Artifact manifests**: Catalogs generated files with checksums and detected technology stacks
- **Verification results**: Optional build, test, and lint verification with pass/fail status
- **Secret redaction**: Automatic removal of API keys, tokens, and passwords from logs

**Artifact Location**: All orchestration logs are stored in `./artifacts/runs/<run_id>/`:
- `run.json` - Run metadata and context
- `steps.jsonl` - Agent execution trace (one JSON object per line)
- `decisions.jsonl` - Decision history
- `conflicts.jsonl` - Conflict resolution log
- `artifacts.json` - Manifest of generated files
- `verification.json` - Build/test results (if verification was run)

See [Orchestrator Logging Guide](docs/ORCHESTRATOR_LOGGING.md) for details on interpreting logs.

## 🎬 Demo

**Experience AI orchestration** with our interactive demos:

### 🎯 Orchestration Simulation
**[Watch Live Simulation](demo-orchestration-sim.html)** - See a real orchestration run in action:
- Watch agents collaborate to build a Task Management API
- Step-by-step agent workflow with live progress
- Real-time cost and quality metrics
- Complete deliverables showcase

### 🌟 Animated Overview
**[View Animated Demo](demo-animated.html)** - Visual showcase of platform capabilities:
- High-level idea → AI Supervisor → Multi-agent orchestration
- Specialized AI agents working together
- Prompt refinement and quality assessment
- Enterprise-grade features

**Quick Launch:**
```bash
# Linux/Mac/WSL
./launch-demo.sh

# Windows PowerShell
.\Launch-Demo.ps1
```

**Note:** To view demos via GitHub Pages, enable GitHub Pages in repository settings (Settings → Pages → Source: main branch).

See [Demo Guide](docs/DEMO.md) for more details.

## 🚀 Quick Start

### Prerequisites

- **Python 3.12+** - [Download](https://www.python.org/)
- **Node.js 18+** - [Download](https://nodejs.org/)
- **PowerShell 7+** (for Windows orchestration) - [Download](https://github.com/PowerShell/PowerShell/releases)
- **.NET 8 SDK** (for desktop app) - [Download](https://dotnet.microsoft.com/download)
- **OpenAI API Key** - [Get yours](https://platform.openai.com/api-keys)

### Environment Setup

1. **Copy environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Add your OpenAI API key:**
   ```bash
   # Edit .env and add:
   OPENAI_API_KEY=sk-proj-your-key-here
   OPENAI_MODEL=gpt-4o-mini
   ```

### Launch Options

Choose the method that works for your environment:


**Option 1: Interactive Menu (Windows)**

```powershell
.\Start-Toolbox.ps1   # Interactive menu to launch services
```

**Option 2: Automated Launch (Linux/Mac/WSL)**

```bash
./launch.sh           # Starts API + Web Portal with verification
./launch.sh --docker  # Launch via Docker Compose
```

**Option 3: Docker Compose (All Platforms)**

```bash
docker compose up -d
```

### Access Your Services

After launching, access:

- 🌐 **Web Portal**: http://localhost:3000
- 🔧 **API Docs**: http://localhost:8000/docs
- 💊 **Health Check**: http://localhost:8000/health

**Need help?** See the [Launch Guide](docs/help/launch-guide.md) for detailed setup instructions.

### Configuration

The toolbox uses environment variables for configuration. Key settings:

```env
# API Keys
OPENAI_API_KEY=your-openai-key
OPENAI_MODEL=gpt-4o-mini

# Service Ports
API_PORT=8000                # FastAPI backend
WEB_PORT=3000                # Next.js web portal

# Web Portal Configuration
NEXT_PUBLIC_API_BASE=http://localhost:8000

# Database
PROMPT_API_DB_PATH=./apps/UnifiedPromptApp/services/prompt-api/workbench.db

# GitHub Integration (optional)
GITHUB_TOKEN=your-github-token
```

See `.env.example` for all available options.

## 🧭 Using the Toolbox

### Orchestration Workflow

Use a simple intake → plan → execute loop for repository automation:

1. **Intake**: Define the goal in `Goals/CurrentGoal.txt` or via issue/ticket
2. **Plan**: Define the smallest viable steps using orchestration scripts
3. **Execute**: Run orchestration and review outputs

Orchestration artifacts are kept local in:
- `runs/` - Orchestration run outputs
- `apps/orchestration-bridge/runs/` - Bridge execution logs
- `.uaitoolbox/` - Local toolbox state
- `artifacts/` - Build and analysis artifacts

These directories are git-ignored to keep outputs local.

### PowerShell Modules

The toolbox includes PowerShell modules for scripting:

```powershell
# Import prompt library module
Import-Module ./modules/PromptLibrary

# Search prompts
Search-Prompts -Query "refactoring"

# Render a prompt template
Invoke-PromptTemplate -TemplateId "code-review" -Variables @{language="Python"}
```

### Python API

Access the REST API programmatically:

```python
import requests

# Search prompts
response = requests.get("http://localhost:8000/prompts/search?q=testing")
prompts = response.json()

# Generate with OpenAI
response = requests.post("http://localhost:8000/api/generate", json={
    "template_id": "code-review",
    "model": "gpt-4o-mini",
    "variables": {"code": "def hello(): print('hi')"}
})
result = response.json()
```

## 📁 Project Structure

```
UnifiedAIToolbox/
├── apps/
│   ├── OrchestrationDesktop/             # WPF desktop application (C#/.NET)
│   ├── PromptRefiner/                    # Prompt refinement tools
│   ├── UnifiedPromptApp/                 # FastAPI backend service
│   │   └── services/prompt-api/          # Main API implementation
│   ├── orchestration-bridge/             # Python bridge for orchestration
│   └── unifiedtoolbox.webapp/            # Next.js web portal
├── modules/
│   ├── PromptLibrary/                    # PowerShell prompt management
│   ├── GitHubRepoManager/                # GitHub integration module
│   ├── Telemetry/                        # Event tracking module
│   └── Alerting/                         # Alert monitoring module
├── data/
│   ├── prompts/                          # YAML prompt definitions
│   └── agents/                           # Agent configurations
├── docs/                                 # Documentation
│   └── help/                             # User guides
├── scripts/                              # Orchestration and utility scripts
├── .github/workflows/                    # CI/CD workflows
└── launch.sh / Start-Toolbox.ps1        # Launch scripts
```

## 📚 Documentation

### Getting Started
- **[Quick Start Guide](docs/help/quick-start.md)** - Get up and running
- **[Launch Guide](docs/help/launch-guide.md)** - Detailed deployment instructions
- **[Architecture Overview](docs/help/architecture.md)** - System design and components

### Recreate This Project
- **[Prompt Chain Recreation Guide](docs/PROMPT_CHAIN_RECREATION.md)** - 🔥 **NEW!** Recreate UnifiedAIToolbox using AI prompt chaining
- **[Quick Start: Prompt Chain](docs/PROMPT_CHAIN_QUICK_START.md)** - Fast-track guide to using the prompt chain

### User Guides
- **[Demo Guide](docs/DEMO.md)** - Interactive demo walkthrough
- **[Prompt Refiner Guide](docs/help/prompt-refiner.md)** - Prompt optimization workflows
- **[GitHub Integration](docs/GITHUB_INTEGRATION.md)** - GitHub API and repo operations

### Operations & Monitoring
- **[Orchestration Run Tracking](docs/ORCHESTRATION_RUN_TRACKING.md)** - Run tracking with cost analytics
- **[Quality & Outcome Tracking](docs/QUALITY_TRACKING.md)** - Success rates and quality scores
- **[Telemetry & AI Insights](docs/TELEMETRY_AND_AI_INSIGHTS.md)** - Usage metrics and analysis
- **[Alerting System](docs/ALERTING_SYSTEM.md)** - Configure and monitor alerts

### CI/CD & Automation
- **[Workflow Guide](docs/WORKFLOW_GUIDE.md)** - GitHub Actions workflows and artifacts
- **[Webhook Setup](docs/WEBHOOK_SETUP.md)** - GitHub webhook configuration

### Reference
- **[API Reference](docs/help/api-reference.md)** - REST API documentation
- **[Project Roadmap](docs/PROJECT_ROADMAP.md)** - Current status and plans

## 🛠️ Development

### Running Services Individually

**API Service:**
```bash
cd apps/UnifiedPromptApp/services/prompt-api
python -m pip install -r requirements.txt
python app.py
```

**Web Portal:**
```bash
cd apps/unifiedtoolbox.webapp
npm install
npm run dev         # Development server on port 3000
npm run build       # Production build
npm test            # Run tests
```

**Desktop App (Windows):**
```bash
cd apps/OrchestrationDesktop
dotnet restore
dotnet build
dotnet run
```

### Testing

```bash
# PowerShell module tests
pwsh tests/Schema.Tests.ps1

# Python API tests
cd apps/UnifiedPromptApp/services/prompt-api
pytest

# TypeScript/React tests
cd apps/unifiedtoolbox.webapp
npm test
```

### Building

```bash
# Build web portal for production
cd apps/unifiedtoolbox.webapp
npm run build

# Build desktop app
cd apps/OrchestrationDesktop
dotnet build --configuration Release
```

## 🔄 CI/CD

### GitHub Actions Workflows

**Continuous Integration:**
- `ci-comprehensive.yml` - Runs on every push/PR
  - Tests PowerShell, Python, TypeScript, and C# code
  - Builds web portal and desktop applications
  - Uploads build artifacts (30-day retention)
  - Generates CI summary reports

**Scheduled Tasks:**
- `repo-analysis-scheduled.yml` - Daily at 6 AM UTC
  - Repository health analysis
  - Code quality metrics
  - Prompt library statistics
  - Generates JSON and HTML reports (90-day retention)

### Artifacts

Build artifacts are automatically organized:
- `artifacts/builds/` - Compiled applications
- `artifacts/reports/` - Analysis and health reports
- `artifacts/logs/` - Build and runtime logs

```bash
# Run repository analysis locally
pwsh scripts/Run-RepoAnalysis.ps1 -AnalysisType full

# Collect build artifacts
pwsh scripts/Collect-BuildArtifacts.ps1 -Clean -Manifest
```

See [Workflow Guide](docs/WORKFLOW_GUIDE.md) for details.

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Built With

- **Frontend**: React 19, Next.js 16, TypeScript, TailwindCSS
- **Backend**: Python, FastAPI, SQLite
- **Desktop**: .NET 8, WPF (C#)
- **Automation**: PowerShell 7+
- **Infrastructure**: Docker, GitHub Actions

## 📞 Support

- **Documentation**: [docs/help/](docs/help/)
- **Issues**: [GitHub Issues](https://github.com/xfaith4/UnifiedAIToolbox/issues)
- **Discussions**: [GitHub Discussions](https://github.com/xfaith4/UnifiedAIToolbox/discussions)

---

**Ready to get started?** Follow the [Quick Start](#-quick-start) guide above! 🚀

