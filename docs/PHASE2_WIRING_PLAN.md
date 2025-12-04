# Phase 2 - Wiring Plan

## Overview
This document outlines the canonical build/run commands for each component and specifies exactly which scripts need updates to ensure proper wiring across the repository.

## Canonical Build & Run Commands

### Web Applications

#### 1. apps/dashboard (React/Vite Dashboard)
```bash
# Location: apps/dashboard
# Prerequisites: Node.js 18+, npm

# Install dependencies (one-time or after updates)
cd apps/dashboard
npm install

# Development server
npm run dev
# → Runs on http://localhost:5173 (default)
# → Configurable via VITE_PORT environment variable

# Production build
npm run build
# → Outputs to dist/

# Preview production build
npm run preview

# Run tests
npm run test

# Lint
npm run lint
```

#### 2. apps/unifiedtoolbox.webapp (Next.js Portal)
```bash
# Location: apps/unifiedtoolbox.webapp
# Prerequisites: Node.js 18+, npm

# Install dependencies
cd apps/unifiedtoolbox.webapp
npm install

# Development server
npm run dev
# → Runs on http://localhost:3000 (default)
# → Configurable via PORT environment variable

# Production build
npm run build

# Start production server
npm run start

# Lint
npm run lint
```

### Desktop Applications

#### 3. apps/OrchestrationDesktop (WPF Desktop)
```powershell
# Location: apps/OrchestrationDesktop
# Prerequisites: .NET 8 SDK, PowerShell 7.4+ (for runtime)

# Build
cd apps/OrchestrationDesktop
dotnet build OrchestrationDesktop.csproj

# Run (debug mode)
dotnet run --project OrchestrationDesktop.csproj

# Build release
dotnet build OrchestrationDesktop.csproj -c Release

# Run executable (after build)
.\bin\Debug\net8.0-windows\OrchestrationDesktop.exe
```

#### 4. apps/OrchestrationDesktopLauncher (Launcher)
```powershell
# Location: apps/OrchestrationDesktopLauncher
# Prerequisites: .NET 8 SDK

# Build
cd apps/OrchestrationDesktopLauncher
dotnet build OrchestrationDesktopLauncher.csproj

# Run
dotnet run --project OrchestrationDesktopLauncher.csproj
```

### PowerShell Tools

#### 5. apps/PromptRefiner (Prompt Refinement)
```powershell
# Location: apps/PromptRefiner
# Prerequisites: PowerShell 7.4+, ImportExcel module, OPENAI_API_KEY

# Install prerequisites (one-time)
Install-Module ImportExcel -Scope CurrentUser

# Run CLI version
cd apps/PromptRefiner
pwsh -File OpenAI_Refiner.ps1

# Run GUI version (Windows only, requires STA)
pwsh -NoProfile -sta -File OpenAI_Refiner.Wpf.ps1
```

### Python Services

#### 6. Orchestration/UnifiedPromptApp/services/prompt-api (FastAPI Backend)
```bash
# Location: Orchestration/UnifiedPromptApp/services/prompt-api
# Prerequisites: Python 3.12+

# Create virtual environment (one-time)
cd Orchestration/UnifiedPromptApp/services/prompt-api
python -m venv .venv

# Activate virtual environment
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Linux/Mac:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn app:app --reload --host 0.0.0.0 --port 8000
# → API at http://localhost:8000
# → Docs at http://localhost:8000/docs
```

#### 7. apps/orchestration-bridge (Orchestration Bridge CLI)
```bash
# Location: apps/orchestration-bridge
# Prerequisites: Python 3.12+

# Run bridge
cd apps/orchestration-bridge
python bridge.py [command] [options]

# Examples:
python bridge.py list-prompts
python bridge.py generate-manifest --prompt-id example.prompt
```

### Orchestration Scripts

#### 8. Orchestration/MilestoneController.ps1 (Orchestrator Dispatcher)
```powershell
# Location: Orchestration (root level - dispatcher only)
# Dispatches to: Orchestration/AI-Orchestration/scripts/MilestoneController.ps1

# Run
pwsh -File Orchestration/MilestoneController.ps1 [args]

# Example with arguments:
pwsh -File Orchestration/MilestoneController.ps1 -Goal "Analyze project" -Model "gpt-4"
```

#### 9. Orchestration/AI-Orchestration/codex-multiagent-swarm (Code Review)
```powershell
# Location: Orchestration/AI-Orchestration/codex-multiagent-swarm
# Prerequisites: PowerShell 7.4+, API keys

# Run
cd Orchestration/AI-Orchestration/codex-multiagent-swarm
pwsh -File Orchestrate-Codex.ps1 [options]
```

## Root-Level Script Mapping

### Scripts → Components Matrix

| Script | Primary Component(s) | Purpose | Status |
|--------|---------------------|---------|--------|
| Launch.ps1 | prompt-api + dashboard | Full stack launch | ⚠️ Needs path fix |
| Start-WebUI.ps1 | dashboard OR webapp | Web UI launcher | ❌ Broken - wrong path |
| launch.sh | prompt-api + dashboard + webapp | Universal launcher | ✅ Good |
| Launch-Portal.bat | launch-portal.html | Portal opener | ✅ Good |
| Run-Prompt.ps1 | PromptLibrary module | Interactive prompts | ✅ Good |
| Smoketest.ps1 | All components | Smoke testing | ⚠️ Needs enhancement |

## Required Script Updates

### 1. Start-WebUI.ps1 - CRITICAL FIX REQUIRED

**File**: `/Start-WebUI.ps1`

**Issue**: References non-existent `apps\PromptWeb` directory (line 35)

**Decision Required**: Should this script launch:
- Option A: `apps/dashboard` (React/Vite dashboard on port 5173)
- Option B: `apps/unifiedtoolbox.webapp` (Next.js portal on port 3000)
- Option C: Rename to Start-Dashboard.ps1 and create separate Start-Portal.ps1

**Recommended Fix** (Option A - most consistent with current usage):
```powershell
# Line 35: Change from:
$promptWebDir = Join-Path $projectRoot 'apps\PromptWeb'

# To:
$dashboardDir = Join-Path $projectRoot 'apps\dashboard'
```

**Additional Changes**:
- Line 5: Update description to reference "dashboard" instead of "PromptWeb"
- Line 199: Update output message to say "Dashboard" instead of "PromptWeb"
- Throughout: Replace all references to PromptWeb with dashboard

**Reason**: The dashboard app is the active Vite-based React dashboard that serves as the primary UI. This script's port management and feature set align with launching the dashboard.

### 2. Launch.ps1 - PATH VERIFICATION

**File**: `/Launch.ps1`

**Issue**: Line 219 references `$ApiDir\MilestoneController.ps1` which may not be the correct active orchestrator

**Current Path**: `Orchestration\UnifiedPromptApp\services\prompt-api\MilestoneController.ps1`
**Should Be**: `Orchestration\AI-Orchestration\scripts\MilestoneController.ps1` (via the dispatcher)

**Recommended Fix**:
```powershell
# Line 219: Change from:
$orchestrationScript = Join-Path $ProjectRoot "Orchestration\UnifiedPromptApp\services\prompt-api\MilestoneController.ps1"

# To (use the root-level dispatcher):
$orchestrationScript = Join-Path $ProjectRoot "Orchestration\MilestoneController.ps1"
```

**Reason**: The root-level MilestoneController.ps1 is a dispatcher that calls the correct inner orchestrator. This provides a stable entry point.

### 3. Smoketest.ps1 - ENHANCEMENT NEEDED

**File**: `/Smoketest.ps1`

**Current State**: Basic smoke test for one prompt

**Enhancement Plan**:
Either enhance Smoketest.ps1 OR create Smoketest-Matrix.ps1 with:

1. **Structural Checks**:
   - Verify all expected directories exist
   - Check for required files (package.json, .csproj, .ps1 entry points)
   - Call Test-UatRepoHealth if available (external module)

2. **Component Health Checks**:
   - Dashboard: Check if npm dependencies installed, try npm run build --dry-run
   - Webapp: Check if npm dependencies installed
   - OrchestrationDesktop: Check if dotnet build succeeds
   - PromptRefiner: Check if scripts exist and are parseable
   - prompt-api: Check if Python venv exists, requirements installed
   - orchestration-bridge: Verify Python can import required modules

3. **Integration Smoke Tests**:
   - Start prompt-api in background
   - Verify health endpoint responds
   - Start dashboard dev server briefly
   - Verify dashboard loads
   - Stop services cleanly

4. **Output Format**:
   ```
   === Unified AI Toolbox Smoke Test Matrix ===
   
   [STRUCTURAL CHECKS]
   ✅ All expected directories present
   ✅ All entry point files exist
   
   [COMPONENT CHECKS]
   ✅ dashboard - build succeeds
   ✅ webapp - dependencies installed
   ✅ OrchestrationDesktop - .NET build succeeds
   ⚠️ PromptRefiner - ImportExcel module not found
   ✅ prompt-api - Python environment ready
   
   [INTEGRATION CHECKS]
   ✅ prompt-api health endpoint responds
   ✅ dashboard serves root page
   
   === OVERALL: PASSED (1 warning) ===
   ```

**Recommendation**: Create new `Smoketest-Matrix.ps1` to avoid disrupting existing Smoketest.ps1

### 4. Minor Path Fixes

#### orchestration-bridge/bridge.py
**File**: `apps/orchestration-bridge/bridge.py`
**Issue**: Line 49 - CODEX_SCRIPT path calculation
```python
# Line 49: Current
CODEX_SCRIPT = REPO_ROOT.parent / "AI-Orchestration" / "codex-multiagent-swarm" / "Orchestrate-Codex.ps1"

# Should be:
CODEX_SCRIPT = REPO_ROOT / "Orchestration" / "AI-Orchestration" / "codex-multiagent-swarm" / "Orchestrate-Codex.ps1"
```

**Reason**: CODEX_SCRIPT is looking one level above REPO_ROOT, should be within the repo structure.

## New Scripts to Create

### 1. Smoketest-Matrix.ps1
**Purpose**: Comprehensive smoke testing of all components
**Location**: `/Smoketest-Matrix.ps1` (root level)
**Features**:
- Structural validation
- Component-by-component build/health checks
- Integration tests
- Clear pass/fail/warn reporting

### 2. Start-Dashboard.ps1 (Optional - if renaming Start-WebUI.ps1)
**Purpose**: Launch dashboard specifically
**Location**: `/Start-Dashboard.ps1`
**Features**: Same as current Start-WebUI.ps1 but with correct paths

### 3. Start-Portal.ps1 (Optional)
**Purpose**: Launch Next.js portal specifically
**Location**: `/Start-Portal.ps1`
**Features**: Similar to Start-WebUI.ps1 but targets unifiedtoolbox.webapp

## Minimal Refactoring Proposals

### 1. Centralize Port Configuration
**Current State**: Ports scattered across scripts
**Proposal**: Create `.env.defaults` with standard ports:
```
API_PORT=8000
DASHBOARD_PORT=5173
PORTAL_PORT=3000
```

Each script sources these defaults but allows environment override.

**Benefit**: Single source of truth for ports, easier to change globally.

### 2. Add Parameter Switches to Launch.ps1
**Current State**: Launch.ps1 always starts everything
**Proposal**: Add switches:
```powershell
[switch]$BackendOnly    # Start only prompt-api
[switch]$FrontendOnly   # Start only dashboard
[switch]$SkipOrchestration  # Skip the orchestration run
```

**Benefit**: Mirrors launch.sh functionality, allows targeted launches.

### 3. Standardize Script Headers
**Proposal**: All root-level scripts should have consistent header format:
```powershell
<#
.SYNOPSIS
    [One-line description]

.DESCRIPTION
    [Detailed description including:]
    - What components it starts
    - What prerequisites are needed
    - What ports/URLs it binds to

.PARAMETER [name]
    [description]

.EXAMPLE
    [usage example]

.NOTES
    Prerequisites: [list]
    Starts: [component list with ports]
#>
```

**Benefit**: Consistency, self-documenting, easy to maintain.

## GeminiAIOrchestrator Directory

**Status**: Empty directory at `Orchestration/AI-Orchestration/GeminiAIOrchestrator`

**Options**:
1. **If archived/unused**: Move to `archive/2025-12-RepoCleanup/GeminiAIOrchestrator`
2. **If planned for future**: Add README.md explaining future intent
3. **If active elsewhere**: Document correct location

**Recommendation**: Add a README.md explaining status:
```markdown
# GeminiAIOrchestrator

This directory is reserved for future Gemini AI integration.

**Status**: Planned / Not Yet Implemented

See main orchestration at: Orchestration/AI-Orchestration/scripts/MilestoneController.ps1
```

## Summary of Changes

### Files to Modify
1. `/Start-WebUI.ps1` - Fix path from PromptWeb to dashboard **(CRITICAL)**
2. `/Launch.ps1` - Fix orchestration script path
3. `/Smoketest.ps1` - Enhance OR create Smoketest-Matrix.ps1
4. `apps/orchestration-bridge/bridge.py` - Fix CODEX_SCRIPT path

### Files to Create
1. `docs/WiringMatrix.md` - Complete component documentation (Phase 4)
2. `Smoketest-Matrix.ps1` - Comprehensive smoke testing (Phase 3)
3. `Orchestration/AI-Orchestration/GeminiAIOrchestrator/README.md` - Status doc

### Optional Enhancements
1. `.env.defaults` - Centralized port configuration
2. Launch.ps1 parameter switches
3. Standardized script headers

## Next Steps (Phase 3)

Once this plan is approved:
1. Apply fixes to Start-WebUI.ps1 (CRITICAL)
2. Apply fixes to Launch.ps1
3. Fix orchestration-bridge path
4. Create Smoketest-Matrix.ps1
5. Add GeminiAIOrchestrator README

Then proceed to Phase 4 (Documentation) and Phase 5 (Verification).

---

**End of Phase 2 Wiring Plan**
