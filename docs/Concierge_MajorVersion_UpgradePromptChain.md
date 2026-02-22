You are a senior product-minded full-stack engineer working in the Unified AI Toolbox web app repo.

Meta-goal
Deliver the Concierge Orchestration evolution in separate PRs for clean reviews, while keeping the full roadmap in view so earlier decisions don’t paint us into a corner.

Rules
- Create ONE PR per phase. Do not mix phases.
- Each phase must end with:
  1) Passing build
  2) Manual QA checklist notes in the PR description
  3) A short CHANGELOG/notes entry (or equivalent) describing user-visible changes
- Preserve existing backend behavior unless a phase explicitly allows backend changes.
- Preserve old routes (add redirects/aliases); do not break bookmarks.
- Centralize nav labels/routes and key schema types to avoid scattered strings.
- Favor small, reversible changes. Avoid sweeping refactors.

Roadmap awareness (do not implement all at once)
Stage 0: IA + Docs Hub + First-launch Tour
Stage 1: Concierge UI + Proposal artifact (no execution)
Stage 2: Proposal → Run Recipe mapping (prefill Playground/App Factory)
Stage 3: Start Run + Concierge narrates events (approvals/gates)
Stage 4: Tool enablement + least privilege + audit
Stage 5: Modes + personalization

========================================================
PHASE 0 PR: IA FOUNDATION (Stage 0)
========================================================
Objective
Implement the workflow-based navigation and global documentation surfacing that makes the product’s purpose obvious even without the concierge.

Required changes
1) Sidebar IA (labels + grouping)
- Rename “Dashboard” → “Home” (or “Overview” — pick one and apply consistently)
- Libraries remain:
  - Prompt Library
  - Agent Library
  - Tooling (MCP) [rename MCP Library → Tooling or Tools; keep “(MCP)” in the page header]
- Rename section header “Integration Tools” → “Run”
  - “Orchestrator” → “Playground”
  - “App Factory” stays “App Factory”
- Add “Observe” section:
  - Add “Runs” (new page if needed; can be a minimal wrapper)
  - Rename “Milestones” → “Reports”
- Settings stays at bottom

2) Routing strategy
- Keep old routes working.
- Add canonical routes + redirects:
  - /home (or /overview) → existing dashboard route
  - /playground → existing orchestrator route
  - /reports → existing milestones route
  - /runs → new Runs page
- Update sidebar links to canonical routes.

3) Global Docs & Concepts hub
- Add a global Help entry accessible from any page (top-right or sidebar footer).
- It opens a Docs hub modal or page that consolidates:
  - What this does
  - Core concepts (Prompt, Agent, Tool/MCP, Run, Gate, Export)
  - Quick start
  - Troubleshooting
- Unify any existing “Help & Concepts” in App Factory to route to the same hub.

4) First-launch tour
- Lightweight 5–7 step guided tour:
  - Explains the Home → Build → Run → Observe → Configure workflow
  - Highlights sidebar sections in order
  - Has Skip + “Don’t show again”
- Persist completion flag in localStorage (or existing prefs if present).

Deliverables
- PR with nav changes, routes/redirects, docs hub, first-launch tour, and a short markdown doc describing the new IA.

Acceptance criteria
- User can infer the workflow from the sidebar.
- Help is accessible everywhere.
- Tour appears once and can be disabled permanently.
- No backend changes.

STOP AFTER PHASE 0:
- Commit changes on a dedicated branch.
- Open PR #1: “IA foundation: workflow nav + docs hub + first-launch tour”
- Include QA checklist in PR description (routes, redirects, docs accessible, tour shows once).

========================================================
PHASE 1 PR: CONCIERGE (PROPOSAL-ONLY) (Stage 1)
========================================================
Objective
Add Concierge as a chat-first front door that produces a Proposal artifact, but does not execute runs.

Required changes
1) New “Concierge” (or “Assistant”) page
- Add a chat UI for goal intake.
- Keep it simple: conversation history + input + send.

2) Proposal artifact schema (central, versioned)
Create a centrally defined Proposal schema/type with a proposal_version.
Minimum fields:
- goal.summary
- inputs (repo/files/constraints)
- plan.steps[]
- recommended.prompts[]
- recommended.agents[]
- recommended.tools[] (plan only)
- approvals.required[]
- acceptance_checks[]
- risks[]
- estimate (time/cost rough is fine)
- run_recipe (optional, can be empty in Phase 1)

3) Proposal rendering + actions
- Render Proposal as readable sections.
- Buttons: Approve / Edit / Reject
- Approve:
  - Creates a “Draft Run” config object that can be opened in Playground or App Factory with prefilled fields.
  - DOES NOT start execution.
- Edit:
  - Allows adjusting Proposal fields or re-prompting the concierge.
- Reject:
  - Archives/discards proposal.

4) Persistence
- Persist proposals/drafts in whatever run storage pattern exists.
- If no server persistence exists, store locally (localStorage) under a stable key.
- Surface saved proposals in Runs/History (or the new Runs page as “Drafts”).

Constraints
- No orchestration execution changes.
- No MCP tool enabling yet.
- Keep UI consistent with theme and components.

STOP AFTER PHASE 1:
- Commit changes.
- Open PR #2: “Concierge: chat + proposal artifact + approve/edit/reject (no execution)”
- Include QA checklist: proposal generated, saved, visible in Runs, approve opens prefilled Run pages.

========================================================
PHASE 2 PR: PROPOSAL → RUN RECIPE (Stage 2)
========================================================
Objective
Approved proposals produce a deterministic Run Recipe that maps cleanly to existing orchestration config, and can prefill both Playground and App Factory.

Required changes
- Define RunRecipe type/version and mapping logic from Proposal.
- Ensure “Open in Playground” and “Open in App Factory” prefill reliably.
- Save Proposal + Recipe together in Runs/History.

STOP AFTER PHASE 2:
- PR #3.

========================================================
PHASE 3 PR: EXECUTE + NARRATE (Stage 3)
========================================================
Objective
Allow “Start Run” from an approved proposal/recipe. Concierge narrates run event stream in chat.

Required changes
- Start run via existing backend endpoints.
- Subscribe to existing SSE run event stream; narrate events in human language.
- Add explicit approval pauses for high-risk steps (repo write/export/tool enable). If backend can’t pause, split execution into stages client-side.

STOP AFTER PHASE 3:
- PR #4.

========================================================
PHASE 4 PR: TOOL ENABLEMENT + LEAST PRIVILEGE + AUDIT (Stage 4)
========================================================
Objective
Concierge can recommend tooling, but enabling/installing requires explicit approval and is logged.

Required changes
- Tool enablement workflow with scopes (read/write, path allowlist).
- Tool audit view per run.

STOP AFTER PHASE 4:
- PR #5.

========================================================
PHASE 5 PR: MODES + PERSONALIZATION (Stage 5)
========================================================
Objective
Add Guided/Confident/Hands-off modes, store preference per user, and include Assumptions & Confidence in proposals.

STOP AFTER PHASE 5:
- PR #6.

Now begin with PHASE 0 only. Do not implement future phases yet.
Proceed step-by-step:
1) Locate nav + routing + layout components
2) Implement IA renames/regrouping + canonical routes + redirects
3) Implement global docs hub and unify existing help links
4) Implement first-launch tour with localStorage gating
5) Manual QA checklist and PR-ready summary
