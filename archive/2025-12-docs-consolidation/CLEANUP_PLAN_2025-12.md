# Repository Cleanup Plan - December 2025

**Created:** 2025-12-04  
**Status:** AWAITING APPROVAL  

---

## 📋 Executive Summary

This document proposes a safe, non-destructive cleanup of the UnifiedAIToolbox repository. The goal is to:

1. **Preserve all active, working code** in its current location
2. **Archive obsolete, duplicate, or experimental code** in a structured archive
3. **Document all changes** in a comprehensive manifest
4. **Create clear documentation** explaining the repository structure

**NO FILES WILL BE DELETED.** All moves are reversible by moving files back from the archive.

---

## 🎯 Phase 0: Reconnaissance Results

### Active Applications & Infrastructure

**KEEP-AS-IS** - These are actively referenced and working:

#### Core Applications (apps/)
- ✅ **apps/dashboard** - React/Vite web dashboard (referenced by Launch.ps1, launch.sh)
- ✅ **apps/unifiedtoolbox.webapp** - Next.js web portal (referenced by launch.sh)
- ✅ **apps/OrchestrationDesktop** - WPF desktop application (in UnifiedAIToolbox.sln)
- ✅ **apps/OrchestrationDesktopLauncher** - C# launcher (in UnifiedAIToolbox.sln)
- ✅ **apps/PromptRefiner** - Prompt refinement tools
- ✅ **apps/orchestration-bridge** - Python orchestration bridge (active Python code)

#### Core Infrastructure
- ✅ **Orchestration/MilestoneController.ps1** - Dispatcher script (referenced by Launch.ps1)
- ✅ **Orchestration/UnifiedPromptApp/** - Active prompt API service
- ✅ **Orchestration/AI-Orchestration/** - Core orchestration engine
- ✅ **modules/PromptLibrary/** - PowerShell shared modules
- ✅ **scripts/** - Operational scripts
- ✅ **tests/** - Test suite
- ✅ **docs/** - Documentation
- ✅ **data/** - Active data directory (agents, prompts, sqlite)
- ✅ **packages/prompt-registry/** - Active Python package
- ✅ **examples/** - Example scripts

#### Root-Level Active Files
- ✅ **Launch.ps1** - Primary Windows launcher
- ✅ **launch.sh** - Primary Unix/Linux launcher
- ✅ **Run-Prompt.ps1** - Prompt execution script
- ✅ **Smoketest.ps1** - Smoke testing script
- ✅ **Start-WebUI.ps1** - WebUI launcher
- ✅ **Create-Shortcut.ps1** - Shortcut creation utility
- ✅ **fix-pwsh.ps1** - PowerShell fix script
- ✅ **UnifiedAIToolbox.sln** - Main Visual Studio solution
- ✅ **README.md, CONTRIBUTING.md** - Documentation
- ✅ **docker-compose.yml, docker-compose.phase3.yml** - Active Docker configs
- ✅ **.github/** - GitHub Actions workflows (DO NOT TOUCH)
- ✅ **.gitignore, .gitattributes** - Git configuration (DO NOT TOUCH)

### Existing Archive Structure

Already archived (no action needed):
- archive/apps-web-legacy (superseded by unifiedtoolbox.webapp)
- archive/project-dashboard-legacy (superseded by apps/dashboard)
- archive/project-management (old project management docs)

---

## 🗂️ Phase 1: Proposed Cleanup Actions

### Archive Root Structure

**Create:** `archive/2025-12-RepoCleanup/`

Subdirectories:
- `archive/2025-12-RepoCleanup/old-scripts/` - Superseded or duplicate scripts
- `archive/2025-12-RepoCleanup/old-apps/` - Deprecated application components  
- `archive/2025-12-RepoCleanup/reference-docs/` - Reference documentation not actively used
- `archive/2025-12-RepoCleanup/legacy-experiments/` - Experimental code clusters
- `archive/2025-12-RepoCleanup/needs-review/` - Items requiring manual decision

---

### Summary: Items Proposed for Archive

**Total items to archive:** ~14 files/directories  
**Estimated disk space:** ~50-100 MB (mostly documentation)

**Categories:**
- 1 old script (launchOLD.sh)
- 7 reference documents (DOCX, PDF, images)
- 2 app component directories (engine/, dashboard/ under project files)
- 1 experimental directory (3rdPartyTools/)
- 3 items needing manual review

---

### Proposed Archival Actions

#### 1. OLD-SCRIPTS: Superseded Launch Scripts

**Archive:** Root-level superseded scripts

| Original Path | New Archive Path | Reason | Risk Level |
|--------------|------------------|--------|------------|
| `launchOLD.sh` | `old-scripts/launchOLD.sh` | Superseded by `launch.sh` (name clearly indicates it's old) | ✅ LOW - No references found |

**✅ VERIFICATION COMPLETE - DO NOT ARCHIVE:**

| Path | Status | Reason |
|------|--------|--------|
| `Launch-Portal.bat` | ✅ **KEEP** | Referenced in docs/help/launch-guide.md and archive/project-management/ docs as documented launch method |
| `launch-portal.html` | ✅ **KEEP** | Referenced in docs/help/launch-guide.md and quick-start.md as visual interface for launching services |

**Decision:**
- **launchOLD.sh**: SAFE TO ARCHIVE (clearly marked as old, no references)
- **Launch-Portal.bat**: KEEP IN PLACE (documented feature)
- **launch-portal.html**: KEEP IN PLACE (documented visual interface)

#### 2. REFERENCE-DOCS: Project Documentation Archive

**Archive:** Documentation that's referenced but not actively used for development

| Original Path | New Archive Path | Reason | Risk Level |
|--------------|------------------|--------|------------|
| `project files/AI Orchestrator.docx` | `reference-docs/AI-Orchestrator.docx` | Referenced by docs but static reference material | ✅ LOW - Static reference |
| `project files/Ai Orchestrator – Readme + Architecture + Delivery Checklist.docx` | `reference-docs/AI-Orchestrator-Architecture.docx` | Referenced by docs but static reference material | ✅ LOW - Static reference |
| `project files/Ai Orchestrator – Readme + Architecture + Delivery Checklist.pdf` | `reference-docs/AI-Orchestrator-Architecture.pdf` | PDF duplicate of above | ✅ LOW - Static reference |
| `project files/ai_orchestrator_readme_architecture_delivery_checklist (1).md` | `reference-docs/ai-orchestrator-architecture-v1.md` | Markdown version, likely extracted from DOCX | ✅ LOW - Static reference |
| `project files/Code Orchestration Tool (Agents Definitions).txt` | `reference-docs/Agent-Definitions.txt` | Text file with agent definitions | ✅ LOW - Static reference |
| `project files/AgenticAIOrchestrator.jpg` | `reference-docs/AgenticAIOrchestrator.jpg` | Architecture diagram | ✅ LOW - Static reference |
| `project files/AgenticAIOrchestrator.png` | `reference-docs/AgenticAIOrchestrator.png` | Architecture diagram (duplicate format) | ✅ LOW - Static reference |

**After archiving these files, UPDATE references in:**
- `IMPLEMENTATION_SUMMARY.md` - Update paths to point to new archive location
- `docs/ORCHESTRATOR_STATUS.md` - Update paths
- `docs/ORCHESTRATOR_ENHANCEMENTS.md` - Update paths

#### 3. LEGACY-EXPERIMENTS: 3rdPartyTools ONLY

**Archive:** Experimental or third-party integration code

| Original Path | New Archive Path | Reason | Risk Level |
|--------------|------------------|--------|------------|
| `Orchestration/3rdPartyTools/` (entire directory) | `legacy-experiments/3rdPartyTools/` | Documented as removed in PROMPT_LIBRARY_CONSOLIDATION.md but still present | ✅ LOW - Already documented as obsolete |

**✅ VERIFICATION COMPLETE - DO NOT ARCHIVE:**

| Path | Status | Reason |
|------|--------|--------|
| `Orchestration/AI-Orchestration/codex-multiagent-swarm/` | ✅ **ACTIVE - KEEP** | Referenced extensively in bridge.py, app.py, tests, and multiple PowerShell modules. Contains active Orchestrate-Codex.ps1 script. |
| `Orchestration/AI-Orchestration/GeminiAIOrchestrator/` | ⚠️ **UNCLEAR** | No direct code references found, but client_secret in runs/ is for "gemini-agentic-ai-orchestrator" project. May be experimental TypeScript app. |
| `Orchestration/AI-Orchestration/AI-Agent-Communication/` | ⚠️ **UNCLEAR** | No references found in active code. Likely experimental but needs manual review. |

**Decision:**
- **codex-multiagent-swarm**: KEEP IN PLACE (actively used)
- **GeminiAIOrchestrator**: KEEP IN PLACE until manual review (connected to OAuth config)
- **AI-Agent-Communication**: Propose for archive after manual verification

#### 4. NEEDS-REVIEW: Security and Organizational Items

**These items should be manually reviewed before any action:**

| Original Path | Proposed Action | Reason | Risk Level |
|--------------|-----------------|--------|------------|
| `runs/client_secret_865636458145-*.json` | Move to secure location or .env | OAuth secret file exposed in repository (SECURITY CONCERN) | 🔴 HIGH - Contains sensitive data |
| `runs/repository-open-graph-template (1).png` | Move to `needs-review/` | Image file in wrong directory | ✅ LOW - Appears misplaced |
| `Orchestration/AI-Orchestration/GeminiAIOrchestrator/` | Manual review | TypeScript app with associated OAuth config | ⚠️ MEDIUM - May be planned feature |
| `Orchestration/AI-Orchestration/AI-Agent-Communication/` | Move to `needs-review/` | No references found | ⚠️ MEDIUM - May be experimental |

**IMPORTANT - Security Concern:**
The `client_secret` file contains OAuth credentials and should NOT be in the repository. Recommended actions:
1. Move to `.env` file or secure credential store
2. Add to `.gitignore` 
3. Rotate the secret if the repository is public
4. Update any code that references it to use environment variables

#### 5. OLD-APPS: Duplicate Dashboard Components

**Archive:** Duplicate or superseded app components

| Original Path | New Archive Path | Reason | Risk Level |
|--------------|------------------|--------|------------|
| `project files/dashboard/` | `old-apps/project-files-dashboard/` | Superseded by apps/dashboard, mentioned in archive/project-management/ProjectPlan.md as legacy | ⚠️ MEDIUM - Verify no active references |
| `project files/engine/` | `old-apps/project-files-engine/` | Unclear if this DAG builder is still in use | ⚠️ HIGH - Contains TypeScript and PowerShell code |

**Verification Required - CRITICAL:**
- Search for any imports or references to `project files/engine/` in active code
- Search for any references to `project files/dashboard/` 
- Check if DagBuilder.psm1 is imported anywhere
- If engine/ is actively used, it should remain or be promoted to a proper location

#### 6. KEEP-BUT-REVIEW: Branding Assets

**KEEP FOR NOW** - May want to organize differently later:

| Current Path | Recommendation | Reason |
|-------------|----------------|---------|
| `project files/branding/` | Keep in place for now | Contains active branding assets (logos, favicon, icons) that may be referenced by apps |

**Future Action:**
- Consider moving to a more conventional location like `assets/branding/` or `docs/branding/`
- But this requires checking all app references first

---

## ⚠️ HIGH-RISK ITEMS REQUIRING DETAILED VERIFICATION

These items should NOT be archived without explicit verification:

### 1. Orchestration/AI-Orchestration Structure

The `Orchestration/AI-Orchestration/` directory contains:
- Multiple MilestoneController.ps1 files (dispatcher pattern)
- Active TypeScript/React app (`AI Orchestration/`)
- MilestoneDashboard (Vite/React app)
- Scripts directory with orchestration logic
- Multiple sub-experiments (GeminiAIOrchestrator, AI-Agent-Communication, codex-multiagent-swarm)

**Action:** 
- Keep the core structure intact
- Only archive obviously experimental subdirectories after verification
- The main `AI Orchestration/` and `MilestoneDashboard/` apps appear active

### 2. project files/engine/

Contains DAG builder and schema files:
- `DagBuilder.psm1` - PowerShell module
- TypeScript type definitions
- JSON schemas

**Action:**
- Must verify if this is imported by any orchestration code
- If active, should be promoted to proper location (e.g., `modules/DagBuilder/`)
- Only archive if completely unused

### 3. Root-level *.ps1 files

All root-level PowerShell scripts appear to be active entry points:
- Launch.ps1 ✅ Active
- Run-Prompt.ps1 ✅ Active
- Smoketest.ps1 ✅ Active
- Start-WebUI.ps1 ✅ Active
- Create-Shortcut.ps1 ✅ Active
- fix-pwsh.ps1 ✅ Active

**Action:** Keep all in place

---

## 🔍 Verification Results Summary

**Completed automated verification checks:**

### ✅ Safe to Archive (Low Risk)
1. `launchOLD.sh` - No references found, clearly marked as old
2. `project files/engine/` - DagBuilder.psm1 not imported anywhere
3. `project files/dashboard/` - Superseded by apps/dashboard (documented in archive/project-management)
4. `Orchestration/3rdPartyTools/` - Documented as removed in PROMPT_LIBRARY_CONSOLIDATION.md
5. Reference documentation (DOCX/PDF files) - Static reference material

### ✅ Must Keep (Active Code)
1. `codex-multiagent-swarm/` - **CRITICAL:** Actively used by bridge.py, app.py, tests, and modules
2. `Launch-Portal.bat` and `launch-portal.html` - Documented features referenced in help docs
3. All root-level PowerShell scripts - Active entry points
4. All apps/ directories - Active applications

### ⚠️ Needs Manual Review
1. `Orchestration/AI-Orchestration/GeminiAIOrchestrator/` - TypeScript app, OAuth config exists but no code references
2. `Orchestration/AI-Orchestration/AI-Agent-Communication/` - No references found, likely experimental
3. `runs/client_secret_*.json` - OAuth secret in wrong location (security concern)
4. `runs/repository-open-graph-template (1).png` - Image file in wrong directory
5. `project files/branding/` - No active references found but may be used by apps

---

## 📝 Phase 2: Implementation Steps

**ONLY PROCEED AFTER EXPLICIT APPROVAL**

1. **Create archive structure:**
   ```bash
   mkdir -p archive/2025-12-RepoCleanup/{old-scripts,old-apps,reference-docs,legacy-experiments,orphaned-files}
   ```

2. **Perform verification checks:**
   - Run comprehensive grep searches for each archive candidate
   - Check import statements in Python, TypeScript, PowerShell
   - Verify no scheduled tasks or external scripts reference archived items

3. **Move files:**
   - Use `git mv` to preserve history
   - Move one category at a time
   - Test after each category

4. **Update references:**
   - Update documentation references to archived items
   - Add notes about archive location

5. **Create ARCHIVE_MANIFEST.md:**
   - Document every move
   - Include original and new paths
   - Include verification results
   - Add warnings about any edge cases

---

## 📄 Phase 3: Documentation Updates

### Create: docs/RepoStructureOverview.md

A comprehensive guide explaining:
- Repository structure and organization
- Active applications and their purposes
- Core infrastructure components
- How to run and test the system
- Archive location and purpose

### Update: Existing Documentation

Update references to archived files in:
- `IMPLEMENTATION_SUMMARY.md`
- `docs/ORCHESTRATOR_STATUS.md`
- `docs/ORCHESTRATOR_ENHANCEMENTS.md`

---

## ✅ Phase 4: Verification Checklist

Before considering cleanup complete:

- [ ] All active applications still launch correctly
- [ ] Launch.ps1 works on Windows
- [ ] launch.sh works on Linux/WSL
- [ ] All tests pass
- [ ] No broken imports or missing modules
- [ ] Documentation is updated and accurate
- [ ] ARCHIVE_MANIFEST.md is complete
- [ ] .gitignore excludes appropriate build artifacts

---

## 🚫 What Will NOT Be Touched

These items are explicitly excluded from any cleanup:

- `.git/` - Git repository data
- `.github/` - GitHub Actions and workflows
- `.gitignore`, `.gitattributes` - Git configuration
- `.venv/`, `venv/` - Python virtual environments
- `.vs/`, `.vscode/` - IDE settings
- `node_modules/` - Node.js dependencies (anywhere)
- `dist/`, `build/`, `.vite/` - Build outputs
- `bin/`, `obj/` - C# build artifacts
- `__pycache__/`, `*.pyc` - Python cache
- `*.dll`, `*.exe`, `*.so`, `*.pyd` - Binary files

---

## 🎯 Success Criteria

Cleanup is considered successful when:

1. ✅ All active functionality continues to work
2. ✅ Repository is more navigable and understandable
3. ✅ Archive is well-organized and documented
4. ✅ No files are deleted (only moved)
5. ✅ Documentation clearly explains structure
6. ✅ Team can easily find active vs. archived code

---

## 🔄 Rollback Plan

If issues arise after cleanup:

1. All moves are reversible using `git mv` in reverse
2. Archive structure preserves relative paths
3. Git history maintains full file history
4. Can cherry-pick individual files back to original locations

**To restore a file:**
```bash
git mv archive/2025-12-RepoCleanup/<category>/<file> <original-path>
```

---

## 📞 Next Steps

**AWAITING APPROVAL TO PROCEED**

Please review this plan and provide one of the following responses:

1. ✅ **"Proceed with the cleanup plan"** - Will execute all proposed changes
2. ⚠️ **"Proceed, but skip [X]"** - Will execute except for specified items
3. 🔧 **"Modify plan: [changes]"** - Will update plan based on feedback
4. ❌ **"Do not proceed"** - Will stop without making changes

**Verification Results:**
- ✅ Launch-Portal.bat / launch-portal.html - **KEEP** - Documented in help docs as feature
- ✅ project files/engine/ - **SAFE TO ARCHIVE** - No active imports found (DagBuilder not referenced)
- ⚠️ GeminiAIOrchestrator - **NEEDS REVIEW** - No code refs but OAuth config exists for it
- ⚠️ AI-Agent-Communication - **NEEDS REVIEW** - No references found, likely experimental
- ⚠️ client_secret JSON file in runs/ - **SECURITY CONCERN** - Contains OAuth secret, should be in .env or secure location

**Specific feedback requested on:**
- Should GeminiAIOrchestrator be kept for future Gemini integration work?
- Is AI-Agent-Communication experimental or planned for future use?
- Should the client_secret file be moved to a secure location and added to .gitignore?

---

**Document Version:** 1.0  
**Last Updated:** 2025-12-04  
**Author:** GitHub Copilot Coding Agent
