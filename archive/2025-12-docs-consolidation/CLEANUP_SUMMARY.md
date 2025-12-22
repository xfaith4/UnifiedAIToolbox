# Repository Cleanup - Quick Reference Summary

**Status:** ✅ Phase 0 & 1 Complete - Awaiting Approval  
**Detailed Plan:** See `CLEANUP_PLAN_2025-12.md`

---

## 📊 At a Glance

| Category | Count | Status |
|----------|-------|--------|
| **Safe to Archive** | ~14 items | ✅ Low risk, verified |
| **Must Keep (Active)** | All major apps/scripts | ✅ Verified active |
| **Needs Manual Review** | 4 items | ⚠️ Requires decision |
| **Files to Delete** | 0 | ❌ No deletions |

---

## ✅ What Will Be Archived (If Approved)

### Safe Items (~14 files/folders)

1. **Old Scripts (1)**
   - `launchOLD.sh` → Superseded by `launch.sh`

2. **Reference Documentation (7)**
   - `project files/AI Orchestrator.docx`
   - `project files/Ai Orchestrator – Architecture + Delivery Checklist.docx`
   - `project files/Ai Orchestrator – Architecture + Delivery Checklist.pdf`
   - `project files/ai_orchestrator_readme_architecture_delivery_checklist (1).md`
   - `project files/Code Orchestration Tool (Agents Definitions).txt`
   - `project files/AgenticAIOrchestrator.jpg`
   - `project files/AgenticAIOrchestrator.png`
   - *(These are static reference documents, links will be updated)*

3. **Old App Components (2)**
   - `project files/engine/` → DagBuilder not in use
   - `project files/dashboard/` → Superseded by `apps/dashboard`

4. **Legacy Experiments (1)**
   - `Orchestration/3rdPartyTools/` → Already documented as removed

---

## ✅ What Will STAY (Verified Active)

### Critical - Do Not Touch
- ✅ **codex-multiagent-swarm/** - Actively used by API, bridge, tests
- ✅ **Launch-Portal.bat** and **launch-portal.html** - Documented UI feature
- ✅ All **apps/** directories - Active applications
- ✅ All root **PowerShell scripts** - Entry points
- ✅ **Orchestration/** core infrastructure
- ✅ **modules/**, **scripts/**, **tests/** - Core code
- ✅ **.github/**, **.git/**, config files - Infrastructure

---

## ⚠️ Items Needing Your Decision

### 1. GeminiAIOrchestrator/
**Location:** `Orchestration/AI-Orchestration/GeminiAIOrchestrator/`  
**Status:** TypeScript Vite app using Google Gemini AI  
**Evidence:** Has associated OAuth config but no active code references  
**Question:** Is this planned for future use or experimental?
- Keep it → Future Gemini integration
- Archive it → Experimental/unused

### 2. AI-Agent-Communication/
**Location:** `Orchestration/AI-Orchestration/AI-Agent-Communication/`  
**Status:** No references found in active code  
**Question:** Is this experimental or planned?
- Keep it → Planned feature
- Archive it → Experimental/unused

### 3. 🔴 SECURITY: OAuth Secret in Repository
**Location:** `runs/client_secret_865636458145-*.json`  
**Issue:** Google OAuth credentials exposed in repository  
**Recommended Actions:**
1. Move to `.env` file or secure credential store
2. Add `client_secret*.json` to `.gitignore`
3. Update code to read from environment variables
4. **If repo is public:** Rotate the secret immediately

### 4. Misplaced Files
**Location:** `runs/repository-open-graph-template (1).png`  
**Issue:** Image file in wrong directory  
**Action:** Move to appropriate location (docs/assets/?)

---

## 🎯 What Happens Next

### Option 1: Approve Full Plan
**You say:** "Proceed with the cleanup plan"  
**I will:**
1. Create `archive/2025-12-RepoCleanup/` structure
2. Move the 14 safe items
3. Update documentation references
4. Create `ARCHIVE_MANIFEST.md`
5. Create `docs/RepoStructureOverview.md`
6. Run tests to verify nothing broke

### Option 2: Approve with Modifications
**You say:** "Proceed, but skip [X]" or "Also archive [Y]"  
**I will:** Adjust plan and execute modified version

### Option 3: Request More Info
**You say:** "Tell me more about [X]"  
**I will:** Provide detailed analysis of specific items

### Option 4: Don't Proceed
**You say:** "Do not proceed"  
**I will:** Stop without making any changes

---

## 💾 Archive Structure (If Approved)

```
archive/
└── 2025-12-RepoCleanup/
    ├── ARCHIVE_MANIFEST.md          # What, why, from where
    ├── old-scripts/
    │   └── launchOLD.sh
    ├── reference-docs/
    │   ├── AI-Orchestrator.docx
    │   ├── AI-Orchestrator-Architecture.docx
    │   ├── AI-Orchestrator-Architecture.pdf
    │   ├── ai-orchestrator-architecture-v1.md
    │   ├── Agent-Definitions.txt
    │   ├── AgenticAIOrchestrator.jpg
    │   └── AgenticAIOrchestrator.png
    ├── old-apps/
    │   ├── project-files-dashboard/
    │   └── project-files-engine/
    ├── legacy-experiments/
    │   └── 3rdPartyTools/
    └── needs-review/
        ├── GeminiAIOrchestrator/      (if you decide to archive)
        ├── AI-Agent-Communication/    (if you decide to archive)
        └── repository-open-graph-template.png
```

---

## 📋 Documentation Updates (If Approved)

**Will be created:**
- `docs/RepoStructureOverview.md` - Repository guide
- `archive/2025-12-RepoCleanup/ARCHIVE_MANIFEST.md` - Archive index

**Will be updated:**
- `IMPLEMENTATION_SUMMARY.md` - Update doc paths
- `docs/ORCHESTRATOR_STATUS.md` - Update doc paths
- `docs/ORCHESTRATOR_ENHANCEMENTS.md` - Update doc paths

---

## 🛡️ Safety Guarantees

1. ✅ **No deletions** - Everything goes to archive
2. ✅ **Reversible** - Use `git mv` to move back if needed
3. ✅ **Tested** - Will run tests after each category
4. ✅ **Documented** - Every move tracked in manifest
5. ✅ **Preserves history** - Git history maintained

---

## 🚀 Ready to Proceed?

**Just say:**
- "Proceed with the cleanup plan" ✅
- "Proceed, but keep GeminiAIOrchestrator" ⚙️
- "Tell me more about [item]" ℹ️
- "Do not proceed" ❌

---

**Full Details:** `CLEANUP_PLAN_2025-12.md`  
**Created:** 2025-12-04  
**Agent:** GitHub Copilot Coding Agent
