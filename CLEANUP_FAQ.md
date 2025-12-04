# Repository Cleanup - Frequently Asked Questions

**Quick answers to common questions about the proposed cleanup**

---

## 🤔 General Questions

### Q: Will anything be deleted?
**A:** No. Nothing will be deleted. All items are moved to `archive/2025-12-RepoCleanup/` where they remain accessible and can be restored if needed.

### Q: Can I undo the changes if something breaks?
**A:** Yes, 100%. Since we're using `git mv`, all changes preserve file history and can be reversed with another `git mv` command. The ARCHIVE_MANIFEST.md will document exactly how to restore each file.

### Q: Will my apps stop working?
**A:** No. All active applications and their dependencies have been verified to remain in place. Only obsolete or reference files are being archived.

### Q: How long will this take?
**A:** Implementation: 5-10 minutes. Testing: 10-15 minutes. Total: ~20-25 minutes.

---

## 🔍 About Specific Items

### Q: Why archive "launchOLD.sh"?
**A:** The name itself indicates it's obsolete ("OLD"), and we found no references to it in the codebase. The current `launch.sh` has superseded it. If you use it manually, let me know and we'll keep it.

### Q: Why keep "Launch-Portal.bat" and "launch-portal.html"?
**A:** These are documented features in your help docs (docs/help/launch-guide.md and quick-start.md). They provide a visual interface for launching services. They're not obsolete, just alternative entry points.

### Q: What's the "codex-multiagent-swarm" and why must it stay?
**A:** It's a multi-agent code review system. Verification found it's actively referenced in:
- `apps/orchestration-bridge/bridge.py`
- `Orchestration/UnifiedPromptApp/services/prompt-api/app.py`
- Multiple PowerShell test and module files
- Various scripts that enable "codex-swarm" run mode

Archiving it would break these features.

### Q: Why move the reference documents (DOCX/PDF files)?
**A:** These are static reference materials - they're not code or configuration that affects the running system. They're referenced in documentation for historical context. Moving them to the archive:
- Keeps them accessible
- Declutters the working directories
- Better organizes reference vs. active material

We'll update the documentation links to point to their new archive location.

### Q: What's the "project files" directory?
**A:** It contains a mix of items:
- **branding/** - Logos, icons (will keep - may be used by apps)
- **dashboard/** - Old dashboard superseded by apps/dashboard (archive)
- **engine/** - DagBuilder not in active use (archive)
- **Documentation** - Reference materials (archive)

We're keeping branding but archiving the rest.

### Q: Why is there an OAuth secret in the repository?
**A:** Good question! This is a security concern. The `runs/client_secret_*.json` file contains Google OAuth credentials and should not be in version control, especially if the repo is public. 

**Recommended fix:**
1. Move credentials to `.env` file
2. Update code to read from environment variables
3. Add `client_secret*.json` to `.gitignore`
4. If repo is public, rotate the secret on Google Cloud Console

---

## 🎯 About the Archive Structure

### Q: Why create a new archive folder? Why not use the existing one?
**A:** The existing `archive/` already has organized subsections (apps-web-legacy, project-dashboard-legacy, project-management). Creating `archive/2025-12-RepoCleanup/` keeps this cleanup effort organized separately with its own manifest.

### Q: What's the ARCHIVE_MANIFEST.md file?
**A:** It's a detailed log of everything archived, including:
- Original path
- New path
- Reason for archiving
- How to restore if needed
- Any warnings or edge cases

Think of it as a map to the archive.

### Q: Can I move files back from the archive later?
**A:** Absolutely. Just use:
```bash
git mv archive/2025-12-RepoCleanup/<category>/<file> <original-path>
```

The manifest will tell you the original path for each file.

---

## ⚠️ About Items Needing Review

### Q: What's "GeminiAIOrchestrator"?
**A:** It's a TypeScript/React application in `Orchestration/AI-Orchestration/GeminiAIOrchestrator/` that appears to integrate with Google's Gemini AI API. 

**Evidence found:**
- It's a Vite app using `@google/genai` package
- The OAuth secret in `runs/` is for a project called "gemini-agentic-ai-orchestrator"
- No active code references were found (nothing imports from it)

**Decision needed:** 
- If you're planning to use Gemini API integration → Keep it
- If it was just an experiment → Archive it

### Q: What's "AI-Agent-Communication"?
**A:** It's a directory in `Orchestration/AI-Orchestration/AI-Agent-Communication/` with no active code references found. Appears to be experimental or prototype code.

**Recommendation:** Archive it (but easily restorable if needed later).

### Q: Should I worry about GeminiAIOrchestrator's OAuth secret?
**A:** If you plan to use Gemini integration, you should secure the secret properly (move to .env, add to .gitignore). If you're not using it, you can archive both the app and rotate the secret for security.

---

## 📋 About Documentation Updates

### Q: Will you break my documentation?
**A:** No. We'll update all references to archived files. Specifically:
- `IMPLEMENTATION_SUMMARY.md` - Update paths to reference docs
- `docs/ORCHESTRATOR_STATUS.md` - Update paths
- `docs/ORCHESTRATOR_ENHANCEMENTS.md` - Update paths

All links will point to the new archive location.

### Q: What's "RepoStructureOverview.md"?
**A:** A new document we'll create in `docs/` that explains:
- What's in each main directory
- Where to find each application
- How to build and run the system
- Where archived content is located
- Quick reference for newcomers or future you

### Q: Will you update the main README?
**A:** Only if needed. The main README is already well-structured. We'll create the RepoStructureOverview.md as a complement for more detailed structural information.

---

## 🔒 About Safety and Testing

### Q: How do you know it's safe to archive these items?
**A:** For each item, we:
1. Searched for references in all code files (PS1, PY, TS, JS, JSON, etc.)
2. Checked imports and require statements
3. Verified against active solution/project files
4. Checked documentation references
5. Examined launch scripts and entry points

Items with no active references are candidates for archiving.

### Q: What tests will you run?
**A:** After implementing the cleanup, we'll:
1. Run existing PowerShell tests (`tests/*.Tests.ps1`)
2. Verify launch scripts work (`Launch.ps1`, `launch.sh`)
3. Check that documentation builds correctly
4. Verify no broken imports or missing modules
5. Run smoke tests if available

### Q: What if a test fails?
**A:** We'll investigate whether the failure is related to our changes:
- If related: Restore the archived item
- If unrelated: Note it as pre-existing issue

We're only responsible for test regressions caused by our changes.

---

## 🚀 About Implementation

### Q: How will you implement the changes?
**A:** Step by step:
1. Create archive directory structure
2. Move files one category at a time using `git mv`
3. Test after each category
4. Update documentation references
5. Create ARCHIVE_MANIFEST.md
6. Create RepoStructureOverview.md
7. Final comprehensive test
8. Commit changes

### Q: Will you do it all at once or in stages?
**A:** In stages, one category at a time:
1. Stage 1: Old scripts (launchOLD.sh)
2. Stage 2: Reference docs (DOCX/PDF/images)
3. Stage 3: Old app components (engine/, dashboard/)
4. Stage 4: Legacy experiments (3rdPartyTools/)
5. Stage 5: Documentation updates
6. Stage 6: Security fixes (if approved)

We test after each stage.

### Q: What if I change my mind halfway through?
**A:** No problem. We can:
- Stop at any stage
- Reverse any completed stage
- Skip any upcoming stage

Everything is tracked and reversible.

---

## 🎨 About "project files/branding"

### Q: Why keep the branding folder?
**A:** It contains active assets that may be referenced by the applications:
- Favicon files (favicon.ico, favicon-16.png, etc.)
- Logo files (logo-64.png, logo-128.png, etc.)
- App icon (app-icon.ico)
- Design tokens (tokens.json)

While we didn't find explicit code references, these are typically referenced in HTML or build configurations and are needed for app branding.

### Q: Should branding be in "project files"?
**A:** Ideally, it might be better in `assets/branding/` or `docs/branding/`, but moving it requires:
1. Finding all references in HTML, build configs, and manifests
2. Updating those references
3. Testing all apps to ensure icons/logos still work

That's beyond the scope of this safe cleanup. We can tackle it in a future refactor if desired.

---

## 💼 About the "runs" Directory

### Q: What's the "runs" directory for?
**A:** Based on other parts of the codebase, "runs" appears to be for storing orchestration run outputs and logs. However, the current contents are:
- OAuth secret (wrong location)
- Image file (wrong location)

These should be moved out.

### Q: Should runs/ be in .gitignore?
**A:** Looking at the .gitignore, it already includes `runs/` which should prevent these files from being committed. The fact that they're in the repo suggests they were force-added or the .gitignore was added later.

---

## 🔧 If You Want to Modify the Plan

### Q: Can I ask you to archive additional items?
**A:** Absolutely! Just tell me what you'd like to archive and I'll verify it's safe and add it to the plan.

### Q: Can I ask you to keep something you proposed to archive?
**A:** Of course! Just let me know which item(s) to keep. The plan is flexible.

### Q: Can I ask you to do only part of the cleanup?
**A:** Yes. You can say something like:
- "Only archive the reference docs"
- "Archive everything except the project files items"
- "Just do the security fixes, skip the archiving"

---

## 📞 How to Respond

### Ready to proceed? Say:
✅ **"Proceed with the cleanup plan"** - Implements everything proposed

### Want to modify? Say:
⚙️ **"Proceed with cleanup. Keep GeminiAIOrchestrator and AI-Agent-Communication."**  
⚙️ **"Proceed but skip the reference docs for now"**  
⚙️ **"Only archive launchOLD.sh and 3rdPartyTools, skip everything else"**

### Need more info? Say:
ℹ️ **"Tell me more about [specific item]"**  
ℹ️ **"Show me what's in the engine/ directory"**  
ℹ️ **"What exactly does the OAuth secret contain?"**

### Not ready? Say:
❌ **"Do not proceed"** or **"Hold off on this for now"**

---

## 📚 Related Documents

- **Detailed Plan:** `CLEANUP_PLAN_2025-12.md`
- **Quick Reference:** `CLEANUP_SUMMARY.md`
- **Visual Guide:** `CLEANUP_VISUAL_GUIDE.md`
- **This FAQ:** `CLEANUP_FAQ.md`

---

**Still have questions?** Just ask! I'm here to help you understand every aspect of the proposed cleanup.
