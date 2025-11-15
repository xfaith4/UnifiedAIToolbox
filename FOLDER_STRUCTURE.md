# UnifiedAIToolbox Folder Structure

This document describes the consolidated folder structure of the UnifiedAIToolbox repository.

## Overview

The repository has been reorganized to eliminate duplications, reduce nesting, and create a more intuitive structure. All applications, services, and packages are now organized at the top level for easy navigation.

## Top-Level Directories

### Applications (`apps/`)

All user-facing applications are consolidated here:

- **`desktop/`** - WPF OrchestrationDesktop application
  - Main desktop application for orchestration workflows
  - Validates repos, runs PowerShell scripts, surfaces logs
  - Built with .NET 8 and WPF

- **`desktop-launcher/`** - Desktop launcher utility
  - Simple launcher for the desktop application

- **`web/`** - Next.js web application
  - Main web interface for the unified toolbox
  - Built with Next.js 16, React 19, Material-UI

- **`dashboard/`** - React/Vite prompt dashboard
  - Interactive dashboard for managing prompts and orchestration
  - Built with React 18, Vite, TypeScript
  - Communicates with the prompt-api service
  - Formerly located at `Orchestration/UnifiedPromptApp/apps/prompt-hub/`

- **`prompt-workbench/`** - Streamlit prompt development UI
  - Streamlit-based interface for prompt development
  - Power BI connector support

- **`orchestration-bridge/`** - Orchestration automation jobs
  - Connects AI orchestration with the registry
  - Bridge between different orchestration systems

- **`data-exploration/`** - Data exploration tools
  - Tools for exploring and analyzing data

- **`sensor-monitor/`** - Sensor monitoring application
  - Monitoring and telemetry for sensor data

### Services (`services/`)

Backend services:

- **`prompt-api/`** - FastAPI service
  - RESTful API for prompt CRUD operations
  - Render, refiner, and orchestration endpoints
  - Python-based with FastAPI framework
  - Formerly located at `Orchestration/UnifiedPromptApp/services/prompt-api/`

### Packages (`packages/`)

Shared packages and libraries:

- **`prompt-registry/`** - YAML schema and validation
  - Canonical YAML schema for prompts
  - Validation and render helpers
  - Python + PowerShell facades
  - Migration utilities for legacy prompts

- **`prompt-cli/`** - CLI tools
  - PowerShell and Node.js CLI tools
  - Local scripting utilities

### Modules (`modules/`)

PowerShell modules:

- **`PromptLibrary/`** - PowerShell prompt module
  - Loads prompts and agents from `data/`
  - Renders templates
  - Writes artifacts to build outputs
  - Version 0.1.0

### Data (`data/`)

Source of truth for prompts and configuration:

- **`agents/`** - Agent definitions
  - `Agents.json` - Agent configurations (Researcher, Engineer, Critic, etc.)
  - `researcher.yaml` - YAML agent definitions

- **`prompts/`** - Prompt definitions
  - YAML prompt definitions
  - Template files

- **`sqlite/`** - SQLite databases
  - Database files (gitignored)

### Documentation (`docs/`)

All documentation consolidated here:

- **`architecture/`** - Architecture documentation
  - System design documents
  - Architecture diagrams and specifications
  - Moved from `project files/`

- **`branding/`** - Branding assets
  - Brand guidelines
  - Design tokens
  - Moved from `project files/branding/`

- **`engine/`** - Engine schema documentation
  - DAG types and schemas
  - Manifest definitions
  - Moved from `project files/engine/`

- **`consolidation/`** - Consolidation guides
  - Project inventory
  - Canonical schema documentation
  - Migration status and guides
  - Moved from `Orchestration/UnifiedPromptApp/docs/`

- **`legacy/`** - Archived legacy code
  - `Prompt Library Projects/` - Original prompt service and library
  - `UnifiedPromptApp/` - Old unified app structure
  - `DataExtraction/` - Data extraction utilities
  - `Sensor-Reward-Framework/` - Sensor framework code

### Scripts (`scripts/`)

Utility and orchestration scripts:

- `Unified-Orchestration.ps1` - Main orchestration script
- `AdvancedImageAnalysis.ps1` - Image analysis utilities
- `FirstRoundAutomationPrompting.ps1` - Automation prompting
- `Start-DataExplorationForm.ps1` - Data exploration launcher
- Various other PowerShell utility scripts

### Tests (`tests/`)

Test suites and validation:

- PowerShell Pester tests
- Schema validation tests
- Smoke tests

### Tools (`tools/`)

Shared development tooling:

- Formatters
- Schema generators
- CI/CD scripts
- Validation utilities

### Build Outputs (`build/`)

Build artifacts and outputs (gitignored):

- **`artifacts/`** - Generated artifacts
- **`runs/`** - Execution run outputs

## Key Changes from Previous Structure

### Eliminated Duplications

1. **Removed duplicate dashboards:**
   - Deleted `project files/dashboard/` (older version)
   - Kept consolidated `apps/dashboard/` (formerly `prompt-hub`)

2. **Removed duplicate PromptLibrary locations:**
   - Deleted empty `Orchestration/UnifiedPromptApp/packages/PromptLibrary/`
   - Kept active `modules/PromptLibrary/`

3. **Consolidated duplicate data files:**
   - Removed `data/agents/Agents2.json`
   - Single source of truth in `data/agents/Agents.json`

### Flattened Hierarchy

1. **Removed deeply nested structure:**
   - `Orchestration/UnifiedPromptApp/apps/` → `apps/`
   - `Orchestration/UnifiedPromptApp/services/` → `services/`
   - `Orchestration/UnifiedPromptApp/packages/` → `packages/`

2. **Eliminated ambiguous directories:**
   - Removed `project files/` directory
   - Contents moved to appropriate top-level locations

3. **Removed entire `Orchestration/` directory:**
   - Legacy code archived to `docs/legacy/`
   - Active code moved to appropriate top-level directories

### Renamed for Consistency

- `apps/OrchestrationDesktop` → `apps/desktop`
- `apps/OrchestrationDesktopLauncher` → `apps/desktop-launcher`
- `apps/unifiedtoolbox.webapp` → `apps/web`
- `apps/prompt-hub` → `apps/dashboard`

## Updated Configuration Files

All configuration files have been updated to reflect the new structure:

- `UnifiedAIToolbox.sln` - Visual Studio solution file
- `Launch-Toolbox.bat` - Desktop launcher
- `LaunchUnifiedToolbox.ps1` - Unified toolbox launcher
- `.gitignore` - Added build output directories
- `README.md` - Updated with new structure

## Launcher Scripts

### Root Level

- `LaunchUnifiedToolbox.ps1` - Launches the complete stack
  - FastAPI Prompt API (port 8000)
  - React/Vite Dashboard (port 5173)
  - Optional: Streamlit Workbench (use `-EnableStreamlit`)

- `LaunchUnifiedDashboard.bat` - Simple dashboard launcher

- `Launch-Toolbox.bat` - Desktop application launcher

- `Start-WebUI.ps1` - Web UI launcher with port management

## Navigation Guide

### To work on the desktop application:
```
cd apps/desktop
# Open OrchestrationDesktop.csproj in Visual Studio
```

### To work on the web dashboard:
```
cd apps/dashboard
npm install
npm run dev
```

### To work on the Next.js web app:
```
cd apps/web
npm install
npm run dev
```

### To work on the prompt API:
```
cd services/prompt-api
pip install -r requirements.txt
python app.py
```

### To work with PowerShell module:
```
cd modules/PromptLibrary
# Import-Module ./PromptLibrary.psd1
```

## Benefits of New Structure

1. **Clearer Organization** - Applications, services, and packages are clearly separated
2. **No Duplications** - Single source of truth for all components
3. **Flat Hierarchy** - Easier navigation without deeply nested directories
4. **Consistent Naming** - All directories follow a consistent naming convention
5. **Easier Onboarding** - New developers can quickly understand the repository structure
6. **Better Maintainability** - Reduced complexity makes maintenance easier

## Migration Notes

- All git history has been preserved through `git mv` operations
- Legacy code is archived in `docs/legacy/` for reference
- All launcher scripts have been updated and tested
- Build outputs are now properly gitignored

## Questions?

If you have questions about where something should go or need to add new components, follow these guidelines:

- User-facing applications → `apps/`
- Backend services → `services/`
- Shared libraries → `packages/`
- PowerShell modules → `modules/`
- Documentation → `docs/`
- Data and configuration → `data/`
- Utility scripts → `scripts/`
- Build outputs → `build/` (gitignored)
