# CLAUDE.md — UnifiedAIToolbox

This file is read by Claude Code at the start of every session. It defines
how to reason about this repo, what decisions to make autonomously, and where
to stop and ask. Read it fully before touching any file.

---

## What This Repo Is

UnifiedAIToolbox is an AI orchestration platform. Its primary entry point is
`POF.ps1` (Prompt Orchestration Framework v4.1), which accepts a goal, runs a
multi-agent pipeline, and produces a deliverable artifact. The canonical
orchestration runner lives at `Orchestration/scripts/Unified-Orchestration.ps1`.
`MilestoneController.ps1` is a deprecated shim that forwards to it.

The platform distinguishes two kinds of state that must never be conflated:

1. **Orchestration metadata** — runtime labels (`run_id`, `job_type`,
   `app_type`, `current_stage`, `status`) written to `run_state.json` by
   `Update-PofRunState`. These describe the pipeline's own execution state.

2. **Specification** — the structured goal/contract the user provides. This is
   authoritative. It always wins over inferred metadata.

When these conflict, **the spec wins**.

---

## Known Bug: `Resolve-EffectiveAppType` Regex False-Positive

**File:** `POF.ps1`, function `Resolve-EffectiveAppType` (~line 509)

**Root cause:** The function detects `app_type` by running keyword regexes
against the full goal text. The `web` branch matches on
`\b(web|website|browser|next\.?js|react|html|css|frontend|dom)\b`. Because
specs routinely include **non-goals** like *"Do not create a web app. Do not
use React."*, these negation phrases trigger a false `web` match, causing the
entire pipeline to treat the run as a web build.

**Confirmed reproduction:** A Tkinter desktop spec with non-goals containing
`"Do not create a web app"` and `"Do not use React"` was classified as
`app_type: web`. This triggered false clarification blockers across
ConceptualModelContract, Commissioner, and Synthesizer — even though the
Engineer correctly built the desktop app.

**The correct fix:**

```powershell
function Resolve-EffectiveAppType {
    param([string]$GoalText, [string]$RequestedAppType)

    # Explicit caller-supplied value always wins.
    if (-not [string]::IsNullOrWhiteSpace($RequestedAppType)) {
        return $RequestedAppType.Trim().ToLowerInvariant()
    }

    $goal = ($GoalText ?? '').ToLowerInvariant()

    # Strip non-goals and negation context before keyword matching so phrases
    # like "do not create a web app" or "do not use React" cannot trigger a
    # false positive on the web detection branch.
    $positiveGoal = $goal -replace '(?s)(non.?goals?|do not|don.t|avoid|exclude|without)\b.*', ''

    if ($positiveGoal -match '\b(wpf|winforms|windows forms|xaml|desktop app|windows desktop|tkinter|pyqt|wxpython)\b') {
        return 'wpf'
    }
    if ($positiveGoal -match '\b(web|website|browser|next\.?js|react|html|css|frontend|dom)\b') {
        return 'web'
    }
    return 'unknown'
}
```

Key changes from current code:
- Strip negation context from goal text before regex matching.
- Added `tkinter`, `pyqt`, `wxpython` to the desktop detection branch so
  Python GUI apps classify correctly without requiring `-AppType wpf`.
- The `unknown` fallback is correct as-is — it must not default to `"web"`.

**When touching this function:** apply the fix above exactly. Do not widen the
stripping regex aggressively — it must not remove positive signal from the
goal's affirmative statements. Run the test suite after the change.

---

## Agent Pipeline Architecture (POF.ps1)

The pipeline runs inside a `for` loop (`$MaxIterations`, default 3). Each
iteration executes these phases in order:

| Phase | Agents | Execution | May Block? |
|---|---|---|---|
| 0 — Contract | ConceptualModelContract | Sequential | Yes — only here |
| 1 — Contributors | Researcher, Engineer, Critic, + others | **Parallel** (`ForEach-Object -Parallel`) | No |
| 2 — Synthesis | Synthesizer | Sequential | No |
| 3 — Validation | ValidationAuditor | Sequential | No |
| 4 — Evaluation | Commissioner | Sequential | No |
| 5 — Supervision | Supervisor | Sequential | No |
| 6 — History | Historian | Sequential | No |

Special pre-phase agents (`RepoContextBuilder`, `ReviewGate`, `PRPublisher`)
run only in `maintain_existing_app` job type. They are skipped (status:
`complete`, source: `skipped`) on `build_new_app` runs.

**Critical rule:** ConceptualModelContract is the **only** agent that may
issue a clarification blocker. When `job_type` is `build_new_app`, its
clarification requests are treated as **advisory** — the pipeline logs the
concern and continues. A blocker only halts execution when `job_type` is
`maintain_existing_app` or when the spec is genuinely self-contradictory
(not when it conflicts with a metadata field like `app_type`).

Phase 1 agents run in parallel. `$EffectiveAppType` and `$EffectiveJobType`
are passed into each parallel worker via the `$Work` object — they must not
be re-derived inside the parallel block.

---

## `run_state.json` Schema

Written by `Update-PofRunState`. Fields set on first write only (via
`ContainsKey` guards):

```json
{
  "run_id":        "<string>",
  "goal":          "<string — full goal text passed to POF>",
  "job_type":      "<string — from Resolve-EffectiveJobType>",
  "app_type":      "<string — from Resolve-EffectiveAppType>",
  "started_at":    "<ISO-8601 UTC>",
  "status":        "<running | blocked_requirements | complete | failed>",
  "updated_at":    "<ISO-8601 UTC>",
  "current_stage": "<string>",
  "requirements_request": "<object | null>"
}
```

`app_type` valid values: `"web"`, `"wpf"`, `"unknown"`. The value `"unknown"`
is the correct fallback — it signals that downstream agents should infer the
rendering environment from the spec rather than assume one.

---

## Worktree Isolation (Run-Orchestration.ps1)

`Run-Orchestration.ps1` is the DAG-plan runner with full worktree support.
It is separate from `POF.ps1`'s parallel agent execution.

**Branch naming:**
```
uaitb/<runId>/integration       <- run-level audit branch
uaitb/<runId>/step-<id>         <- per-step isolated worktree
uaitb/<runId>/quarantine/step-N <- failed step preserved for forensics
```

**Worktree lifecycle:**
1. `Initialize-RunIntegration` creates `uaitb/<run>/integration` off `main`
   with a worktree under `.uaitoolbox/runs/<run>/worktrees/integration/`
2. `New-RunWorktree` creates per-step branch + worktree under
   `.uaitoolbox/runs/<run>/worktrees/step-<id>/`
3. After each step, `Merge-RunWorktree`:
   - OK → commit, merge into integration, remove worktree, delete step branch
   - FAILED → rename to quarantine, remove worktree, preserve branch
4. `Complete-RunIntegration` optionally fast-forwards a target branch to the
   integration branch — only if not currently checked out anywhere

**Cleanup contract:**
- Success → integration + target fast-forwarded; all worktrees and step branches removed
- Failure → integration and quarantine branches preserved; worktrees removed
- `-PurgeOnFailure` → also drops quarantine branches
- `Remove-RunArtifacts` is idempotent

**When NOT to use worktrees:** `POF.ps1` parallel agent execution writes to
`$OutDir` artifact directories, not to repo files. Worktrees are for
`Run-Orchestration.ps1` DAG plans that mutate repo files directly.

---

## Blocking Gate Policy (Run-Orchestration.ps1)

Gates declared in plan JSON block wave progression unless verdict is `PASS`.

**Built-in gate types:**
- `Critic` — reads `winner.json` rubric, requires composite score ≥ threshold
- `Commissioner` — reads `commissioner_decision.json`, requires recommendation match
- `RunCommand` — shell command in integration worktree, requires exit 0
- `ContractValidator` — runs `supervisor/contract_validator.ps1`
- `Custom` — register via `Register-GateHandler -TypeName X -Handler { ... }`

**Verdict semantics:**
- `PASS` → wave proceeds
- `RETRY` (retries remaining) → step worktrees discarded, wave re-runs with
  gate failure reason injected into failing steps
- `RETRY` (no retries left) or `FAIL` (blocking) → run halts; branches preserved
- `FAIL` (non-blocking) → wave proceeds, failure recorded in summary

**Audit trail:** Every gate evaluation writes to
`<artifactRoot>/<plan>/gates/gate_<id>_attempt<N>_<HHmmss>.json`

---

## Agent Output Contracts

| Agent | Output format |
|---|---|
| ConceptualModelContract | Raw JSON only — no markdown, no code fences |
| Engineer | Raw JSON with `implementation`, `artifacts[]`, `tests[]`, `changes[]` |
| Critic | Raw JSON with `verdict`, `schema_validation`, `issues[]`, `ratings` |
| Synthesizer | Assembled deliverable; echoes clarification if blocker exists |
| Commissioner | JSON with `recommendation`, `value_score`, `confidence`, `conditions[]` |
| Researcher | JSON with `facts[]`, `facts_structured[]`, `risks[]` |

**Engineer `artifacts[]` rules:**
- One entry per source file
- `name`: relative path from project root (e.g. `src/main.tsx`, `tic_tac_toe.py`)
- `content`: raw source — no backtick fences, no `--- filename ---` separators
- `type`: optional, e.g. `code/python`, `code/typescript`, `config/json`
- Honor the tech stack from the spec exactly — if spec says Tkinter, output
  Tkinter; if spec says Vite+React, output Vite files, not Next.js files;
  if spec says WPF, output WPF XAML + code-behind

---

## How to Read a Task Request

Before writing any code, work through these in order:

1. **What does the spec explicitly say?** Locate `app_type`, `runtime`,
   `deliverable`, and tech stack directly from the spec text. Do not infer
   from `run_state.json` — it may contain a stale or incorrectly inferred value.

2. **Are there non-goals in the spec?** Read them first. Technology names in
   non-goals are **exclusions**, not inclusions. They must not influence
   `app_type` detection.

3. **Is this `build_new_app` or `maintain_existing_app`?** This determines
   which agents are active and whether ConceptualModelContract clarification
   requests halt execution or are treated as advisory.

4. **What is the minimum change that satisfies the contract?** Do not add
   features the contract does not specify. Non-goals are hard stops.

5. **What tests cover this change?** Identify existing coverage and any new
   tests required. Write tests alongside the implementation, not after.

---

## Key Files

| Path | Role |
|---|---|
| `POF.ps1` | Primary orchestration engine — agent pipeline, `run_state`, `app_type` resolution |
| `Orchestration/scripts/Unified-Orchestration.ps1` | Canonical runner (MilestoneController forwards here) |
| `Run-Orchestration.ps1` | DAG plan runner with worktree isolation and gate policy |
| `Invoke-AgentsSdkOrchestration.ps1` | Agents SDK runner — routes to `Orchestration/agents/agent_library_router.py` |
| `MilestoneController.ps1` | Deprecated shim — forward only, no logic |
| `agents/agent-library.json` | Canonical agent definitions (source of truth for agent prompts) |
| `Orchestration/agents/agent_library_router.py` | Python router for Agents SDK runs |
| `job_types.json` | Job type taxonomy |
| `contracts/` | Task contract schemas |
| `supervisor/contract_validator.ps1` | ContractValidator gate implementation |
| `data/prompts/` | Versioned prompt library |
| `AGENTS.md` | Worktree isolation and gate policy reference |

---

## Engineering Conventions

### Before Every Change

1. Identify which file owns the behavior you are changing
2. If touching `Resolve-EffectiveAppType` or `Update-PofRunState`, apply the
   known bug fix documented above — do not leave those functions unfixed
3. If adding a new agent, add it to `agents/agent-library.json` and assign it
   to the correct phase in the pipeline

### Definition of Done

- Requested changes implemented and scoped to the task
- `.gitignore` covers local orchestration artifacts (`.uaitoolbox/`, `runs/`)
- PR template includes "How to test" and "Done means..." sections
- README includes a short "Orchestration workflow" section if the orchestration
  flow was modified
- Any workflow attempt is reported with success or a clear blocker

### Do Not

- Default `app_type` to `"web"` — use `"unknown"` as the correct fallback
- Run keyword regex against full goal text that includes non-goals sections
- Let Phase 1 parallel agents re-derive `$EffectiveAppType` — it is passed in
  via `$Work`
- Add logic to `MilestoneController.ps1` — it is a deprecated shim
- Commit or push unless explicitly requested
- Expand scope beyond the task contract
