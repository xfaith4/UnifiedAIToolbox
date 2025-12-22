# Phase 1 - Discovery Summary

## Overview
This document provides a comprehensive discovery summary of the UnifiedAIToolbox repository structure, focusing on identifying all active apps/services, their current build/run configurations, and any wiring issues.

## Root-Level Launch Scripts

### 1. **Launch.ps1**
- **Status**: ✅ EXISTS - Comprehensive
- **Purpose**: Main unified launcher for backend API + frontend dashboard + orchestration
- **Current Configuration**:
  - Backend: `Orchestration/UnifiedPromptApp/services/prompt-api/app.py` (FastAPI on port 8000)
  - Frontend: `apps/dashboard` (Vite on port 5173)
  - Orchestrator: References `MilestoneController.ps1`
- **Known Issues**:
  - ⚠️ Comments at line 6-10 still mention "dashboard" but implementation is correct
  - ⚠️ Line 219: References orchestration script at wrong path (should be in AI-Orchestration/scripts)

### 2. **Start-WebUI.ps1**
- **Status**: ❌ BROKEN PATH
- **Purpose**: Launch web interface with port management
- **Current Configuration**:
  - References `apps\PromptWeb` directory (LINE 35)
- **Known Issues**:
  - ❌ **CRITICAL**: References non-existent `apps\PromptWeb` directory
  - Should likely reference `apps/dashboard` or `apps/unifiedtoolbox.webapp`
  - Needs complete update to match actual app structure

### 3. **launch.sh**
- **Status**: ✅ COMPREHENSIVE - Well-structured
- **Purpose**: Universal launch script for Linux/macOS/WSL
- **Current Configuration**:
  - Starts prompt-api (FastAPI) on port 8000
  - Starts dashboard (Vite) on port 5173
  - Starts unifiedtoolbox.webapp (Next.js) on port 3000
  - Includes AI diagnostics and verification
- **Known Issues**: None - this is well-implemented

### 4. **Launch-Portal.bat**
- **Status**: ✅ EXISTS
- **Purpose**: Opens HTML launch portal in browser
- **Current Configuration**:
  - Opens `launch-portal.html`
  - Provides instructions for using other launch commands
- **Known Issues**: None

### 5. **Run-Prompt.ps1**
- **Status**: ✅ EXISTS - Interactive prompt runner
- **Purpose**: Interactive interface to discover and run prompts
- **Current Configuration**:
  - Uses PromptLibrary module from `modules\PromptLibrary\PromptLibrary.psd1`
  - Supports direct execution and codex-multiagent-swarm
- **Known Issues**: None apparent

### 6. **Smoketest.ps1**
- **Status**: ✅ EXISTS - Basic structure
- **Purpose**: Basic smoke testing
- **Current Configuration**:
  - Simple smoke test script from repo root
  - References examples.analytics prompt
- **Known Issues**:
  - ⚠️ Does NOT call Test-UatRepoHealth (which exists in external module)
  - ⚠️ Needs enhancement to test all major components

## Active Apps & Services

### 1. **apps/dashboard** (React/Vite Dashboard)
- **Status**: ✅ COMPLETE
- **Type**: React + Vite + TypeScript
- **Entry Point**: `src/main.tsx`
- **Build Command**: `npm run build`
- **Run/Dev Command**: `npm run dev` (Vite dev server)
- **Default Port**: 5173 (configurable via VITE_PORT)
- **Package.json Scripts**:
  - dev, build, preview, test, lint, format
- **Known Issues**: None - well-structured

### 2. **apps/unifiedtoolbox.webapp** (Next.js Web Portal)
- **Status**: ✅ COMPLETE
- **Type**: Next.js + React + TypeScript
- **Entry Point**: Next.js app router
- **Build Command**: `npm run build`
- **Run/Dev Command**: `npm run dev`
- **Default Port**: 3000 (configurable via PORT)
- **Package.json Scripts**:
  - dev, build, start, lint, test
- **Known Issues**: None - well-structured

### 3. **apps/OrchestrationDesktop** (WPF Desktop App)
- **Status**: ✅ COMPLETE
- **Type**: .NET 8 WPF Application
- **Entry Point**: `App.xaml.cs`
- **Project File**: `OrchestrationDesktop.csproj`
- **Build Command**: `dotnet build OrchestrationDesktop.csproj`
- **Run Command**: `dotnet run --project OrchestrationDesktop.csproj`
- **Executable**: After build, in `bin/Debug/net8.0-windows/`
- **Dependencies**:
  - Microsoft.PowerShell.SDK 7.4.2
  - YamlDotNet 13.7.1
- **Known Issues**: None - properly configured

### 4. **apps/OrchestrationDesktopLauncher** (Simple Launcher)
- **Status**: ✅ COMPLETE (Minimal)
- **Type**: .NET 8 Console/WinExe
- **Project File**: `OrchestrationDesktopLauncher.csproj`
- **Build Command**: `dotnet build OrchestrationDesktopLauncher.csproj`
- **Run Command**: `dotnet run --project OrchestrationDesktopLauncher.csproj`
- **Purpose**: Appears to be a lightweight launcher for OrchestrationDesktop
- **Known Issues**: None - minimal but functional

### 5. **apps/PromptRefiner** (PowerShell Refinement Tool)
- **Status**: ✅ COMPLETE
- **Type**: PowerShell Scripts + Optional WPF UI
- **Entry Points**:
  - `OpenAI_Refiner.ps1` (CLI version)
  - `OpenAI_Refiner.Wpf.ps1` (WPF GUI version)
- **Run Command (CLI)**: `pwsh -File OpenAI_Refiner.ps1`
- **Run Command (GUI)**: `pwsh -NoProfile -sta -File OpenAI_Refiner.Wpf.ps1`
- **Requirements**: ImportExcel module, OpenAI API key
- **Known Issues**: None - well-documented

### 6. **apps/orchestration-bridge** (Python Orchestration Bridge)
- **Status**: ✅ COMPLETE
- **Type**: Python CLI Tool
- **Entry Point**: `bridge.py`
- **Run Command**: `python bridge.py [args]`
- **Purpose**: Lightweight orchestration bridge connecting prompt registry to orchestration workflows
- **Dependencies**: References prompt-registry package
- **Known Issues**:
  - ⚠️ Line 49: References CODEX_SCRIPT at wrong parent path level

## Orchestration Components

### 1. **Orchestration/MilestoneController.ps1** (Dispatcher)
- **Status**: ✅ COMPLETE - Dispatcher only
- **Purpose**: Dispatches to inner orchestrator
- **Actual Script**: `Orchestration/AI-Orchestration/scripts/MilestoneController.ps1`
- **Known Issues**: None - correct dispatcher pattern

### 2. **Orchestration/UnifiedPromptApp** (FastAPI Backend)
- **Status**: ✅ COMPLETE
- **Type**: FastAPI + Python
- **Entry Point**: `services/prompt-api/app.py`
- **Build Command**: Setup venv + `pip install -r requirements.txt`
- **Run Command**: `uvicorn app:app --host 0.0.0.0 --port 8000`
- **Default Port**: 8000
- **Requirements**: Python 3.12+, FastAPI, uvicorn
- **Known Issues**: None - well-structured

### 3. **Orchestration/AI-Orchestration/scripts/MilestoneController.ps1** (Main Orchestrator)
- **Status**: ✅ EXISTS
- **Purpose**: Main orchestration controller
- **Known Issues**: Need to verify this is the correct active version

### 4. **Orchestration/AI-Orchestration/codex-multiagent-swarm**
- **Status**: ✅ EXISTS
- **Entry Point**: `Orchestrate-Codex.ps1`
- **Purpose**: Multi-agent code review system
- **Known Issues**: None apparent

### 5. **Orchestration/AI-Orchestration/GeminiAIOrchestrator**
- **Status**: ❌ EMPTY DIRECTORY
- **Known Issues**: Directory exists but is empty

## Supporting Infrastructure

### 1. **modules/PromptLibrary**
- **Status**: ✅ COMPLETE
- **Type**: PowerShell Module
- **Entry Point**: `PromptLibrary.psd1`
- **Purpose**: Prompt management and orchestration
- **Known Issues**: None

### 2. **scripts/verify-launch.py**
- **Status**: ✅ COMPLETE
- **Purpose**: Verification script for launch.sh
- **Functionality**:
  - Verifies API health endpoint
  - Checks frontend and web portal
  - Triggers orchestrator POST test
- **Known Issues**: None - well-implemented

### 3. **docs directory**
- **Status**: ✅ EXISTS with various docs
- **Missing**: WiringMatrix.md (to be created)

## Summary of Issues Found

### Critical Issues
1. ❌ **Start-WebUI.ps1**: References non-existent `apps\PromptWeb` directory
2. ❌ **GeminiAIOrchestrator**: Empty directory - unclear if intentional

### Warnings
1. ⚠️ **Launch.ps1** line 219: References orchestration script at potentially wrong path
2. ⚠️ **orchestration-bridge/bridge.py** line 49: CODEX_SCRIPT path may need adjustment
3. ⚠️ **Smoketest.ps1**: Needs enhancement to test all components
4. ⚠️ **Smoketest.ps1**: Should call Test-UatRepoHealth if available

### Documentation Gaps
1. ⚠️ No `docs/WiringMatrix.md` document
2. ⚠️ No comprehensive smoke test matrix

## Recommendations for Phase 2

1. **Fix Start-WebUI.ps1** to reference correct app (dashboard or webapp)
2. **Create comprehensive WiringMatrix.md** documenting all components
3. **Enhance Smoketest.ps1** to test all major components
4. **Verify orchestration script paths** in Launch.ps1 and bridge.py
5. **Clarify GeminiAIOrchestrator** status (remove if archived, document if active)
6. **Add Test-UatRepoHealth integration** (or document that it's external)

## Component Matrix (Preview)

| Component | Type | Root Path | Entry File | Build Cmd | Run Cmd | URL/Port | Status |
|-----------|------|-----------|------------|-----------|---------|----------|--------|
| dashboard | React/Vite | apps/dashboard | src/main.tsx | npm run build | npm run dev | :5173 | ✅ Complete |
| unifiedtoolbox.webapp | Next.js | apps/unifiedtoolbox.webapp | app router | npm run build | npm run dev | :3000 | ✅ Complete |
| OrchestrationDesktop | WPF/.NET 8 | apps/OrchestrationDesktop | App.xaml.cs | dotnet build | dotnet run | Desktop | ✅ Complete |
| OrchestrationDesktopLauncher | .NET 8 | apps/OrchestrationDesktopLauncher | Program.cs | dotnet build | dotnet run | Desktop | ✅ Complete |
| PromptRefiner | PowerShell | apps/PromptRefiner | OpenAI_Refiner.ps1 | N/A | pwsh -File | CLI/GUI | ✅ Complete |
| orchestration-bridge | Python | apps/orchestration-bridge | bridge.py | N/A | python bridge.py | CLI | ✅ Complete |
| prompt-api | FastAPI | Orchestration/.../prompt-api | app.py | pip install | uvicorn app:app | :8000 | ✅ Complete |
| MilestoneController | PowerShell | Orchestration/AI-Orchestration/scripts | MilestoneController.ps1 | N/A | pwsh -File | CLI | ✅ Complete |
| codex-multiagent-swarm | PowerShell | Orchestration/AI-Orchestration | Orchestrate-Codex.ps1 | N/A | pwsh -File | CLI | ✅ Complete |

---

**End of Phase 1 Discovery Summary**
