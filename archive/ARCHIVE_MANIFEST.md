# Archive Manifest

This directory previously contained legacy code that has been removed for simplification.

## Removed Components (January 2026)

### Archive Subdirectories
- `2025-12-LaunchCleanup/` - Legacy launch script consolidation artifacts
- `2025-12-RepoCleanup/` - Previous cleanup iteration files
- `2025-12-docs-consolidation/` - Documentation consolidation work
- `project-dashboard-legacy/` - Old React/Vite dashboard (superseded by Next.js webapp)

### Legacy Applications  
- `apps/OrchestrationDesktop/` - WPF Windows desktop app (superseded by webapp)
- `apps/OrchestrationDesktopLauncher/` - Desktop app launcher
- `apps/PromptRefiner/` - PowerShell/WPF refinement tool (superseded by webapp)
- `apps/dashboard/` - Legacy React/Vite dashboard (superseded by Next.js webapp)

### Rationale
The UnifiedAIToolbox has been simplified to focus on:
- **Backend**: FastAPI service (apps/UnifiedPromptApp/services/prompt-api)
- **Frontend**: Next.js web application (apps/unifiedtoolbox.webapp)
- **Orchestration**: Python-based bridge (apps/orchestration-bridge)

All removed components are available in git history if needed for reference.

## Recovery Instructions

If you need to recover any archived components:

```bash
# View commit history
git log --all --full-history -- archive/

# Checkout specific file from history
git checkout <commit-hash> -- path/to/file
```

Last updated: January 2026
