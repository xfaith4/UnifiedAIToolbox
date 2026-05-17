UNIFIED AI TOOLBOX

Technical Architecture, Build Plan & Agent Execution Design

> **2026-05 update:** The canonical run lifecycle, agent-to-agent message
> envelope, event taxonomy, and blocker classifier are now specified in
> [contracts/](contracts/). Section 10 below ("Run Lifecycle & Contracts
> (2026-05)") summarizes them; the files in `contracts/` are the source of
> truth and override any conflicting statements elsewhere in this document.


| Origin Goal | Consolidate diverged Prompt Library, Prompt Refiner, and AI Orchestration projects into a single, coherent application with proper version control. |
| --- | --- |
| Source Path | G:\Development\20_Staging\AI-Toolbox\Prompt Library Projects\ |
| Status | Design — Pre-Implementation |
| Date | February 20, 2026 |

# 1. What You Actually Have

The uploaded codebase is a working PowerShell orchestration runtime — not a prototype. Before designing what to build, it's important to be precise about what already exists and what is genuinely missing.

## 1.1  Existing Runtime Inventory

| File | Layer | What It Does |
| --- | --- | --- |
| POF.ps1 | Core engine | Parallel Phase-1 agents (ForEach-Object -Parallel, ThrottleLimit 4), sequential gate chain Synthesizer→ValidationAuditor→Commissioner→Supervisor→Historian, JSON schema contract validation with one repair retry, SWARM_REQUEST protocol, value_score/GO/NO-GO routing, convergence detection. |
| MilestoneController.ps1 | Job router | Job-type routing via job_types.json, contract hash (sha256), run_state.json + events.ndjson real-time updates, learning_patterns.json feedback loop, deterministic agent dispatch (RepoContextBuilder, ReviewGate, PRPublisher), artifact index with MIME types, command-policy enforcement. |
| RunStore.psm1 | Persistence | SQLite with FTS5 full-text search across run goals/instructions/notes. WAL mode, SHA256 artifact hashing, structured run lifecycle: New → Running → Succeeded/Failed/Canceled. |
| AgentRoster.psm1 | Agent registry | Loads agent-library.json in thin (name+role+prompt) and full (including io_contract.output_schema) modes. Canonical source for all agent definitions. |
| ContextResolver.ps1 | Input pre-proc | Expands {variable} tokens, resolves #import and #requires context from directives — including private GitHub raw URLs with GITHUB_TOKEN auth. Produces a fully merged _ResolvedGoal.txt. |
| Improve-ValueScore.ps1 | Scoring | Keyword scoring engine (0–10 normalized), feedback→improvement-area mapper, and design mutation functions. Feeds Commissioner refinement loop. |
| Update-OrchestrationMetrics.psm1 | Telemetry | Parses Commissioner.txt from latest run, extracts score/PDI/trend/momentum, updates Milestone_Log.json and Metrics_Trend.json, feeds dashboard. |
| Orchestration_Common.psm1 | Shared utils | Test-OrchCli, Get-OrchMatchedFiles (glob include/exclude), Ensure-OrchDirectory, Ensure-OrchJsonFile. Aliased for backward compat. |
| Clean-Workspace.ps1 | Ops | Run retention by age, synth data cleanup, optional node_modules and build artifact purge. -DryRun mode. |
| Check-AgentExports.ps1 | CI gate | SHA256-based drift detection between canonical agent-library.json and exported Agents.json / Agents2.json. Exits 1 on drift — designed to run as a pre-commit or CI step. |

## 1.2  The Origin Goal — Honest Restatement

| CurrentGoal.txt (verbatim) "I have started building out a Prompt library several times and with dangerously terrible version control. I need help combining and reducing these libraries down to a single tool. I also have a prompt refiner app and an AI Orchestration App that could easily enhance this prompt library and vice versa. Please design a strategy for bringing everything in the following directory together as a single consolidated application." |
| --- |

This is not a synthetic demo problem — it is a real consolidation task. The orchestration machinery you have built is sophisticated enough to eat its own dog food: the system is capable of running the consolidation workflow that produced it. The missing piece is specifically the execution layer that writes files, not the planning layer that describes what to write.

# 2. The Critical Gap: Planning vs. Execution

The pipeline as-is operates at the analysis and planning level. Every agent in POF.ps1's Phase 1, the Synthesizer, ValidationAuditor, Commissioner, Supervisor, and Historian all write text about work. The Engineer milestone in MilestoneController.ps1 produces milestone_Implementation_Phase.md — a document describing code, not code itself.

| The Single Most Important Thing to Understand The gap between 'LLM output in a milestone file' and 'files on disk that compile and boot' is the entire app-builder problem. The contract system, gate validation, learning loop, SQLite store, and artifact index are all production-quality. The engine exists. It just needs to swing a hammer instead of write a memo. |
| --- |

## 2.1  What Smaller Models Can Actually Do

Given the existing architecture, here is an honest model assignment. The contract enforcement, parallel dispatch, and repair-retry loop you already have make smaller models viable for most of the pipeline:

| Task | Model Tier | Rationale |
| --- | --- | --- |
| Researcher, Critic agents | gpt-4o-mini | Summarization and gap analysis — already working in POF.ps1. |
| Boilerplate file generation | gpt-4o-mini | Route handlers, config files, schema types — strong with good task packets. |
| Commissioner value scoring | gpt-4o-mini | Your keyword scoring + LLM fallback is already effective. |
| Contract repair retry | gpt-4o-mini | Already implemented. Schema-guided correction is reliable. |
| Gate execution (install/tsc/lint) | Deterministic | pwsh subprocess with exit code. No LLM needed. |
| Architect task decomposition | gpt-4o or better | Must reason about stack, dependency ordering, and file DAG. |
| Complex business logic | gpt-4o or better | Non-trivial code that must be correct on first pass. |
| Gate failure repair | gpt-4o or better | Must understand compiler error in context and fix precisely. |

# 3. What Needs to Be Built

Three additions to the existing system will turn it from a planning pipeline into a genuine app builder. These are additive — nothing existing needs to be replaced.

## 3.1  The Architect Agent (Task Decomposition Layer)

The current Split-GoalIntoMilestones function uses keyword matching on the goal text to select pipeline stages (Researcher, Engineer, Critic, etc.). For app building, the Architect stage must instead produce a machine-readable task DAG — a list of 20–60 specific, file-level assignments.

The Architect agent output contract (io_contract.output_schema) should produce:

| Field | Description |
| --- | --- |
| stack | Chosen technology stack derived from project brief (e.g., Next.js + FastAPI + SQLite). |
| file_manifest | Ordered array of task packets. Each represents one file or one bounded feature unit. |
| dependency_graph | Which tasks must complete before others can start. Used to determine parallelism boundaries. |
| gate_criteria | Per-task acceptance criteria — the gate runner evaluates these after each file is written. |

### Task Packet Structure

Each entry in file_manifest is a self-contained task packet sent to a FileWriter agent:

| {   "task_id": "api-auth-routes",   "target_file": "apps/api/src/routes/auth.ts",   "description": "Implement JWT login/logout routes using Fastify.",   "io_contract": {     "imports": ["fastify", "@prisma/client"],     "exports": ["authRoutes"],     "input_types": ["LoginRequest"],     "output_types": ["LoginResponse", "TokenPair"]   },   "context_files": ["types/shared/index.ts", "apps/api/src/app.ts"],   "gate_criteria": ["tsc --noEmit", "eslint apps/api/src/routes/auth.ts"],   "model_tier": "standard",   "can_parallelize": true,   "depends_on": ["api-prisma-setup", "shared-types"] } |
| --- |

## 3.2  The FileWriter Agent (Execution Layer)

This is the missing piece. FileWriter is a new deterministic agent type, dispatched from Invoke-MilestoneAgent in MilestoneController.ps1 alongside the existing RepoContextBuilder, ReviewGate, and PRPublisher agents.

Unlike LLM agents, FileWriter's output contract is not a JSON blob — it is a list of files written to disk with SHA256 hashes. This makes its output directly consumable by the gate runner without any intermediate parsing.

### FileWriter Dispatch Logic (slot into Invoke-MilestoneAgent)

| elseif ($agentName -eq "FileWriter") {     $taskPacket = $Milestone.TaskPacket   # injected by Architect output     $contextBundle = Get-MinimalContext \         -ContextFiles $taskPacket.context_files \         -RepoRoot $RepoRoot      $fileModel = if ($taskPacket.model_tier -eq "advanced") {         $env:UAIT_ADVANCED_MODEL ?? "gpt-4o"     } else {         $Model   # default: gpt-4o-mini     }      $llmResult = Invoke-OrchestrationLlm \         -Model $fileModel \         -SystemPrompt (Get-FileWriterSystemPrompt) \         -UserPrompt (Build-FileWriterPrompt $taskPacket $contextBundle)      $writtenFile = Publish-AgentFile \         -TargetPath (Join-Path $RepoRoot $taskPacket.target_file) \         -Content    $llmResult.Output      $content  = $writtenFile \| ConvertTo-Json -Depth 5     $skipWrite = $true   # output is the file itself, not milestone_*.md } |
| --- |

The key design constraints for FileWriter:

- Each agent receives only its context_files — not the full repo. This is context minimization: prevents window pollution and improves output quality.

- The LLM is prompted to return raw file content only — no markdown fences, no explanation. The system prompt enforces this via io_contract.

- Publish-AgentFile writes the file and returns { path, sha256, bytes } — same shape as RunArtifacts in RunStore.psm1, so it integrates with the existing artifact index.

## 3.3  The Gate→Repair Loop (First-Class, Not a Fallback)

Your existing contract repair retry (one cycle, LLM-based) is excellent for JSON schema compliance. For code gates you need a different loop: deterministic gate execution feeding targeted LLM repair with the specific file and error.

The gate runner is a deterministic agent (no LLM) that runs after each FileWriter milestone:

| Gate | Command | Failure Routing |
| --- | --- | --- |
| Install | pnpm install | Halt run — dependency error requires human intervention. |
| Type check | pnpm tsc --noEmit | → Repair agent with tsc stderr + failing file content. |
| Lint | pnpm eslint {file} | → Repair agent with eslint output + file. Auto-fixable issues fixed deterministically. |
| Build | pnpm build | → Repair agent if tsc passed. Indicates bundler-specific issue. |
| Boot | node -e "require('./dist')" | → Repair agent with runtime error. Max 2 cycles before escalation. |
| Demo mode | Custom smoke test | Proof the app does what the brief said. Failing here escalates to human. |

| Gate→Repair Contract The Repair agent receives: (1) the gate name and exit code, (2) the full stderr/stdout of the gate command, (3) the content of the specific file that failed, (4) the original task packet io_contract. It returns only a patched version of that file — no other files may be modified. Max cycles: 3 before the run is marked Failed and the contract failure artifact is written. |
| --- |

# 4. The Consolidated Application Architecture

The three apps in G:\Development\20_Staging\AI-Toolbox\Prompt Library Projects\ — the Prompt Library, Prompt Refiner, and AI Orchestration App — should not be merged into one monolith. They should be consolidated into one repo with three distinct surfaces sharing a common data layer.

## 4.1  Application Surfaces

| Surface | Route | Responsibility |
| --- | --- | --- |
| Prompt Library | /library | Browse, search (FTS5 via RunStore pattern), tag, version, and import/export prompts. Single canonical source of truth. Replaces all diverged copies. |
| Prompt Refiner | /refine | OpenAI_Refiner.ps1 logic exposed as a UI. Takes a prompt, runs the refinement LLM call, shows before/after diff, saves result back to the Library on approval. |
| Orchestration Console | /orchestrate | Live view of POF.ps1 runs: pipeline stage progress, agent status (from agent_status.json), artifact list, Commissioner score, gate results. Wraps MilestoneController.ps1 as the backend. |
| Settings / Admin | /settings | OPENAI_API_KEY, model selection per agent tier, agent-library.json editor, job_types.json editor, workspace retention policy. |

## 4.2  Shared Data Layer

All three surfaces read from and write to the same SQLite database (RunStore.psm1 schema) and the same agent-library.json canonical registry. The prompt library is stored as a new Prompts table in the same SQLite DB — alongside Runs, RunNotes, and RunArtifacts — so FTS5 search works across everything.

| Table | Content |
| --- | --- |
| Runs | Existing. All orchestration run metadata. |
| RunNotes | Existing. Per-run log lines. |
| RunArtifacts | Existing. Files produced by runs with SHA256 hashes. |
| Prompts | New. prompt_id, title, body, tags (JSON array), version, created_utc, updated_utc, source (imported/manual/refined), run_id (FK to Runs if produced by orchestration). |
| PromptVersions | New. Full history of each prompt body. prompt_id FK, version integer, body, changed_by, changed_utc. |
| Runs_fts | Existing (FTS5). Extend tokenizer to also index Prompts.body and Prompts.title for cross-surface search. |

## 4.3  Stack Decision

The existing system is PowerShell + SQLite backend. The dashboard is a Node/React frontend (MilestoneDashboard). The consolidated app should follow the same pattern — do not introduce a new stack:

- Backend: PowerShell 7 HTTP listener (or thin FastAPI wrapper if Python is already present) exposing REST endpoints that invoke existing .ps1 scripts.

- Frontend: Next.js or plain React (already present in MilestoneDashboard). Three route surfaces sharing layout and auth.

- Database: Same SQLite file. Add Prompts and PromptVersions tables via migration. Do not split into separate DBs.

- Agent registry: agent-library.json remains canonical. Check-AgentExports.ps1 runs as a CI gate to detect drift.

- Version control: Single Git repo. The Version Control problem from the original goal is solved by the repo structure itself — one repo, one history, no diverged copies.

# 5. Input Design — What the System Accepts

The question of inputs is architectural, not cosmetic. The system currently accepts a goal text string. A genuine app builder needs a richer but still minimal input contract.

## 5.1  The Project Brief (Minimum Viable Input)

Everything derivable by the system should be derived. The user should only supply what cannot be inferred:

| Field | Required | Description |
| --- | --- | --- |
| goal | Yes | One paragraph describing what the app does. Plain language. ContextResolver.ps1 already expands #import directives to pull in additional context files. |
| users | Yes | Who uses it. Drives UI complexity decisions by the Architect. |
| core_workflow | Yes | 3–5 steps the app must support. Becomes the acceptance criteria for the Demo Mode gate. |
| inputs_outputs | Yes | Data shapes in / out. Becomes the io_contract types for the Architect's file manifest. |
| must_have | Yes | Non-negotiable features. Become required gate criteria. |
| stack_preference | No | Optional. If absent, Architect infers from goal + run_location. |
| run_location | No | local / cloud / both. Default: local. Drives export policy. |
| sensitivity | No | internal / public / pii. Default: internal. Drives security gate criteria. |

This brief is already partially described in the project-brief.md and requirements wizard output schema in the existing docs. It should be formalized as request.json with its own JSON schema, processed by the existing contract_compiler.ps1 via the RequestPath pathway already wired into MilestoneController.ps1.

## 5.2  Input Flow Through the Existing System

The input flow maps directly onto existing code — no new plumbing required:

- User submits project_brief.json via the UI (or drops it in OutputDir as request.json).

- MilestoneController.ps1 detects RequestPath, calls contract_compiler.ps1 to produce a job contract.

- job_types.json routes to build_new_app pipeline template.

- ContextResolver.ps1 pre-processes the goal field, expanding any #import directives.

- Architect agent (large model) produces file_manifest task DAG.

- FileWriter agents execute task packets in parallel (ThrottleLimit 4 from POF.ps1).

- Gate runner validates each file. Failures route to Repair agent.

- Demo Mode gate verifies core_workflow end-to-end.

- PRPublisher agent (existing) creates a PR with the generated code.

# 6. Incremental Build Plan

Each phase has a concrete gate that proves completion. Nothing is marked done until the gate passes. Phases 1 and 2 can be done without touching any existing files.

## Phase 0 — Consolidate the Repo (Week 1)

| Gate git log --oneline shows all three projects in one repo history. No duplicate prompt files exist. Clean-Workspace.ps1 -DryRun shows nothing stale. |
| --- |

- Create one Git repo at G:\Development\20_Staging\AI-Toolbox\unified-toolbox.

- Run Setup-RepoStructure.ps1 to create the canonical directory skeleton.

- Import the diverged Prompt Library directories into /data/prompt-library/ with git subtree or manual history import. Tag each source so provenance is preserved.

- Run Check-AgentExports.ps1 — it must exit 0 before proceeding.

- Add Prompts and PromptVersions tables to runstore.sqlite via a migration script.

- Deduplicate prompts: write a one-time PowerShell script that SHA256-hashes each prompt body, identifies duplicates, and imports unique prompts into the new Prompts table.

## Phase 1 — Wire the Prompt Refiner (Week 1–2)

| Gate Submit a prompt via the UI → OpenAI_Refiner.ps1 runs → before/after diff renders → accepting the refinement writes a new PromptVersions row and updates Prompts. |
| --- |

- Expose OpenAI_Refiner.ps1 as a backend endpoint (PowerShell HTTP listener or thin wrapper).

- Build the /refine UI surface — takes prompt text, calls the endpoint, shows diff.

- Wire the Accept action to the Prompts/PromptVersions SQLite tables.

- Ensure model selection reads from Settings surface (OPENAI_API_KEY, model choice).

## Phase 2 — Orchestration Console Live View (Week 2–3)

| Gate Start a POF.ps1 run → /orchestrate shows real-time stage progress from events.ndjson → run completes → artifacts are listed with download links. |
| --- |

- Build /orchestrate surface that polls events.ndjson and run_state.json (already written by MilestoneController.ps1 in real-time).

- Render pipeline stage list (from run_state.json .stages array), agent status cards (from agent_status.json), and artifact list (from artifacts_index.json).

- Wire the Commissioner score and PDI from Update-OrchestrationMetrics.psm1 into the dashboard.

- Add a Run History view backed by RunStore.psm1 Search-Runs FTS5 search.

## Phase 3 — Architect Agent + Task DAG (Week 3–4)

| Gate Submit a project brief → Architect agent produces a valid file_manifest with 10+ task packets → the DAG renders in the UI showing dependency edges. |
| --- |

- Add Architect to agent-library.json with io_contract.output_schema defining stack, file_manifest, dependency_graph, and gate_criteria.

- Add build_new_app pipeline template to job_types.json with Architect as the first stage.

- Run Generate-AgentExports.ps1 and verify Check-AgentExports.ps1 exits 0.

- Test with the CurrentGoal.txt consolidation task: submit the existing goal as input and verify the Architect produces a reasonable file_manifest for the unified-toolbox app itself.

## Phase 4 — FileWriter Agent + Gate Runner (Week 4–5)

| Gate A FileWriter task packet for a simple route handler (e.g., GET /prompts) produces a syntactically valid TypeScript file that passes tsc --noEmit and eslint. |
| --- |

- Add FileWriter dispatch block to Invoke-MilestoneAgent (see Section 3.2 code).

- Implement Get-MinimalContext: reads only the context_files listed in the task packet, not the full repo.

- Implement Publish-AgentFile: writes file to disk, returns { path, sha256, bytes }.

- Implement Invoke-GateRunner: sequential gate chain (install → tsc → lint → build → boot) with per-gate exit-code routing.

- Implement the Repair agent: receives gate name + stderr + file content, returns patched file only. Max 3 cycles.

- Wire the gate results into run_state.json and events.ndjson so the Console surface shows them in real-time.

## Phase 5 — Demo Mode Gate + End-to-End (Week 5–6)

| Gate Submit the full CurrentGoal.txt project brief → system generates a working Prompt Library CRUD app → all gates pass including Demo Mode smoke test. |
| --- |

- Implement Demo Mode gate: run a headless smoke test against core_workflow steps from the project brief.

- Wire PRPublisher agent (already exists in MilestoneController.ps1) to create a PR with all generated files.

- Run the full pipeline on the CurrentGoal.txt brief. The system should generate itself.

- Review output, identify repair failures, improve Architect prompt and task packet schema.

# 7. Version Control Strategy

The original goal specifically called out "dangerously terrible version control" as the core problem. The solution is structural, not procedural:

- One repo. All three apps, the orchestration engine, the agent library, and the prompt data live in one Git repository. No exceptions.

- Check-AgentExports.ps1 runs as a Git pre-commit hook. If agent-library.json and Agents.json drift, the commit is rejected.

- Prompts are stored in SQLite, not in files. SQLite files are committed to Git (appropriate for a <100MB dataset). This means prompt history is in Git history, not just the PromptVersions table.

- Generated code from orchestration runs goes into a feature branch via PRPublisher, never directly to main. The run_id is embedded in the branch name for traceability.

- Clean-Workspace.ps1 runs weekly (or on demand) to prune stale run folders. RunStore.psm1 retains the metadata even after artifacts are pruned.

- Setup-RepoStructure.ps1 is the single source of truth for directory layout. Running it on a fresh clone produces a fully functional workspace.

# 8. Files to Create or Modify

| File | Action | Purpose |
| --- | --- | --- |
| agents/agent-library.json | MODIFY | Add Architect entry with full io_contract.output_schema for file_manifest, dependency_graph, gate_criteria. |
| agents/agent-library.json | MODIFY | Add FileWriter and Repair entries with tight io_contracts. |
| job_types.json | MODIFY | Add build_new_app pipeline template with stage order: Architect → FileWriter(parallel) → GateRunner → Repair → DemoMode → PRPublisher. |
| scripts/Invoke-GateRunner.ps1 | CREATE | Deterministic gate chain (install→tsc→lint→build→boot). Returns structured gate_result.json. |
| scripts/Get-MinimalContext.ps1 | CREATE | Reads only context_files listed in a task packet. Returns concatenated context string. |
| scripts/Publish-AgentFile.ps1 | CREATE | Writes file content to target path, computes SHA256, returns artifact record. |
| scripts/RunStore-Migrate.ps1 | CREATE | Adds Prompts and PromptVersions tables to existing runstore.sqlite. Idempotent. |
| scripts/Import-PromptLibrary.ps1 | CREATE | One-time: SHA256-deduplicates prompts from diverged directories and imports unique entries into Prompts table. |
| supervisor/MilestoneController.ps1 | MODIFY | Add FileWriter and GateRunner dispatch blocks to Invoke-MilestoneAgent. Wire gate results into run_state.json. |
| contracts/build_app_request.schema.json | CREATE | JSON schema for the project brief (goal, users, core_workflow, inputs_outputs, must_have, etc.). |
| app/ | CREATE | Next.js app with /library, /refine, /orchestrate, /settings surfaces. Shared SQLite client via better-sqlite3. |

# 9. What Not to Change

As important as what to build is what to leave alone. The following are production-quality and should not be refactored:

- POF.ps1 — the parallel agent engine, contract validation, and repair retry loop are correct. Do not change the orchestration model.

- RunStore.psm1 — the SQLite schema, WAL mode, FTS5 setup, and SHA256 artifact hashing are correct. Add tables via migration; do not alter existing schema.

- AgentRoster.psm1 + Check-AgentExports.ps1 — the canonical registry + drift detection pattern is the right answer to the version control problem. Enforce it everywhere.

- MilestoneController.ps1 learning loop — the Update-LearningFromSupervisor / learning_patterns.json feedback mechanism is underutilized, not broken. Leave it and feed it better data as more runs complete.

- Orchestration_Common.psm1 aliases — backward compat aliases (Test-Cli, Ensure-Directory, etc.) must stay. Other scripts depend on them.

- ContextResolver.ps1 — the #import directive and GitHub token auth is the correct pattern for pulling external context. Do not replace it with inline prompt stuffing.

| Summary You have a production-grade orchestration runtime. The three additions that turn it into an app builder are: (1) an Architect agent that produces a file_manifest task DAG, (2) a FileWriter deterministic agent that writes files to disk, and (3) a Gate→Repair loop that validates and fixes code deterministically. Everything else — the contract system, learning loop, artifact index, SQLite store, FTS5 search, and run lifecycle — is already correct and should not be changed. |
| --- |

# 10. Run Lifecycle & Contracts (2026-05)

This section summarizes the canonical orchestration surface introduced by the
2026-05 modernization pass. The authoritative specs live in
[contracts/](contracts/); when this section and a contract document disagree,
the contract document wins.

## 10.1 Run flow

```text
                          user / API client
                                 |
                                 v
                       +---------------------+
                       |   Orchestrator      |  (only writer of run status)
                       +----+-----------+----+
                            |           |
              dispatch chain|           |aggregates envelopes
                            v           |
   +-------------+   +-------------+   |   +---------------+   +--------------+
   | Researcher  |-->|  Engineer   |<--+-->|    Critic     |-->| Synthesizer  |
   +-------------+   +-------------+       +---------------+   +------+-------+
                                                                       |
                                                                       v
                                                          +-----------------------+
                                                          | Commissioner (value)  |
                                                          +-----------+-----------+
                                                                      |
                                                                      v
                                                          +-----------+-----------+
                                                          |  Supervisor / Historian|
                                                          +-----------+-----------+
                                                                      |
                                                                      v
                                                            final_summary.json
```

Each arrow is an A2A envelope (see
[contracts/A2A_CONTRACT.md](contracts/A2A_CONTRACT.md)). Each transition the
orchestrator records emits exactly one canonical event (see
[contracts/EVENT_TAXONOMY.md](contracts/EVENT_TAXONOMY.md)).

## 10.2 Canonical run statuses

The 8 allowed values for run-level `status`
(see [contracts/RUN_LIFECYCLE.md](contracts/RUN_LIFECYCLE.md) for transitions):

| Status | Meaning |
| --- | --- |
| `queued` | Persisted, waiting for a worker. |
| `running` | A worker has picked it up; agents are executing. |
| `waiting_on_input` | Paused on a `clarification_needed` blocker. |
| `recovering` | Orchestrator is applying a recovery strategy after a blocker. |
| `blocked` | A `hard_blocker` or `soft_blocker` was raised; needs orchestrator action. |
| `validating` | All agents reached `final`; criteria are being checked. |
| `completed` | Terminal success. |
| `failed` | Terminal failure (attempt budget exhausted or fatal error). |

## 10.3 Canonical event types

The 13 event types that may appear in `events.jsonl`
(see [contracts/EVENT_TAXONOMY.md](contracts/EVENT_TAXONOMY.md) for payloads):

| Lifecycle stage | Event types |
| --- | --- |
| Run boundary | `run_created`, `run_queued`, `run_started`, `run_completed`, `run_failed`, `run_recovered` |
| Agent activity | `agent_started`, `agent_progress`, `agent_blocked`, `agent_completed` |
| Artifacts | `artifact_created` |
| Validation | `validation_started`, `validation_completed` |

## 10.4 New API endpoints

All endpoints are Next.js route handlers under
`apps/unifiedtoolbox.webapp/src/app/api/runs/[runId]/`:

| Endpoint | Purpose | Source |
| --- | --- | --- |
| `GET /api/runs/[runId]/manifest` | Canonical run manifest (status, agents, blockers, artifacts, validation). | `manifest.ts` |
| `GET /api/runs/[runId]/artifacts` | Listing from `artifacts.index.jsonl`. | `artifactIndex.ts` |
| `GET /api/runs/[runId]/events/canonical` | JSON snapshot **or** SSE replay-aware stream (with `Last-Event-ID`, 15 s heartbeat, `stream-end` sentinel). | `canonicalEvents.ts` |
| `GET /api/runs/[runId]/summary` | Enriched final summary derived from `final_summary.json`. | `finalSummary.ts` |

## 10.5 On-disk shape (per run)

Each run directory under the configured runs root contains:

| File | Writer | Purpose |
| --- | --- | --- |
| `events.jsonl` | `appendEvent` (`canonicalEvents.ts`) | Append-only canonical event log. |
| `artifacts.index.jsonl` | `indexArtifact` (`artifactIndex.ts`) | Append-only artifact index. |
| `final_summary.json` | `writeFinalSummary` (`finalSummary.ts`) | Atomic terminal summary (temp + rename). |

Legacy files (`events.ndjson`, `run_state.json`, `agent_status.json`) continue
to coexist for backward compatibility; they are not authoritative for the
canonical surface.

## 10.6 Contract index

- A2A envelope, blocker shape, final-answer contract, recovery, versioning:
  [contracts/A2A_CONTRACT.md](contracts/A2A_CONTRACT.md)
- Run state machine and transition rules:
  [contracts/RUN_LIFECYCLE.md](contracts/RUN_LIFECYCLE.md)
- Event types and payload contracts:
  [contracts/EVENT_TAXONOMY.md](contracts/EVENT_TAXONOMY.md)
- Blocker severity model and recovery strategies:
  [contracts/DECISION_LOCK.md](contracts/DECISION_LOCK.md)
