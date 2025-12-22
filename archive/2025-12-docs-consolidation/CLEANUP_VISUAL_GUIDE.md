# Repository Cleanup - Visual Guide

**Before vs. After Structure**

---

## 🗂️ Current Structure (Before Cleanup)

```
UnifiedAIToolbox/
│
├── 📁 apps/                          ✅ KEEP - Active applications
│   ├── dashboard/                    ✅ Active React/Vite dashboard
│   ├── unifiedtoolbox.webapp/        ✅ Active Next.js portal
│   ├── OrchestrationDesktop/         ✅ Active WPF desktop app
│   ├── OrchestrationDesktopLauncher/ ✅ Active C# launcher
│   ├── PromptRefiner/                ✅ Active prompt tools
│   └── orchestration-bridge/         ✅ Active Python bridge
│
├── 📁 Orchestration/                 ✅ KEEP - Core orchestration
│   ├── MilestoneController.ps1       ✅ Active dispatcher
│   ├── UnifiedPromptApp/             ✅ Active prompt API
│   ├── AI-Orchestration/             ✅ Core engine
│   │   ├── AI Orchestration/         ✅ Active TS app
│   │   ├── MilestoneDashboard/       ✅ Active dashboard
│   │   ├── scripts/                  ✅ Active scripts
│   │   ├── codex-multiagent-swarm/   ✅ ACTIVE - Used by bridge, API, tests
│   │   ├── GeminiAIOrchestrator/     ⚠️ NEEDS REVIEW - OAuth config exists
│   │   ├── AI-Agent-Communication/   ⚠️ NEEDS REVIEW - No references
│   │   └── 3rdPartyTools/            📦 ARCHIVE - Documented as removed
│   └── ...
│
├── 📁 modules/                       ✅ KEEP - Shared PowerShell modules
│   └── PromptLibrary/                ✅ Active
│
├── 📁 scripts/                       ✅ KEEP - Operational scripts
│   ├── Unified-Orchestration.ps1     ✅ Active
│   ├── verify-launch.py              ✅ Active
│   └── ...
│
├── 📁 tests/                         ✅ KEEP - Test suite
│   ├── Orchestration.Tests.ps1      ✅ Active
│   ├── PromptLibrary.Tests.ps1      ✅ Active
│   └── ...
│
├── 📁 docs/                          ✅ KEEP - Documentation
│   ├── ORCHESTRATOR_STATUS.md        ✅ Active (will update paths)
│   ├── PROJECT_ROADMAP.md            ✅ Active
│   └── ...
│
├── 📁 data/                          ✅ KEEP - Active data
│   ├── agents/                       ✅ Active
│   ├── prompts/                      ✅ Active
│   └── sqlite/                       ✅ Active
│
├── 📁 packages/                      ✅ KEEP - Python packages
│   └── prompt-registry/              ✅ Active
│
├── 📁 examples/                      ✅ KEEP - Examples
│   └── New-RefinedPrompt-Example.ps1 ✅ Active
│
├── 📁 project files/                 ⚠️ MIXED - Some archive, some keep
│   ├── branding/                     ✅ KEEP - May be referenced by apps
│   ├── dashboard/                    📦 ARCHIVE - Superseded
│   ├── engine/                       📦 ARCHIVE - Not in use
│   ├── AI Orchestrator.docx          📦 ARCHIVE - Reference doc
│   ├── Ai Orchestrator – Arch*.docx  📦 ARCHIVE - Reference doc
│   ├── Ai Orchestrator – Arch*.pdf   📦 ARCHIVE - Reference doc
│   ├── ai_orchestrator_*.md          📦 ARCHIVE - Reference doc
│   ├── Code Orchestration*.txt       📦 ARCHIVE - Reference doc
│   ├── AgenticAIOrchestrator.jpg     📦 ARCHIVE - Reference image
│   └── AgenticAIOrchestrator.png     📦 ARCHIVE - Reference image
│
├── 📁 runs/                          ⚠️ SECURITY CONCERN
│   ├── client_secret_*.json          🔴 SECURITY - Move to .env
│   └── repository-open-graph*.png    📦 ARCHIVE - Misplaced
│
├── 📁 archive/                       ✅ KEEP - Existing archives
│   ├── apps-web-legacy/              ✅ Keep
│   ├── project-dashboard-legacy/     ✅ Keep
│   ├── project-management/           ✅ Keep
│   └── 2025-12-RepoCleanup/          📦 NEW - Will be created
│
├── 📄 Launch.ps1                     ✅ KEEP - Active launcher
├── 📄 launch.sh                      ✅ KEEP - Active launcher
├── 📄 Launch-Portal.bat              ✅ KEEP - Documented feature
├── 📄 launch-portal.html             ✅ KEEP - Documented UI
├── 📄 launchOLD.sh                   📦 ARCHIVE - Superseded
├── 📄 Run-Prompt.ps1                 ✅ KEEP - Active
├── 📄 Smoketest.ps1                  ✅ KEEP - Active
├── 📄 Start-WebUI.ps1                ✅ KEEP - Active
├── 📄 Create-Shortcut.ps1            ✅ KEEP - Active
├── 📄 fix-pwsh.ps1                   ✅ KEEP - Active
├── 📄 UnifiedAIToolbox.sln           ✅ KEEP - Main solution
├── 📄 README.md                      ✅ KEEP - Main docs
└── ...
```

---

## 🎯 Proposed Structure (After Cleanup)

```
UnifiedAIToolbox/
│
├── 📁 apps/                          ✅ UNCHANGED - All active
│   ├── dashboard/
│   ├── unifiedtoolbox.webapp/
│   ├── OrchestrationDesktop/
│   ├── OrchestrationDesktopLauncher/
│   ├── PromptRefiner/
│   └── orchestration-bridge/
│
├── 📁 Orchestration/                 ✅ CLEANER - Removed obsolete items
│   ├── MilestoneController.ps1       ✅ Keep
│   ├── UnifiedPromptApp/             ✅ Keep
│   └── AI-Orchestration/             ✅ Keep
│       ├── AI Orchestration/         ✅ Keep
│       ├── MilestoneDashboard/       ✅ Keep
│       ├── scripts/                  ✅ Keep
│       ├── codex-multiagent-swarm/   ✅ Keep (verified active)
│       ├── GeminiAIOrchestrator/     ✅ or 📦 (your decision)
│       └── AI-Agent-Communication/   ✅ or 📦 (your decision)
│       └── 3rdPartyTools/            ❌ MOVED to archive
│
├── 📁 modules/                       ✅ UNCHANGED
├── 📁 scripts/                       ✅ UNCHANGED
├── 📁 tests/                         ✅ UNCHANGED
├── 📁 docs/                          ✅ UPDATED - Path references fixed
│   ├── RepoStructureOverview.md      ✨ NEW - Repository guide
│   └── ...
├── 📁 data/                          ✅ UNCHANGED
├── 📁 packages/                      ✅ UNCHANGED
├── 📁 examples/                      ✅ UNCHANGED
│
├── 📁 project files/                 ✨ CLEANER - Only branding remains
│   └── branding/                     ✅ Keep
│       └── (dashboard/ and engine/ moved to archive)
│       └── (documentation files moved to archive)
│
├── 📁 runs/                          ✨ CLEANER
│   └── (secrets moved to .env, images moved to proper location)
│
├── 📁 archive/                       ✨ EXPANDED - New organized archive
│   ├── apps-web-legacy/              ✅ Existing
│   ├── project-dashboard-legacy/     ✅ Existing
│   ├── project-management/           ✅ Existing
│   └── 2025-12-RepoCleanup/          ✨ NEW
│       ├── ARCHIVE_MANIFEST.md       ✨ Complete archive index
│       ├── old-scripts/
│       │   └── launchOLD.sh
│       ├── reference-docs/           ✨ All reference documentation
│       │   ├── AI-Orchestrator.docx
│       │   ├── AI-Orchestrator-Architecture.docx
│       │   ├── AI-Orchestrator-Architecture.pdf
│       │   ├── ai-orchestrator-architecture-v1.md
│       │   ├── Agent-Definitions.txt
│       │   ├── AgenticAIOrchestrator.jpg
│       │   └── AgenticAIOrchestrator.png
│       ├── old-apps/                 ✨ Superseded app components
│       │   ├── project-files-dashboard/
│       │   └── project-files-engine/
│       ├── legacy-experiments/       ✨ Experimental code
│       │   └── 3rdPartyTools/
│       └── needs-review/             ✨ Items needing decision
│           └── (GeminiAIOrchestrator, etc. if archived)
│
├── 📄 Launch.ps1                     ✅ UNCHANGED
├── 📄 launch.sh                      ✅ UNCHANGED
├── 📄 Launch-Portal.bat              ✅ KEEP - Verified in docs
├── 📄 launch-portal.html             ✅ KEEP - Verified in docs
├── 📄 launchOLD.sh                   ❌ MOVED to archive
├── 📄 Run-Prompt.ps1                 ✅ UNCHANGED
├── 📄 Smoketest.ps1                  ✅ UNCHANGED
├── 📄 Start-WebUI.ps1                ✅ UNCHANGED
├── 📄 Create-Shortcut.ps1            ✅ UNCHANGED
├── 📄 fix-pwsh.ps1                   ✅ UNCHANGED
├── 📄 UnifiedAIToolbox.sln           ✅ UNCHANGED
├── 📄 README.md                      ✅ UNCHANGED
├── 📄 .env                           ✨ UPDATED - Add OAuth secrets
└── 📄 .gitignore                     ✨ UPDATED - Ignore client_secret*.json
```

---

## 📊 Impact Analysis

### Space Savings
- **Files moved:** ~14 items
- **Space freed:** ~50-100 MB (mostly documentation)
- **Clarity gained:** 🚀 Significant

### Risk Assessment
- **Break risk:** ✅ Minimal (all items verified safe or inactive)
- **Reversibility:** ✅ 100% (all moves tracked, no deletions)
- **Testing required:** ✅ Standard (run existing tests)

---

## 🔄 File Movements at a Glance

### Root Level
```
launchOLD.sh  →  archive/2025-12-RepoCleanup/old-scripts/launchOLD.sh
```

### project files/ Directory
```
project files/dashboard/              →  archive/2025-12-RepoCleanup/old-apps/project-files-dashboard/
project files/engine/                 →  archive/2025-12-RepoCleanup/old-apps/project-files-engine/
project files/AI Orchestrator.docx    →  archive/2025-12-RepoCleanup/reference-docs/AI-Orchestrator.docx
project files/Ai Orchestrator – *.docx →  archive/2025-12-RepoCleanup/reference-docs/AI-Orchestrator-Architecture.docx
project files/Ai Orchestrator – *.pdf  →  archive/2025-12-RepoCleanup/reference-docs/AI-Orchestrator-Architecture.pdf
project files/ai_orchestrator_*.md    →  archive/2025-12-RepoCleanup/reference-docs/ai-orchestrator-architecture-v1.md
project files/Code Orchestration*.txt →  archive/2025-12-RepoCleanup/reference-docs/Agent-Definitions.txt
project files/AgenticAIOrchestrator.jpg → archive/2025-12-RepoCleanup/reference-docs/AgenticAIOrchestrator.jpg
project files/AgenticAIOrchestrator.png → archive/2025-12-RepoCleanup/reference-docs/AgenticAIOrchestrator.png

(project files/branding/ stays in place)
```

### Orchestration/ Directory
```
Orchestration/3rdPartyTools/  →  archive/2025-12-RepoCleanup/legacy-experiments/3rdPartyTools/
```

### runs/ Directory
```
runs/repository-open-graph-template (1).png  →  archive/2025-12-RepoCleanup/needs-review/ (or docs/assets/)
runs/client_secret_*.json                     →  .env (with .gitignore update)
```

---

## 📝 Documentation Updates

### Files to be Created
```
✨ docs/RepoStructureOverview.md
   - Repository organization guide
   - App locations and purposes
   - Build and run instructions
   - Archive information

✨ archive/2025-12-RepoCleanup/ARCHIVE_MANIFEST.md
   - Complete list of moved items
   - Original paths
   - Reasons for archival
   - How to restore if needed
```

### Files to be Updated
```
📝 IMPLEMENTATION_SUMMARY.md
   - Update: `project files/AI Orchestrator.docx`
   - New path: `archive/2025-12-RepoCleanup/reference-docs/AI-Orchestrator.docx`

📝 docs/ORCHESTRATOR_STATUS.md
   - Update: `project files/` references
   - New paths: Archive locations

📝 docs/ORCHESTRATOR_ENHANCEMENTS.md
   - Update: `project files/` references
   - New paths: Archive locations

📝 .gitignore
   - Add: `client_secret*.json`
   - Add: `.env.local` (if not present)
```

---

## 🎯 What Gets Better

### Before Cleanup
```
❌ Confusing "project files" directory with mixed content
❌ "launchOLD.sh" sitting in root, unclear if needed
❌ Reference docs scattered in "project files"
❌ 3rdPartyTools in Orchestration (documented as removed)
❌ OAuth secrets in repository
❌ No clear guide to repository structure
```

### After Cleanup
```
✅ Clear separation: active code vs. archived
✅ Only current launch scripts in root
✅ Reference docs organized in archive with manifest
✅ Obsolete items clearly archived
✅ OAuth secrets in .env (secure)
✅ docs/RepoStructureOverview.md explains everything
```

---

## 💡 Quick Decision Guide

### Safe to Approve Immediately
- ✅ Moving launchOLD.sh (clearly obsolete)
- ✅ Moving reference documentation (static files)
- ✅ Moving project files/engine and dashboard (superseded)
- ✅ Moving 3rdPartyTools (documented as removed)
- ✅ Fixing OAuth secret security issue

### Needs Your Input
- ⚠️ GeminiAIOrchestrator - Keep or archive?
- ⚠️ AI-Agent-Communication - Keep or archive?

### Recommended Actions
1. **Approve the cleanup** for the 14 safe items
2. **Keep** GeminiAIOrchestrator if you plan to use Gemini API
3. **Archive** AI-Agent-Communication if truly experimental
4. **Fix** the OAuth secret security issue immediately

---

## 🚀 Ready to Proceed?

**Option 1: Full Approval**
```
"Proceed with the cleanup plan"
```

**Option 2: Approval with Decisions**
```
"Proceed with cleanup plan. Keep GeminiAIOrchestrator. Archive AI-Agent-Communication."
```

**Option 3: Partial Approval**
```
"Proceed, but skip the reference docs for now"
```

---

**See Full Details:** `CLEANUP_PLAN_2025-12.md`  
**Quick Reference:** `CLEANUP_SUMMARY.md`  
**This Guide:** `CLEANUP_VISUAL_GUIDE.md`
