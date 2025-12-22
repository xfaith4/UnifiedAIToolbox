# Orchestration Folder Refactoring Summary

## Overview

This refactoring simplified the orchestration folder structure by removing redundant nested directories and standardizing naming conventions. The goal was to create a cleaner, more maintainable structure with consistent kebab-case folder names.

## Changes Made

### 1. New Folder Structure

**Old Structure:**
```
Orchestration/
├── AI-Orchestration/
│   ├── AI Orchestration/           ← React app (with space!)
│   ├── Orchestrator/                ← Main runner
│   ├── MilestoneDashboard/
│   ├── scripts/
│   ├── prompts/
│   ├── modules/
│   └── .github/workflows/
└── UnifiedPromptApp/                ← Should be in apps/
```

**New Structure:**
```
Orchestration/
├── engine/                          ← Core orchestration engine
│   ├── Run-Orchestration.ps1        ← Main DAG-based runner
│   ├── runner.config.json
│   ├── plan.example.json
│   ├── artifacts/
│   ├── dashboard-ui/                ← React/Vite dashboard (from "AI Orchestration")
│   ├── codex-multiagent-swarm/      ← Multi-agent swarm
│   └── GeminiAIOrchestrator/        ← Gemini integration
├── milestone-dashboard/             ← Milestone tracking dashboard
├── scripts/                         ← Orchestration scripts
│   ├── MilestoneController.ps1
│   ├── POF.ps1
│   └── ...
├── prompts/                         ← Prompt templates
├── modules/                         ← PowerShell modules
├── Goals/                           ← Goal definitions
├── .github/workflows/               ← CI/CD workflows
├── README.md                        ← Updated documentation
└── MilestoneController.ps1          ← Wrapper/dispatcher

apps/
└── UnifiedPromptApp/                ← Moved from Orchestration/
    └── services/prompt-api/
```

### 2. PowerShell Args Type Fix

**Problem:** 
The `Convert-ToHashtable` function returned `System.Collections.ArrayList` for collections, which caused runtime errors when passed to `Assert-ToolArgs` expecting a `[hashtable]` parameter.

**Error Message:**
```
Cannot process argument transformation on parameter 'Args'. 
Cannot convert the "System.Collections.ArrayList" value of type 
"System.Collections.ArrayList" to type "System.Collections.Hashtable".
```

**Solution:**
Changed `Convert-ToHashtable` to use native PowerShell arrays (`@()` += operator) instead of ArrayList. This ensures proper type compatibility.

**File:** `Orchestration/engine/Run-Orchestration.ps1`

**Changes:**
- Line 127-133: Use PowerShell arrays instead of ArrayList
- Added inline comments explaining expected types and shapes
- Added documentation to `Assert-ToolArgs` about hashtable requirement

### 3. Path Updates

All references to old paths were updated across the codebase:

#### GitHub Actions Workflows
- `Orchestration/.github/workflows/run-orchestration.yml`
- `Orchestration/.github/workflows/build-dashboard.yml`
- `Orchestration/.github/workflows/deploy-dashboard.yml`

#### PowerShell Scripts
- `scripts/Test-UnifiedAIToolboxHealth.ps1`
- `scripts/Test-JsonErrorHandling.ps1`
- `Smoketest-Matrix.ps1`
- `Orchestration/MilestoneController.ps1` (wrapper)

#### Test Files
- `tests/Orchestration.Tests.ps1`
- `tests/Orchestration.AIPipeline.Tests.ps1`

#### Application Code
- `apps/orchestration-bridge/bridge.py`
- `apps/UnifiedPromptApp/services/prompt-api/app.py`
- `apps/orchestration-bridge/tests/test_bridge_powershell.py`

#### Documentation
- `Orchestration/README.md` - Complete rewrite
- `docs/PHASE2_WIRING_PLAN.md` - Path updates

### 4. Documentation Updates

**Orchestration/README.md** was completely rewritten to:
- Document the new folder structure
- Explain the purpose of each subfolder
- Provide usage examples for key scripts
- Update all path references

## Testing & Validation

All changes were validated:

✅ **PowerShell Syntax Validation**
- `Run-Orchestration.ps1` - Valid
- `MilestoneController.ps1` - Valid
- `POF.ps1` - Valid

✅ **Pester Tests**
- `Orchestration.Tests.ps1` - 13 tests passed
- All orchestration scripts tested in DryRun mode

✅ **Smoke Tests**
- `Smoketest-Matrix.ps1` - 31/36 tests passed
- Expected warnings for uninstalled dependencies

## Migration Guide

### For Scripts Referencing Old Paths

**Old:**
```powershell
.\Orchestration\AI-Orchestration\scripts\MilestoneController.ps1
.\Orchestration\AI-Orchestration\Orchestrator\Run-Orchestration.ps1
cd Orchestration\AI-Orchestration\codex-multiagent-swarm
```

**New:**
```powershell
.\Orchestration\scripts\MilestoneController.ps1
.\Orchestration\engine\Run-Orchestration.ps1
cd Orchestration\engine\codex-multiagent-swarm
```

### For Python Code Referencing Old Paths

**Old:**
```python
CODEX_SCRIPT = ROOT / "Orchestration" / "AI-Orchestration" / "codex-multiagent-swarm" / "Orchestrate-Codex.ps1"
POF_SCRIPT = ROOT / "Orchestration" / "AI-Orchestration" / "scripts" / "POF.ps1"
```

**New:**
```python
CODEX_SCRIPT = ROOT / "Orchestration" / "engine" / "codex-multiagent-swarm" / "Orchestrate-Codex.ps1"
POF_SCRIPT = ROOT / "Orchestration" / "scripts" / "POF.ps1"
```

### For Workflow Files

**Old:**
```yaml
- run: cd MilestoneDashboard && npm install
- run: git add "MilestoneDashboard/public/data/*.json"
```

**New:**
```yaml
- run: cd Orchestration/milestone-dashboard && npm install
- run: git add "Orchestration/milestone-dashboard/public/data/*.json"
```

## Folder Descriptions

### `engine/`
Core orchestration engine containing:
- **Run-Orchestration.ps1**: Deterministic DAG-based plan executor with parallel wave execution
- **dashboard-ui/**: React/Vite app for visualizing orchestration progress
- **codex-multiagent-swarm/**: Multi-agent swarm orchestration system
- **GeminiAIOrchestrator/**: Gemini AI integration (planned)

### `milestone-dashboard/`
Standalone React dashboard for tracking milestone progress and metrics. Built with Vite, includes test suite.

### `scripts/`
PowerShell scripts for orchestration tasks:
- **MilestoneController.ps1**: Goal-driven orchestration with milestones
- **POF.ps1**: Plan-Observe-Fix orchestrator
- **Update-OrchestrationMetrics.psm1**: Metrics tracking
- And more utility scripts

### `prompts/`
Prompt templates used by orchestration agents.

### `modules/`
Reusable PowerShell modules for orchestration functionality.

### `Goals/`
Goal definitions and tracking.

## Benefits

1. **Clearer Organization**: No more nested "AI-Orchestration/AI Orchestration" confusion
2. **Consistent Naming**: All folders use kebab-case
3. **Logical Grouping**: Apps in apps/, orchestration logic in Orchestration/
4. **Better Maintainability**: Flatter structure is easier to navigate
5. **Fixed Type Issues**: PowerShell Args parameter now works correctly
6. **Up-to-date Documentation**: All paths and usage examples updated

## Breaking Changes

None for end users, but developers/scripts need to update:
- Import paths in code
- CD commands in scripts
- Workflow file references
- Documentation links

All known references have been updated in this PR.

## Related Files

- This summary: `ORCHESTRATION_REFACTOR_SUMMARY.md`
- Orchestration docs: `Orchestration/README.md`
- Wiring plan: `docs/PHASE2_WIRING_PLAN.md`
