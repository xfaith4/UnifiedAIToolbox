# Archive Manifest - December 2025 Launch Cleanup

**Date**: December 11, 2025  
**Purpose**: Consolidate multiple launch scripts into a single unified entry point  
**Status**: Complete

## Overview

This cleanup archived legacy launch scripts and temporary files from the repository root, replacing them with a single unified launcher: `Start-Toolbox.ps1`.

## Archived Files

### Legacy Launch Scripts

| Original Location | Archive Location | Reason | Superseded By |
|-------------------|------------------|--------|---------------|
| `Launch.ps1` | `archive/2025-12-LaunchCleanup/legacy-launchers/` | Overlapping functionality | `Start-Toolbox.ps1` |
| `Start-WebUI.ps1` | `archive/2025-12-LaunchCleanup/legacy-launchers/` | Overlapping functionality | `Start-Toolbox.ps1` |
| `Run-Prompt.ps1` | `archive/2025-12-LaunchCleanup/legacy-launchers/` | Overlapping functionality | `Start-Toolbox.ps1` |
| `Smoketest.ps1` | `archive/2025-12-LaunchCleanup/legacy-launchers/` | Legacy testing script | Modern test suite |
| `Smoketest-Matrix.ps1` | `archive/2025-12-LaunchCleanup/legacy-launchers/` | Legacy testing script | Modern test suite |
| `Create-Shortcut.ps1` | `archive/2025-12-LaunchCleanup/legacy-launchers/` | Desktop shortcut creator | Not needed |

### Utility Scripts

| Original Location | Archive Location | Reason |
|-------------------|------------------|--------|
| `fix-pwsh.ps1` | `archive/2025-12-LaunchCleanup/utilities/` | One-time fix script, no longer needed |

### Old Documentation

| Original Location | Archive Location | Reason |
|-------------------|------------------|--------|
| `milestone_Validation_Phase.md` | `archive/2025-12-LaunchCleanup/old-docs/` | Superseded by comprehensive docs in `docs/` |

### Log Files (Moved to logs/)

| Original Location | New Location | Reason |
|-------------------|--------------|--------|
| `orchestration.log` | `logs/orchestration.log` | Runtime output belongs in logs/ |
| `orchestration-summary.json` | `logs/orchestration-summary.json` | Runtime output belongs in logs/ |
| `llm_error_20251210_215131.log` | `logs/llm_error_20251210_215131.log` | Runtime output belongs in logs/ |
| `raw_llm_response_20251211_034854.json` | `logs/raw_llm_response_20251211_034854.json` | Runtime output belongs in logs/ |

## New Files Created

| File | Purpose |
|------|---------|
| `Start-Toolbox.ps1` | Unified interactive launcher for all toolbox components |

## Restoration Commands

If you need to restore any archived file:

```powershell
# Restore Launch.ps1
git mv archive/2025-12-LaunchCleanup/legacy-launchers/Launch.ps1 ./Launch.ps1

# Restore Start-WebUI.ps1
git mv archive/2025-12-LaunchCleanup/legacy-launchers/Start-WebUI.ps1 ./Start-WebUI.ps1

# Restore Run-Prompt.ps1
git mv archive/2025-12-LaunchCleanup/legacy-launchers/Run-Prompt.ps1 ./Run-Prompt.ps1

# Restore Smoketest.ps1
git mv archive/2025-12-LaunchCleanup/legacy-launchers/Smoketest.ps1 ./Smoketest.ps1

# Restore Smoketest-Matrix.ps1
git mv archive/2025-12-LaunchCleanup/legacy-launchers/Smoketest-Matrix.ps1 ./Smoketest-Matrix.ps1

# Restore Create-Shortcut.ps1
git mv archive/2025-12-LaunchCleanup/legacy-launchers/Create-Shortcut.ps1 ./Create-Shortcut.ps1

# Restore fix-pwsh.ps1
git mv archive/2025-12-LaunchCleanup/utilities/fix-pwsh.ps1 ./fix-pwsh.ps1

# Restore milestone_Validation_Phase.md
git mv archive/2025-12-LaunchCleanup/old-docs/milestone_Validation_Phase.md ./milestone_Validation_Phase.md
```

## Active Files Preserved

The following launch mechanisms remain active:

- ✅ `Start-Toolbox.ps1` - **NEW** Unified interactive launcher
- ✅ `launch.sh` - Cross-platform Bash launcher (Linux/Mac/WSL)
- ✅ `Launch-Portal.bat` - Windows batch launcher for HTML portal
- ✅ `launch-portal.html` - Visual HTML launch portal

## Impact

**Before Cleanup**:
- 6 different PowerShell launch scripts with overlapping functionality
- Confusion about which script to use
- Temporary files cluttering the root directory

**After Cleanup**:
- Single unified `Start-Toolbox.ps1` entry point with interactive menu
- Clear separation: PowerShell (`Start-Toolbox.ps1`), Bash (`launch.sh`), HTML (`launch-portal.html`)
- Clean root directory with logs in proper location

## Functionality Mapping

| Old Script | Functionality | New Location in Start-Toolbox.ps1 |
|------------|---------------|-----------------------------------|
| `Launch.ps1` | Launch API + Dashboard + Orchestration | Menu Option 1 (Full Stack) + Option 6 (Orchestration) |
| `Start-WebUI.ps1` | Launch Dashboard with port management | Menu Option 3 (Dashboard Only) |
| `Run-Prompt.ps1` | Interactive prompt execution | Menu Option 6 (Run Orchestration) |
| `Smoketest.ps1` | Basic smoke test | Use modern test suite in `tests/` |
| `Smoketest-Matrix.ps1` | Matrix smoke tests | Use modern test suite in `tests/` |
| `Create-Shortcut.ps1` | Create desktop shortcut | Pin `Start-Toolbox.ps1` manually |

## Verification

All archived files preserve Git history:

```powershell
# View history of archived file
git log --follow archive/2025-12-LaunchCleanup/legacy-launchers/Launch.ps1
```

## Related Documentation

- `CLEANUP_HISTORY.md` - Overall cleanup history
- `README.md` - Updated with new launch instructions
- Implementation plan in artifacts directory

---

**Archive Status**: Complete  
**Reversibility**: All moves preserve Git history  
**Testing**: Verified Start-Toolbox.ps1 functionality
