# Unified AI Toolbox

> **AI orchestration platform** for managing prompts, agents, and AI workflows with OpenAI.

[![Version](https://img.shields.io/badge/version-2.0-blue.svg)](https://github.com/xfaith4/UnifiedAIToolbox)

## 🌟 Overview

The Unified AI Toolbox is a streamlined platform that provides:

- **Prompt Management**: YAML-based prompt library with full-text search
- **AI Provider Integration**: OpenAI GPT-5.2, GPT-4, GPT-4o, GPT-4o-mini support with cost tracking
- **Multi-Agent Orchestration**: Supervisor, Researcher, Engineer, and specialized agents
- **Web Portal**: Modern Next.js application for prompt and agent management
- **REST API**: FastAPI backend with OpenAPI documentation
- **GitHub Integration**: Clone repos, analyze code, create PRs automatically
<img width="1897" height="899" alt="image" src="https://github.com/user-attachments/assets/5dcf9486-1af6-45e8-9211-4cd60d792e34" />

## 🚀 Quick Start

### Prerequisites

- **Python 3.12+** - [Download](https://www.python.org/)
- **Node.js 18+** - [Download](https://nodejs.org/)
- **OpenAI API Key** - [Get yours](https://platform.openai.com/api-keys)

### Installation (3 steps)

1. **Clone and configure:**

   ```bash
   git clone https://github.com/xfaith4/UnifiedAIToolbox.git
   cd UnifiedAIToolbox
   cp .env.example .env
   ```

2. **Add your OpenAI API key to `.env`:**

   ```bash
   # Edit .env and add:
   OPENAI_API_KEY=sk-proj-your-key-here
   ```

3. **Launch:**

   ```bash
   # Linux/Mac/WSL
   ./launch.sh

   # Windows PowerShell
   .\Start-Toolbox.ps1
   ```

### Access Your Services

After launching, open:

- 🌐 **Web Portal**: <http://localhost:3000>
- 🔧 **API Docs**: <http://localhost:8000/docs>
- 💊 **Health Check**: <http://localhost:8000/health>

That's it! The launcher will automatically:

- Install all Python and Node.js dependencies
- Start the FastAPI backend
- Start the Next.js web portal
- Open your browser

## ✨ Key Features

### 🎯 Prompt Management

- **YAML Prompt Library**: Extensive, version-controlled prompt collection
- **SQLite Database**: Fast full-text search and metadata storage
- **Template Rendering**: Dynamic prompts with variable substitution
- **Prompt Refinement**: AI-powered optimization workflows

### 🤖 AI Integration

- **Multiple Models**: GPT-5.2 (default), GPT-4, GPT-4o, GPT-4o-mini, GPT-3.5-turbo
- **Cost Tracking**: Real-time token usage and cost monitoring
- **Cost Analytics**: Track API costs and cost-per-run analysis

### 🔄 Orchestration & Automation

- **Multi-Agent System**: Specialized agents (Supervisor, Researcher, Engineer, Critic, Synthesizer)
- **MCP Library**: Browse, manage, and secure Model Context Protocol servers with deny-by-default policy enforcement
- **Artifact Normalization**: Automatic cleanup and validation of generated code artifacts
- **Run Tracking**: Track orchestration with cost analysis and quality metrics
- **GitHub Integration**: Automated repo operations via GitHub API
- **Real-time Monitoring**: Live log streaming and progress tracking

#### Artifact Normalization Workflow

The orchestration tool includes an automatic artifact normalizer that ensures generated code is runnable:

1. **Intake**: Unzips and indexes the generated artifact
2. **Cleanup**: 
   - Strips accidental markdown code fences from code files
   - Splits bundled multi-file blobs into discrete files
   - Relocates orphaned/weirdly-named files to appropriate locations
3. **Scaffolding**: Creates missing configuration files:
   - Frontend: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`
   - Backend: `requirements.txt` or `pyproject.toml`, `__init__.py` markers
4. **Validation**: Runs sanity checks (Python syntax, package.json structure, YAML parsing)
5. **Report**: Generates `normalization_report.md` with all transformations

Configure normalization in `.env`:
```bash
NORMALIZE_ARTIFACTS=true    # Enable/disable normalization (default: true)
NORMALIZE_STRICT=false      # Fail on unresolved issues (default: false)
```

All transformations are logged in `normalize_log.json` with before/after hashes.

### 💻 Web Portal

Modern Next.js application featuring:

- Prompt library browser and editor
- Agent configuration and management
- Orchestration designer with visual workflow
- GitHub repository integration
- Milestone and project tracking
- Real-time cost and usage metrics

## 📁 Project Structure

```
UnifiedAIToolbox/
├── apps/
│   ├── UnifiedPromptApp/
│   │   └── services/prompt-api/        # FastAPI backend
│   ├── orchestration-bridge/           # Orchestration automation
│   └── unifiedtoolbox.webapp/          # Next.js web portal
├── data/
│   ├── prompts/                        # YAML prompt definitions
│   └── agents/                         # Agent configurations
├── modules/                            # PowerShell modules
├── scripts/                            # Utility scripts
├── launch.sh                           # Linux/Mac launcher
└── Start-Toolbox.ps1                   # Windows launcher
```

## 🔧 Configuration

The toolbox uses environment variables for configuration. Key settings in `.env`:

```env
# Required
OPENAI_API_KEY=your-openai-key
# Default model is GPT-5.2 for advanced AI orchestration
OPENAI_MODEL=gpt-5.2

# Optional (defaults shown)
API_PORT=8000                # FastAPI backend port
WEB_PORT=3000               # Next.js web portal port

# Optional - Artifact Normalization
NORMALIZE_ARTIFACTS=true     # Enable automatic artifact cleanup
NORMALIZE_STRICT=false       # Fail on unresolved issues

# Optional - GitHub Integration
GITHUB_TOKEN=your-github-token
```

## 🎭 Orchestration Workflow

The AI Toolbox follows a lightweight orchestration workflow for Codex-driven changes:

### Intake → Plan → Execute

1. **Intake**: Restate the goal, identify required files/scripts, call out missing inputs
2. **Plan**: Propose smallest viable plan, prefer existing scripts/templates
3. **Execute**: Make targeted changes, keep artifacts local
4. **Verify**: Run checks if feasible, document skipped checks
5. **Report**: Summarize changes, list follow-ups

### Artifact Locations

- **Local orchestration artifacts**: `.uaitoolbox/` or `runs/` (git-ignored)
- **App Factory runs**: `.uaitoolbox/app-factory/runs/<runId>/` (generated repo + hardening reports during export)
- **Prompts**: `data/prompts/` (YAML)
- **Agents**: `data/agents/` (YAML/JSON)
- **Run tracking**: `apps/orchestration-bridge/runs/` (JSON)
- **Audit logs**: SQLite databases + JSONL files

See [AGENTS.md](AGENTS.md) for orchestration rules and definition of done.

## 📚 Documentation

- **Start here** - [docs/README.md](docs/README.md)
- **Getting started** - [docs/getting-started.md](docs/getting-started.md)
- **Architecture** - [docs/architecture.md](docs/architecture.md)
- **Orchestration** - [docs/orchestration.md](docs/orchestration.md)
- **Hardening** - [docs/hardening.md](docs/hardening.md)
- **Integrations** - [docs/integrations.md](docs/integrations.md)
- **Telemetry** - [docs/telemetry.md](docs/telemetry.md)
- **Cost analytics** - [docs/cost-analytics.md](docs/cost-analytics.md)
- **Workflows** - [docs/workflows.md](docs/workflows.md)
- **MCP docs** - [docs/mcp/README.md](docs/mcp/README.md)

## 🛠️ Development

### Running Services Individually

**API Service:**

```bash
cd apps/UnifiedPromptApp/services/prompt-api
python -m venv .venv
# Activate the venv:
# - PowerShell: . .\.venv\Scripts\Activate.ps1
# - cmd.exe:    .venv\Scripts\activate.bat
# - bash/zsh:   source .venv/bin/activate
pip install -r requirements.txt
python app.py  # API at http://localhost:8000 (the Web Portal is a separate service)
```

**Web Portal:**

```bash
cd apps/unifiedtoolbox.webapp
npm install
npm run dev         # Development server
npm run build       # Production build
```

### Testing

```bash
# Python API tests
cd apps/UnifiedPromptApp/services/prompt-api
pytest

# TypeScript/React tests
cd apps/unifiedtoolbox.webapp
npm test
```

## 🔄 Simplified Architecture

**January 2026 Update**: This repository has been significantly simplified:

- ✅ **Removed** legacy desktop apps (WPF)
- ✅ **Removed** duplicate dashboards
- ✅ **Fixed** Pydantic v1/v2 conflicts
- ✅ **Removed** unnecessary dependencies (PyTorch, etc.)
- ✅ **Unified** Python dependencies in single `requirements.txt`
- ✅ **Simplified** launcher scripts (83% code reduction)
- ✅ **Streamlined** environment configuration

The focus is now on two core components:

1. **FastAPI Backend** - Robust Python API for prompts and orchestration
2. **Next.js Frontend** - Modern, feature-rich web interface

## 🤝 Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🛠️ Built With

- **Frontend**: React 19, Next.js 16, TypeScript, TailwindCSS
- **Backend**: Python 3.12, FastAPI, SQLite
- **Automation**: PowerShell 7+, Bash

## 📞 Support

- **Documentation**: [docs/README.md](docs/README.md)
- **Issues**: [GitHub Issues](https://github.com/xfaith4/UnifiedAIToolbox/issues)
- **Discussions**: [GitHub Discussions](https://github.com/xfaith4/UnifiedAIToolbox/discussions)

---

**Ready to get started?** Follow the [Quick Start](#-quick-start) guide above! 🚀
