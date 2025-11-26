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
- **Multiple Providers**: OpenAI (GPT-4, GPT-3.5), Anthropic (Claude 3.5), Azure OpenAI
- **Provider Abstraction**: Unified interface for all providers
- **Cost Tracking**: Real-time token usage and cost monitoring
- **Rate Limiting**: Built-in protection against quota exhaustion

### 🔄 Orchestration & Automation
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
- **CI/CD Pipeline**: Automated testing and deployment workflows

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** - [Download](https://nodejs.org/)
- **Python 3.12+** - [Download](https://www.python.org/)
- **PowerShell 7.4+** - [Download](https://github.com/PowerShell/PowerShell/releases) *(for orchestration)*
- **.NET 8 SDK** - [Download](https://dotnet.microsoft.com/download) *(for desktop app)*

### Launch in 30 Seconds

**Windows:**
```powershell
.\LaunchUnifiedToolbox.ps1
```

**Linux/Mac:**
```bash
./launch.sh
```

**Docker:**
```bash
docker compose up -d
```

### Access Your Services
- 🌐 **Web Portal**: http://localhost:3001

**📖 Need more details?** See the [Launch Guide](docs/help/launch-guide.md) for comprehensive setup instructions.

## 📁 Project Structure

```
UnifiedAIToolbox/
├── apps/
│   ├── dashboard/              # React/Vite web dashboard
│   ├── unifiedtoolbox.webapp/  # Next.js web portal
│   ├── OrchestrationDesktop/   # WPF desktop application
│   └── PromptRefiner/          # Prompt refinement tools
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

- **[Quick Start Guide](docs/help/quick-start.md)** - Get up and running in minutes
- **[Launch Guide](docs/help/launch-guide.md)** - Detailed deployment instructions
- **[Architecture Overview](docs/help/architecture.md)** - System design and components
- **[API Reference](docs/help/api-reference.md)** - REST API documentation
- **[Prompt Refiner Guide](docs/help/prompt-refiner.md)** - Prompt optimization workflows
- **[Deployment Guide](docs/help/deployment.md)** - Production deployment checklist

## 🛠️ Development

### Build the Project

**Web Dashboard:**
```bash
cd apps/dashboard
npm install
npm run dev         # Development server
npm run build       # Production build
npm test           # Run tests
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
cd services/prompt-api
python -m pip install -r requirements.txt
python app.py
```

### Run Tests
```bash
# PowerShell module tests
pwsh tests/Schema.Tests.ps1

# Python API tests
cd services/prompt-api && pytest

# JavaScript/TypeScript tests
cd apps/dashboard && npm test
```

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

# Database
PROMPT_API_DB_PATH=./services/prompt-api/workbench.db

# Authentication
JWT_SECRET_KEY=your-secret-key-here
```

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
