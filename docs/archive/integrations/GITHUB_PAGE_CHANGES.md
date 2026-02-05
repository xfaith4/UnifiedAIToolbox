# GitHub Integration Page - UI Layout

## Changes Made

### 1. Repositioned Action Window (Now at Top)

```
┌─────────────────────────────────────────────────────┐
│ GitHub Integration                                   │
│ List repositories the provided token can access...  │
├─────────────────────────────────────────────────────┤
│ [Personal Access Token]  [Search repositories...]   │
│ [List Accessible Repos]                             │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Repo Orchestrator ⬅️ NOW AT TOP (was at bottom)     │
│ Supervisor-led orchestration for owner/repo         │
├─────────────────────────────────────────────────────┤
│ Instruction / Goal:                                  │
│ [Large text area for user input]                    │
│                                                      │
│ Branch to work on:        Integration branch:       │
│ [main          ]          [main-orchestration]      │
│                                                      │
│ [Run Repo Orchestration] [Cancel]                  │
│                                                      │
│ Supervisor Activity:                                │
│ ┌─────────────────────────────────────────────┐    │
│ │ [Real-time progress events displayed here]  │    │
│ │ event: Cloning repository...                │    │
│ │ event: Running intake analysis...           │    │
│ └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│ Repository Results ⬅️ NOW AT BOTTOM                 │
├─────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────┐  │
│ │ owner/repo-name                               │  │
│ │ [Private] [5 PRs] ⬅️ NEW: Shows open PRs     │  │
│ │ Repository description...                     │  │
│ │                      [Select]  [Open]         │  │
│ └───────────────────────────────────────────────┘  │
│ ┌───────────────────────────────────────────────┐  │
│ │ another/repository                            │  │
│ │ [Public] [2 PRs] ⬅️ NEW: Shows open PRs      │  │
│ │ Another repo description...                   │  │
│ │                      [Select]  [Open]         │  │
│ └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

## Key Improvements

### ✅ 1. Action Window at Top
- **Before**: Users had to scroll past the entire repository list to find the orchestration controls
- **After**: Action window appears immediately after selecting a repo (no scrolling needed)
- **Impact**: Reduces friction, puts primary action in focus

### ✅ 2. Searchable Repositories
- **Before**: Filter placeholder said "Optional filter (owner/repo contains...)"
- **After**: Clear placeholder: "Search repositories (filter by owner/repo name)"
- **Impact**: Makes search functionality more discoverable and explicit

### ✅ 3. Open PR Counts
- **Before**: No visibility into existing PRs when selecting a repo
- **After**: Badge shows "5 PRs", "2 PRs" etc. for each repository
- **Impact**: 
  - Orchestration agents can be aware of existing PRs
  - Users can see which repos have active work
  - Helps avoid conflicts with ongoing changes

### ✅ 4. Run Process Evaluation
- Created comprehensive evaluation document: `docs/RUN_PROCESS_EVALUATION.md`
- Analyzed 6 stages of orchestration pipeline
- Compared with industry standards (AutoGPT, LangChain, Cursor, Copilot)
- **Overall Assessment**: ⭐⭐⭐⭐½ (4.5/5) - Enterprise-grade architecture

## Technical Implementation

### Backend Changes
1. **`clone_service.py`**: Added `repo.get_pulls(state='open').totalCount` to fetch PR count
2. **`github_api.py`**: Added `open_prs_count: int = 0` field to `AccessibleRepository` model
3. Added error handling for PR count failures (graceful degradation to 0)

### Frontend Changes
1. **`github.ts`**: Added `open_prs_count?: number` to `GitHubRepo` interface
2. **`page.tsx`**: 
   - Moved orchestrator section before repository list
   - Added PR count badge display with green color scheme
   - Updated search placeholder text
   - Renamed "Results" to "Repository Results" for clarity

### Quality Assurance
- ✅ TypeScript compilation passes (no new errors)
- ✅ ESLint passes (no new warnings from our changes)
- ✅ Structure tests validate all components in place
- ✅ Graceful error handling for missing PR data

## Example PR Count Badge

When a repository has open PRs, it displays:
```
[Private] [5 PRs] [Archived]
          ^^^^^^
       Green badge
```

The badge only appears when `open_prs_count > 0`, keeping the UI clean for repos without PRs.

## Benefits for Orchestration

With PR count visibility:
1. **Conflict Awareness**: Agent knows there are 5 open PRs before making changes
2. **Smarter Decisions**: Can choose to review existing PRs or create new one
3. **Context**: Better understanding of repo activity level
4. **Coordination**: Avoid creating duplicate PRs for same issue

## Next Steps for Testing

To fully test these changes:
1. Set up `.env` with `GITHUB_TOKEN`
2. Run `./launch.sh` to start services
3. Navigate to http://localhost:3000/github
4. Enter your GitHub token
5. Click "List Accessible Repos"
6. Verify:
   - Orchestrator appears above repo list
   - PR counts show on repos with open PRs
   - Search box has improved placeholder
   - Selecting repo shows action window immediately (no scrolling)
