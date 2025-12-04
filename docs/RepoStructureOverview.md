# UnifiedAIToolbox Repository Structure Overview

**Last Updated:** 2025-12-04  
**Purpose:** Comprehensive guide to repository organization and navigation

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [Repository Layout](#repository-layout)
3. [Active Applications](#active-applications)
4. [Core Infrastructure](#core-infrastructure)
5. [Development Directories](#development-directories)
6. [Archive Structure](#archive-structure)
7. [How to Build and Run](#how-to-build-and-run)
8. [Common Tasks](#common-tasks)

---

## Quick Start

### What is UnifiedAIToolbox?

UnifiedAIToolbox is a comprehensive AI orchestration platform that provides:
- Multi-agent code review and orchestration
- Prompt management and refinement tools
- Web-based dashboards for monitoring and control
- Desktop applications for local orchestration
- API services for integration with external tools

### Key Entry Points

| Purpose | Windows | Linux/Mac | Web |
|---------|---------|-----------|-----|
| **Launch All Services** | `Launch.ps1` | `./launch.sh` | `launch-portal.html` |
| **Visual Launch Portal** | `Launch-Portal.bat` | N/A | Open `launch-portal.html` |
| **Run Prompt** | `Run-Prompt.ps1` | N/A | N/A |
| **Start Web UI Only** | `Start-WebUI.ps1` | N/A | N/A |
| **Smoke Test** | `Smoketest.ps1` | N/A | N/A |

### Quick Commands

```powershell
# Windows PowerShell
.\Launch.ps1                    # Launch all services
.\Run-Prompt.ps1 "Your prompt"  # Execute a prompt
.\Smoketest.ps1                 # Run smoke tests

# Linux/Mac
./launch.sh                     # Launch all services
```

---

## Repository Layout

```
UnifiedAIToolbox/
├── 📁 apps/                    # Active applications
├── 📁 Orchestration/           # Core orchestration engine
├── 📁 modules/                 # Shared PowerShell modules
├── 📁 packages/                # Python packages
├── 📁 scripts/                 # Utility scripts
├── 📁 tests/                   # Test suites
├── 📁 docs/                    # Documentation
├── 📁 data/                    # Active data (agents, prompts, DB)
├── 📁 examples/                # Example scripts
├── 📁 archive/                 # Archived/legacy code
├── 📁 project files/           # Branding and assets
├── 📁 runs/                    # Runtime data (gitignored)
├── 📄 Launch.ps1               # Windows launcher
├── 📄 launch.sh                # Linux/Mac launcher
├── 📄 Launch-Portal.bat        # Visual portal launcher (Windows)
├── 📄 launch-portal.html       # Visual launch interface
└── 📄 UnifiedAIToolbox.sln     # Visual Studio solution
```

---

## Active Applications

### apps/dashboard
**Technology:** React + Vite  
**Purpose:** Web-based dashboard for monitoring orchestration  
**Entry Point:** Launched via `Launch.ps1` or `launch.sh`  
**Location:** `apps/dashboard/`

**Key Features:**
- Real-time orchestration monitoring
- Prompt management interface
- Agent status and logs

### apps/unifiedtoolbox.webapp
**Technology:** Next.js  
**Purpose:** Unified web portal for all services  
**Entry Point:** Launched via `launch.sh`  
**Location:** `apps/unifiedtoolbox.webapp/`

**Key Features:**
- Unified interface for all toolbox features
- Service management and configuration
- Integration hub

### apps/OrchestrationDesktop
**Technology:** WPF (C#/.NET)  
**Purpose:** Windows desktop application for local orchestration  
**Entry Point:** Built via `UnifiedAIToolbox.sln`  
**Location:** `apps/OrchestrationDesktop/`

**Key Features:**
- Native Windows UI for orchestration
- Local file system integration
- Desktop-optimized workflows

### apps/OrchestrationDesktopLauncher
**Technology:** C#/.NET  
**Purpose:** Launcher utility for desktop app  
**Entry Point:** Built via `UnifiedAIToolbox.sln`  
**Location:** `apps/OrchestrationDesktopLauncher/`

### apps/PromptRefiner
**Technology:** PowerShell + Web  
**Purpose:** Prompt refinement and testing tools  
**Entry Point:** Via `Run-Prompt.ps1` or web interface  
**Location:** `apps/PromptRefiner/`

**Key Features:**
- Prompt testing and validation
- Refinement suggestions
- Template management

### apps/orchestration-bridge
**Technology:** Python (Flask/FastAPI)  
**Purpose:** Bridge between orchestration engine and external services  
**Entry Point:** Auto-launched by orchestration scripts  
**Location:** `apps/orchestration-bridge/`

**Key Features:**
- API integration layer
- Multi-agent coordination
- Codex swarm integration

---

## Core Infrastructure

### Orchestration/
**Purpose:** Core orchestration engine and services

```
Orchestration/
├── MilestoneController.ps1          # Main dispatcher
├── UnifiedPromptApp/                # Prompt API service
│   └── services/
│       └── prompt-api/              # REST API for prompts
└── AI-Orchestration/                # AI orchestration core
    ├── AI Orchestration/            # TypeScript orchestration app
    ├── MilestoneDashboard/          # Vite/React dashboard
    ├── scripts/                     # Orchestration scripts
    ├── codex-multiagent-swarm/      # Multi-agent code review
    └── GeminiAIOrchestrator/        # Google Gemini integration
```

#### Key Components

**codex-multiagent-swarm/**
- **Status:** ✅ ACTIVE - Critical Component
- **Purpose:** Multi-agent code review and orchestration
- **Used By:** 
  - `apps/orchestration-bridge/bridge.py`
  - `Orchestration/UnifiedPromptApp/services/prompt-api/app.py`
  - Multiple PowerShell modules and tests
- **Features:**
  - Multi-agent code review coordination
  - Swarm-based analysis and recommendations
  - Integration with orchestration bridge

**GeminiAIOrchestrator/**
- **Status:** ✅ ACTIVE - Experimental
- **Purpose:** Google Gemini AI API integration
- **Technology:** TypeScript/Vite with `@google/genai`
- **Note:** OAuth configuration present; may be used for future Gemini features

---

## Development Directories

### modules/
**Purpose:** Shared PowerShell modules  
**Contents:**
- `PromptLibrary/` - Prompt management modules
- Reusable orchestration functions
- Common utilities

**Usage:**
```powershell
Import-Module ./modules/PromptLibrary/PromptLibrary.psm1
```

### packages/
**Purpose:** Python packages and libraries  
**Contents:**
- `prompt-registry/` - Python prompt registry package

**Usage:**
```bash
pip install -e ./packages/prompt-registry
```

### scripts/
**Purpose:** Operational and utility scripts  
**Contents:**
- `Unified-Orchestration.ps1` - Orchestration utilities
- `verify-launch.py` - Launch verification script
- Various operational scripts

### tests/
**Purpose:** Test suites for all components  
**Contents:**
- `Orchestration.Tests.ps1` - PowerShell orchestration tests
- `PromptLibrary.Tests.ps1` - Prompt library tests
- Integration tests

**Run Tests:**
```powershell
# Windows
Invoke-Pester tests/

# Or use smoke test
.\Smoketest.ps1
```

### data/
**Purpose:** Active runtime data  
**Contents:**
- `agents/` - Agent definitions and configurations
- `prompts/` - Prompt templates and library
- `sqlite/` - SQLite databases (gitignored)

**Note:** Database files (*.db) are gitignored and created at runtime

### examples/
**Purpose:** Example scripts and usage patterns  
**Contents:**
- `New-RefinedPrompt-Example.ps1` - Prompt refinement example
- Other usage examples

---

## Archive Structure

### archive/
**Purpose:** Historical and deprecated code (preserved, not deleted)

```
archive/
├── apps-web-legacy/              # Legacy web applications
├── project-dashboard-legacy/     # Legacy dashboard versions
├── project-management/           # Old project management docs
└── 2025-12-RepoCleanup/         # December 2025 cleanup archive
    ├── ARCHIVE_MANIFEST.md       # Complete archive index
    ├── old-scripts/              # Superseded scripts
    ├── reference-docs/           # Reference documentation
    ├── old-apps/                 # Superseded app components
    ├── legacy-experiments/       # Experimental code
    └── needs-review/             # Items needing review
```

**Important:** See `archive/2025-12-RepoCleanup/ARCHIVE_MANIFEST.md` for detailed information about archived items and how to restore them.

---

## How to Build and Run

### Prerequisites

**Windows:**
- PowerShell 5.1 or PowerShell 7+
- .NET SDK (for desktop apps)
- Node.js 18+ (for web apps)
- Python 3.9+ (for bridge and services)

**Linux/Mac:**
- Bash shell
- Node.js 18+
- Python 3.9+

### Initial Setup

```powershell
# Windows

# 1. Clone the repository
git clone <repository-url>
cd UnifiedAIToolbox

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# 3. Install Python dependencies
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 4. Install Node.js dependencies
cd apps/dashboard
npm install
cd ../unifiedtoolbox.webapp
npm install
cd ../..

# 5. Build C# desktop apps (optional)
# Open UnifiedAIToolbox.sln in Visual Studio and build
```

```bash
# Linux/Mac

# 1. Clone the repository
git clone <repository-url>
cd UnifiedAIToolbox

# 2. Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# 3. Install Python dependencies
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 4. Install Node.js dependencies
cd apps/dashboard
npm install
cd ../unifiedtoolbox.webapp
npm install
cd ../..
```

### Running the Platform

**Windows:**
```powershell
# Option 1: Launch all services
.\Launch.ps1

# Option 2: Use visual portal
.\Launch-Portal.bat
# Or open launch-portal.html in browser

# Option 3: Start specific components
.\Start-WebUI.ps1           # Web UI only
.\Run-Prompt.ps1 "prompt"   # Run a specific prompt
```

**Linux/Mac:**
```bash
# Launch all services
./launch.sh

# Or open visual portal
open launch-portal.html
```

### Building Desktop Apps

```powershell
# Open Visual Studio
start UnifiedAIToolbox.sln

# Or build from command line
dotnet build UnifiedAIToolbox.sln
```

---

## Common Tasks

### Adding a New Prompt

```powershell
# Use the prompt refiner
.\Run-Prompt.ps1 -Refine "Your prompt here"

# Or edit directly
# Prompts are stored in: data/prompts/
```

### Running Tests

```powershell
# Run all tests
Invoke-Pester tests/

# Run specific test file
Invoke-Pester tests/Orchestration.Tests.ps1

# Quick smoke test
.\Smoketest.ps1
```

### Viewing Logs

Logs are typically output to:
- Console (stdout)
- `runs/` directory (runtime logs)
- Individual app log directories

### Configuring Services

1. **Environment Variables:** Edit `.env` file
2. **App Configurations:** Check individual app directories for config files
3. **Orchestration:** Edit `Orchestration/MilestoneController.ps1` or related configs

### Troubleshooting

**Issue:** Launch scripts fail  
**Solution:** 
- Check PowerShell execution policy: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`
- Verify all dependencies installed
- Check `.env` configuration

**Issue:** Web apps won't start  
**Solution:**
- Verify Node.js installed: `node --version`
- Install dependencies: `npm install` in app directory
- Check for port conflicts

**Issue:** Python services fail  
**Solution:**
- Verify virtual environment activated
- Install dependencies: `pip install -r requirements.txt`
- Check Python version: `python --version` (need 3.9+)

**Issue:** Desktop apps won't build  
**Solution:**
- Verify .NET SDK installed
- Open Visual Studio and restore NuGet packages
- Check for missing dependencies in solution

---

## Configuration Files

### Root Level Configuration

| File | Purpose |
|------|---------|
| `.env` | Environment variables (gitignored) |
| `.env.example` | Template for environment configuration |
| `.gitignore` | Git ignore patterns |
| `UnifiedAIToolbox.sln` | Visual Studio solution |
| `docker-compose.yml` | Docker services configuration |
| `docker-compose.phase3.yml` | Phase 3 Docker configuration |
| `providers.json` | AI provider configurations |

### App-Specific Configuration

Each app directory typically contains:
- `package.json` (Node.js apps)
- `*.csproj` (C# apps)
- `requirements.txt` or `pyproject.toml` (Python apps)
- App-specific config files

---

## Security and Secrets

### ⚠️ Important Security Notes

1. **OAuth Secrets:** OAuth credentials should NEVER be committed to the repository
   - Store in `.env` file (gitignored)
   - Use `.env.example` as template
   - See `.env.example` for required OAuth variables

2. **API Keys:** Store all API keys in `.env` file
   - Never commit API keys to Git
   - Rotate keys if accidentally committed

3. **Database Files:** SQLite databases are gitignored
   - Located in `data/sqlite/`
   - Created at runtime

4. **Runs Directory:** Runtime data is gitignored
   - Location: `runs/`
   - Contains temporary execution data

### .gitignore Coverage

The repository `.gitignore` excludes:
- `.env` and `.env.local` files
- `runs/` directory
- `node_modules/` directories
- `*.db` database files
- Build outputs (`build/`, `dist/`, `bin/`, `obj/`)
- Python cache (`__pycache__/`, `*.pyc`)
- Virtual environments (`.venv/`, `venv/`)
- OAuth secrets (`client_secret*.json`)

---

## Contributing

See `CONTRIBUTING.md` for detailed contribution guidelines.

**Quick Guidelines:**
- Follow existing code style and conventions
- Add tests for new features
- Update documentation as needed
- Run tests before committing: `.\Smoketest.ps1`

---

## Additional Resources

### Documentation
- `README.md` - Project overview and quick start
- `CONTRIBUTING.md` - Contribution guidelines
- `IMPLEMENTATION_SUMMARY.md` - Implementation details
- `docs/` directory - Additional documentation

### Planning and Status
- `CLEANUP_EXECUTIVE_SUMMARY.md` - Repository cleanup summary
- `docs/ORCHESTRATOR_STATUS.md` - Orchestrator status
- `docs/ORCHESTRATOR_ENHANCEMENTS.md` - Enhancement plans
- `docs/PROJECT_ROADMAP.md` - Project roadmap

### Archived Content
- `archive/README.md` - Archive overview
- `archive/2025-12-RepoCleanup/ARCHIVE_MANIFEST.md` - Detailed archive manifest

---

## Getting Help

### Quick Reference
1. Check this document for structure and common tasks
2. Review `README.md` for quick start information
3. Check app-specific README files in app directories
4. See `CONTRIBUTING.md` for development guidelines

### Troubleshooting
1. Check logs in console output or `runs/` directory
2. Verify `.env` configuration
3. Ensure all dependencies installed
4. Review troubleshooting section above

### Resources
- Project documentation in `docs/`
- Example scripts in `examples/`
- Test files in `tests/` for usage patterns

---

**Document Version:** 1.0  
**Last Updated:** 2025-12-04  
**Maintained By:** UnifiedAIToolbox Team
