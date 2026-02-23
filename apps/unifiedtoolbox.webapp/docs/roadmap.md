# UnifiedAIToolbox — App Factory Roadmap

> **Vision:** A self-improving AI-powered app factory that doesn't just orchestrate agents —
> it learns from every run, verifies its own output, and ships real software autonomously.

---

## Current State (Baseline)

The platform today has:
- **Concierge** — goal articulation → structured Proposal via multi-turn AI chat
- **Orchestrator** — multi-agent runs (Commissioner, Engineer, Critic, Researcher, etc.)
- **Overseer** — internal health monitor; detects stuck/erroring agents, reclassifies false failures
- **Self-healing loop (v1)** — past-run Overseer findings injected into Concierge system prompt
- **Runs page** — run history with agent activity, Overseer log, timeline

**What the current system cannot do:**
runs end at `Final_Synthesis.html`; no verification, no shipping, no learning, no mid-run collaboration.

---

## Phase 1 — Closed Feedback Loop

> *"The run verifies its own output and retries on failure."*

### Problem
A run produces a synthesis document and stops. Nothing checks whether the proposed code
actually works. The Commissioner scores the *plan*; nothing scores the *result*.
The acceptance checks the Concierge generates are never executed.

### Goal
Transform the `run → output` boundary into a `run → verify → (refine → re-run)? → ship` cycle.

### Key Components

#### 1a. Sandbox Execution Engine
- Lightweight subprocess/container runner attached to the orchestration bridge
- Accepts a `run_dir` + `acceptance_checks[]` from the run manifest
- Executes each check (shell command, HTTP probe, or unit test suite) in an isolated env
- Emits `sandbox:*` events to the manifest (mirrors the `overseer:*` pattern)
- Writes `sandbox_report.json` to `run_dir`

#### 1b. Acceptance Check Evaluator
- Parses the proposal's `acceptance_checks` array into executable assertions
- Maps natural-language checks to executable forms:
  - `"Build passes with exit code 0"` → `npm run build`
  - `"No high-severity findings"` → lint/scan command
  - `"API returns 200 on /health"` → `curl -f http://localhost:PORT/health`
- Commissioner prompt updated to produce machine-executable checks alongside human-readable ones

#### 1c. Refinement Loop Controller
- After sandbox evaluation, if checks fail:
  - Inject failure report + failing checks back into the orchestration as a new `refine` event
  - Re-run the Engineer + Critic + Synthesizer agents with the failure context
  - Commissioner re-scores the refined output
  - Loop exits when: all checks pass, Commissioner score ≥ threshold, or max iterations reached
- Max iterations configurable per run (default: 3)
- Emits `loop:iteration_N` events so the UI can show loop progress

#### 1d. UI — Run Detail Loop View
- `/runs/[runId]` gains a "Verification" section showing sandbox report
- Each acceptance check shown as pass/fail with command output
- If loop ran: show iteration count + score progression across iterations
- Concierge's `RunStatusIndicator` updated with `verified` status badge

### Entry Criteria
- Phase 0 (current state) complete
- At least one run with acceptance checks in the manifest

### Exit Criteria
- A run with failing acceptance checks triggers a refinement loop automatically
- Loop terminates cleanly (pass, fail-with-report, or max-iterations)
- `sandbox_report.json` present in `run_dir` after every run

---

## Phase 2 — Agent Knowledge Base

> *"Agents remember what worked. The system gets smarter with every run."*

### Problem
Every run starts from zero. The Engineer doesn't know it built something similar before.
The Researcher doesn't know which tech choices have worked in this environment.
The same mistakes repeat because there's no institutional memory.

### Goal
A queryable knowledge store that agents consult at run start, fed by every completed run.
Commissioner scores flow back to power adaptive agent configuration.

### Key Components

#### 2a. Run Knowledge Ingestion Pipeline
- After each run completes (success or `completed_with_errors`):
  - Extract: goal, agent outputs, Commissioner score + rationale, Overseer observations, final status
  - Chunk and embed key agent outputs (Researcher facts, Engineer spec, Critic findings, Commissioner rationale)
  - Store in a local vector index (e.g. ChromaDB or SQLite + `sqlite-vec`) keyed by `run_id`
- Ingestion triggered by the existing `_oversee()` final sweep in `app.py`

#### 2b. Knowledge Query API
- New endpoint: `GET /knowledge/similar?goal={goal}&limit=5`
- Returns: semantically similar past run summaries with Commissioner scores, key facts, risk patterns
- Agents receive a `[KNOWLEDGE CONTEXT]` block prepended to their prompt at run start
- Context is goal-weighted — Researcher gets research facts, Engineer gets implementation decisions

#### 2c. Run DNA — Goal → Config Mapping
- Track Commissioner score per `(goal_category, agent_set, model)` tuple
- Goal categories inferred via keyword clustering (no LLM call needed)
- At run start, `Run DNA` recommends the agent configuration with highest historical approval rate for the detected goal category
- Concierge proposal panel shows "Recommended config based on N similar runs: ★4.2 avg"

#### 2d. Knowledge Dashboard
- New page or Observe section: `/knowledge`
- Shows: total runs indexed, top-performing agent configs per goal category
- Allows manual tagging of runs as "exemplar" (boosted weight in future queries)
- Overseer findings searchable across all runs

### Entry Criteria
- Phase 1 complete (so verified runs enter the knowledge base with richer signal)

### Exit Criteria
- Agent prompts demonstrably contain relevant facts from prior runs
- Commissioner approval rate measurably improves over 10+ runs on similar goals
- Knowledge dashboard is queryable and shows trend data

---

## Phase 3 — Mid-Run Human Checkpoints

> *"Agents can pause and ask. Humans answer once, then step back."*

### Problem
The human approves a proposal, then disappears until the run ends. The most consequential
decisions — which implementation approach, which trade-off to accept — happen mid-run with
no human input. Agents guess or pick arbitrarily.

### Goal
A first-class pause/resume protocol that lets any agent ask the human a targeted question
mid-run, wait for a response, then continue with full context preserved.

### Key Components

#### 3a. Checkpoint Protocol (PowerShell + Python)
- New agent type: **Checkpoint** — any agent can emit a `CHECKPOINT_REQUEST` to `agent_status.json`
- Schema: `{ "agent": "Engineer", "checkpoint": true, "question": "...", "options": ["A", "B"] }`
- `app.py` Overseer detects `checkpoint: true` in any agent status entry
- Emits `checkpoint:pending` event; pauses the subprocess loop (sends SIGSTOP or uses a named pipe/event)
- Run status transitions to `awaiting_input`

#### 3b. Checkpoint Response API
- New endpoint: `POST /orchestrate/run/{runId}/checkpoint`
- Body: `{ "response": "Option A", "agent": "Engineer" }`
- Writes response to `checkpoint_response.json` in `run_dir`
- Resumes the subprocess; run status transitions back to `running`
- Response injected into the requesting agent's prompt context

#### 3c. Concierge / Run Detail UI
- When `runStatus === 'awaiting_input'`, `RunStatusIndicator` pulses amber
- A `CheckpointModal` overlays the Concierge page (or Run Detail page):
  - Shows which agent is asking
  - Displays the question + options (if structured) or free-text input
  - "Answer & Resume" button calls the checkpoint response API
- Timeout: if no response in N minutes, checkpoint auto-resolves with the agent's default choice
  and emits `checkpoint:timed_out` event

#### 3d. Checkpoint History
- All checkpoint questions + responses logged to the run manifest's `checkpoints[]` array
- Shown in Run Detail page as a "Decisions" section
- Feeds Phase 2 knowledge base as high-signal human preference data

### Entry Criteria
- Phase 1 complete (checkpoint responses can influence refinement loop)

### Exit Criteria
- A run can pause mid-execution, receive a human response, and resume without losing agent context
- Checkpoint history is visible in the Run Detail page
- Timed-out checkpoints handled gracefully (no run hangs)

---

## Phase 4 — Real Artifact Pipeline

> *"Runs ship code. Not documents."*

### Problem
The PRPublisher agent outputs `"pr": null`. There is no git pipeline. Every run ends as
`Final_Synthesis.html` — a document the human still has to act on manually.
The app factory builds plans for apps; it doesn't build apps.

### Goal
A complete delivery pipeline: `run output → git branch → PR → CI trigger → artifact registry`.

### Key Components

#### 4a. PRPublisher Agent — Full Implementation
- Currently a stub. Implement against the GitHub API (or local `git` CLI for non-GitHub repos):
  - Creates a branch from the synthesis output: `ai-factory/{run_id}`
  - Commits generated files (from `run_dir`) to the branch
  - Opens a PR with: run goal as title, Commissioner rationale as body, Overseer log as appendix
  - PR description auto-links back to the Run Detail page
- For local-only runs (no remote): creates a local branch + patch file

#### 4b. CI/CD Integration
- PR creation triggers CI via standard GitHub Actions / GitLab CI webhooks
- New endpoint: `POST /orchestrate/run/{runId}/ci-callback` — receives CI results
- CI pass/fail emitted as `ci:passed` / `ci:failed` events in the manifest
- Failed CI triggers Phase 1 refinement loop with the CI log as context (closing the loop fully)

#### 4c. Artifact Registry
- New data model: `Artifact` — `{ runId, type, path, prUrl, deployUrl, createdAt, status }`
- Stored in SQLite alongside existing run manifests
- New API: `GET /artifacts` — list all shipped artifacts
- New page: `/artifacts` (or tab in Observe section)
  - Shows every app/feature the factory has shipped
  - Status: `pr_open`, `pr_merged`, `deployed`, `reverted`
  - Direct links to PR, CI run, deployed URL

#### 4d. Deployment Integration (optional, pluggable)
- Post-merge webhook triggers deployment to configured target (Vercel, Railway, or custom)
- Deployment URL captured and stored in the artifact registry
- `deployed` status shown in the Run Detail page and Concierge sidebar

### Entry Criteria
- Phase 1 complete (artifacts only enter the registry after verification passes)
- At least one working GitHub token configured in Settings

### Exit Criteria
- A complete run produces a real GitHub PR with generated code
- PR contains Commissioner rationale and links back to the run
- CI results flow back into the run manifest
- Artifact registry shows the full history of shipped work

---

## Phase 5 — Hierarchical Orchestration

> *"Large goals decompose into coordinated sub-runs. The factory scales."*

### Problem
Every goal, regardless of size, goes through a single flat orchestration. "Build a full SaaS
application" and "fix one function" are treated identically. Large goals fail Commissioner
review because they're underspecified — not because they're impossible.

### Goal
A meta-orchestration layer that decomposes large goals into a dependency-ordered graph of
sub-runs, executes them in sequence or parallel, and synthesises the results upward.

### Key Components

#### 5a. Goal Decomposer Agent
- New agent: **Decomposer** — activated when the Concierge detects a goal above a complexity threshold
- Output schema:
  ```json
  {
    "sub_goals": [
      { "id": "sg1", "goal": "...", "depends_on": [], "agents": [...] },
      { "id": "sg2", "goal": "...", "depends_on": ["sg1"], "agents": [...] }
    ],
    "synthesis_strategy": "sequential | parallel | hybrid"
  }
  ```
- Concierge presents decomposition to the user for approval before any sub-run launches

#### 5b. Meta-Run Manifest
- New run type: `meta` — a parent run that owns and coordinates child runs
- Meta manifest: `{ runId, type: "meta", goal, sub_runs: [{id, status, runId}], status }`
- Each sub-run is a standard orchestration run with `parent_run_id` in its manifest
- Meta-run status derived from child run statuses (all complete → synthesise; any failed → retry or escalate)

#### 5c. Sub-Run Orchestrator
- New `app.py` route: `POST /orchestrate/meta` — accepts decomposed goal, launches sub-runs
- Sub-runs with no dependencies launch immediately in parallel
- Dependent sub-runs wait for their dependencies to reach `verified` status (Phase 1 integration)
- Results of completed sub-runs injected as context into dependent sub-runs

#### 5d. Rollup Synthesis
- After all sub-runs complete, a **RollupSynthesizer** agent:
  - Receives all sub-run `Final_Synthesis` outputs as input
  - Produces a unified `Meta_Synthesis.html` covering the full goal
  - Commissioner scores the meta-synthesis against the original top-level goal

#### 5e. UI — Hierarchical Run View
- Runs page: meta-runs shown with an expand arrow revealing child runs inline
- Run Detail page for meta-runs: shows the dependency graph (visual DAG) + per-sub-run status
- Concierge: when a meta-run is active, `RunStatusIndicator` shows aggregate progress

### Entry Criteria
- Phases 1, 2, and 3 complete (sub-runs benefit from knowledge base and checkpoints)

### Exit Criteria
- A goal like "Build a full CRUD API with auth, tests, and deployment config" decomposes
  into sub-goals that each complete and are synthesised into a unified deliverable
- Meta-run visible in the Runs page with child runs nested underneath
- Dependency ordering respected (no sub-run starts before its dependencies are verified)

---

## Phase 6 — Multi-Modal Input

> *"Show, don't just tell."*

### Problem
Every goal is text. Real problems start with a screenshot of a bug, a wireframe,
an existing codebase, or a Figma export. Forcing users to translate visual context
into words loses information and slows down the Concierge conversation.

### Key Components

- **Concierge file/image upload** — drag-and-drop or paste into chat
- **Vision API integration** — image analysed before being added to conversation history; extracted text/description injected as context
- **Repo URL as input** — Concierge accepts a GitHub URL, fetches repo structure via API, adds as `[REPO CONTEXT]` block
- **Screenshot-to-goal** — "Here's the error, fix it" as a first-class interaction pattern
- **File attachment in proposals** — reference files attached to a run as explicit agent input

---

## Phase 7 — Prompt Performance & Agent Evolution

> *"Agent prompts improve. The factory tunes itself."*

### Problem
Agent prompts are versioned but static. There is no signal flowing from Commissioner scores
back to prompt templates. Bad prompts repeat indefinitely.

### Key Components

- **Commissioner score tracking** per `(agent, goal_category, prompt_version)` tuple
- **A/B prompt variant system** — new prompt versions shadow-run alongside current; winner promoted after N runs
- **Agent performance dashboard** — score distributions, trend lines, per-agent contribution analysis
- **Auto-regression detection** — Overseer flags when a prompt change causes score drop > threshold
- **Prompt annotation** — humans can annotate specific runs: "this Engineer output was excellent" — boosts weight in Phase 2 knowledge base

---

## Cross-Phase Dependencies

```
Phase 1 (Feedback Loop)
    └─► Phase 2 (Knowledge Base)     — verified runs produce richer training signal
    └─► Phase 3 (Checkpoints)        — checkpoint responses influence refinement loop
    └─► Phase 4 (Artifact Pipeline)  — artifacts only shipped after verification passes
        └─► Phase 5 (Hierarchical)   — sub-runs depend on Phase 1 + 2 + 3
Phase 7 (Prompt Evolution)           — runs parallel to all phases; deepens with Phase 2
Phase 6 (Multi-Modal)                — independent; can start any time after Phase 1
```

---

## Guiding Principles

1. **Every phase closes a loop** — each one should make the system more autonomous, not just more capable.
2. **Overseer first** — before adding capability, ensure the Overseer can observe and advise on it.
3. **Human trust is earned incrementally** — Phase 3 (checkpoints) enables Phase 4 (shipping) enables Phase 5 (scale). Don't skip the trust-building steps.
4. **The manifest is the contract** — all state (sandbox results, checkpoints, artifact links, sub-run refs) lives in the run manifest. The UI and API are read-only projections of it.
5. **Degrade gracefully** — if Phase 2 (knowledge base) is unavailable, runs still complete. If Phase 4 (git) fails, runs still produce synthesis documents. Each phase adds value without breaking what existed before.
