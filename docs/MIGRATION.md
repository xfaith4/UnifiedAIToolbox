# Migration Guide - UnifiedAIToolbox v2.0

## Overview

UnifiedAIToolbox v2.0 represents a major simplification and modernization of the repository. This guide helps existing users migrate to the new structure.

## What Changed

### Removed Components

The following components have been **removed** in v2.0:

- ✂️ **Desktop Applications**: `OrchestrationDesktop` (WPF), `OrchestrationDesktopLauncher`, `PromptRefiner`
- ✂️ **Legacy Dashboard**: `apps/dashboard` (React/Vite)
- ✂️ **Archive Clutter**: All subdirectories in `archive/` (~2.8MB)
- ✂️ **Legacy Scripts**: `Launch.ps1`, `Start-WebUI.ps1`, `Launch-Demo.ps1`, `Smoketest.ps1`, `Smoketest-Matrix.ps1`, `Launch-Portal.bat`
- ✂️ **Unnecessary Dependencies**: PyTorch, torchvision, torchaudio (~2GB)
- ✂️ **Constraints File**: `constraints.txt` (unified into `requirements.txt`)

**Recovery**: All removed components are available in git history. See `archive/ARCHIVE_MANIFEST.md` for recovery instructions.

### Simplified Components

- 📝 **README**: Reduced from 452 to 221 lines (51% reduction)
- 🚀 **Start-Toolbox.ps1**: Reduced from 851 to 144 lines (83% reduction)
- 🐧 **launch.sh**: Reduced from 215 to 103 lines (52% reduction)
- ⚙️ **.env.example**: Reduced from 73 to 24 lines (67% reduction)

### Dependency Updates

- ✅ **Pydantic v2**: All code now uses Pydantic v2 (was mixed v1/v2)
- ✅ **Unified Requirements**: Single `requirements.txt` at root
- ✅ **Minimal Dependencies**: Only essential packages included

### Current Architecture

**Core Components** (kept):

1. **FastAPI Backend**: `apps/UnifiedPromptApp/services/prompt-api/`
2. **Next.js Web Portal**: `apps/unifiedtoolbox.webapp/`
3. **Orchestration Bridge**: `apps/orchestration-bridge/`

## Migration Steps

### For New Users

Simply follow the [Quick Start](README.md#-quick-start):

```bash
git clone https://github.com/xfaith4/UnifiedAIToolbox.git
cd UnifiedAIToolbox
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY
./launch.sh  # or .\Start-Toolbox.ps1 on Windows
```

### For Existing Users

1. **Pull Latest Changes**:

   ```bash
   git pull
   ```

2. **Update .env File**:

   Old `.env` had many optional variables. New `.env.example` is simpler:

   ```env
   # Required
   OPENAI_API_KEY=your-key-here
   OPENAI_MODEL=gpt-4o-mini

   # Optional (defaults shown)
   API_PORT=8000
   WEB_PORT=3000

   # Optional - GitHub Integration
   # GITHUB_TOKEN=your-token
   ```

3. **Reinstall Dependencies**:

   ```bash
   # Remove old virtual environment
   rm -rf .venv

   # Create fresh environment
   python3 -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   pip install -r requirements.txt

   # Reinstall web app dependencies
   cd apps/unifiedtoolbox.webapp
   rm -rf node_modules package-lock.json
   npm install
   cd ../..
   ```

4. **Use New Launcher**:

   ```bash
   # Linux/Mac/WSL
   ./launch.sh

   # Windows PowerShell
   .\Start-Toolbox.ps1
   ```

### Breaking Changes

#### Python Code

**Pydantic v1 → v2**:

```python
# OLD (Pydantic v1)
from pydantic import BaseSettings, validator

class Settings(BaseSettings):
    @validator('field')
    def validate_field(cls, v):
        return v

    class Config:
        env_prefix = "PREFIX_"

# NEW (Pydantic v2)
from pydantic import field_validator
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    @field_validator('field')
    @classmethod
    def validate_field(cls, v):
        return v

    model_config = {"env_prefix": "PREFIX_"}

# .dict() → .model_dump()
data = model.model_dump()  # was: model.dict()
```

#### Launch Scripts

**Before**:

```powershell
# Old: Multiple scripts
.\Launch.ps1
.\Start-WebUI.ps1
.\Smoketest.ps1

# Old: Complex menu
.\Start-Toolbox.ps1 -Mode FullStack -Goal "..." -Model gpt-4
```

**After**:

```powershell
# New: Single simple launcher
.\Start-Toolbox.ps1  # Launches everything
```

#### Environment Variables

**Removed** (no longer needed):

- `FRONTEND_PORT` (legacy dashboard removed)
- `WORKBENCH_PORT` (Streamlit removed)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (moved to optional)
- All `BRIDGE_*` prefixed vars (defaults work fine)

**Simplified**:

- `GITHUB_TOKEN` is now truly optional (GitHub CLI fallback removed)

## Feature Parity

All core features are preserved:

✅ **Prompt Management**: YAML library, full-text search, templates
✅ **AI Integration**: OpenAI GPT-4, GPT-4o, cost tracking
✅ **Multi-Agent Orchestration**: All agents preserved
✅ **Web Portal**: Enhanced Next.js UI (better than legacy desktop apps)
✅ **REST API**: FastAPI with OpenAPI docs
✅ **GitHub Integration**: Clone, analyze, PR creation
✅ **Run Tracking**: Cost analytics, quality metrics
✅ **PromptOps**: Closed-loop improvement system

## Troubleshooting

### "GitHub authentication not available"

This is a **warning**, not an error. The app works without GitHub features.

**To enable GitHub features**:

```bash
# Add to .env
GITHUB_TOKEN=ghp_your_token_here
```

### "Module not found" errors

```bash
# Reinstall dependencies
source .venv/bin/activate
pip install -r requirements.txt
```

### Web portal won't build

The webapp has a Next.js 404 page issue in production build. **Use dev mode**:

```bash
cd apps/unifiedtoolbox.webapp
npm run dev  # This works
```

Build mode will be fixed in a future update.

### Port conflicts

Change ports in `.env`:

```env
API_PORT=8001
WEB_PORT=3001
```

## Rollback Instructions

If you need to rollback to the old version:

```bash
# Find the last commit before simplification
git log --oneline | grep "before"

# Checkout that commit
git checkout <commit-hash>

# Or use a tag if available
git checkout v1.5
```

## Support

- **Issues**: [GitHub Issues](https://github.com/xfaith4/UnifiedAIToolbox/issues)
- **Discussions**: [GitHub Discussions](https://github.com/xfaith4/UnifiedAIToolbox/discussions)
- **Documentation**: [docs/help/](docs/help/)

## Questions?

Open an issue with the `migration` label and we'll help you migrate.
