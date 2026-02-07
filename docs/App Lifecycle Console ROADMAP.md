## Roadmap: Merge GitHub Maintenance into App Factory as “App Lifecycle Console”

You’re right: it’s a big move, but it’s *architecturally clean* if you phase it properly. The trick is to **treat Job Type as a first-class contract switch**, not a UI gimmick.

Below is a phased plan that gets value early, keeps risk contained, and forces the “separate job types” concept into the Supervisor brain from day 1.

---

# Phase 0 — Lock the vocabulary and contract boundaries

### Goals

* Define **Job Types** and what *must* change when you toggle.
* Produce contract schemas that are versioned and testable.

### Deliverables

* `job_types.json` (canonical definitions)

  * `build_new_app`
  * `maintain_existing_app`
  * (optional later) `stabilize_broken_repo`, `security_patch`, `dependency_bump`
* `contracts/` folder with versioned schemas:

  * `contracts/build_app_contract.v1.json`
  * `contracts/maintenance_contract.v1.json`
  * `contracts/common_run_contract.v1.json` (shared fields: run_id, agent roster, budget, logging, artifacts, gates)

### Acceptance criteria

* Contracts have a **shared common header** + **job-type specific body**.
* Toggle behavior is expressible as:
  `job_type => contract_schema + agent_roster + gate_policy + artifact_policy`

---

# Phase 1 — Supervisor awareness and routing (no UI changes yet)

### Goals

* Supervisor becomes “bilingual”: it understands both job types and routes to the correct pipeline behavior.
* This is the “brains first” phase.

### Deliverables

* Supervisor update:

  * **Job Type classifier** (explicit from UI later; for now, from config)
  * Contract validation step: refuses to run if contract doesn’t match schema
  * Pipeline template selection:

    * Build template vs Maintenance template
* `run_mode_matrix.md` or config:

  * For each job type: allowed stages, required stages, gate strictness, artifact types

### Acceptance criteria

* A maintenance run cannot start without repo identity and ref info.
* A build run cannot start with repo-specific invariants enabled (stack-lock rules shouldn’t apply).

---

# Phase 2 — Add the new agent: Repo Context Builder (Maintenance-only)

### Goals

* Make maintenance runs grounded in repo reality.
* Produce a structured “repo truth” record that the rest of the agents consume.

### New agent: **Repo Context Builder**

**Inputs**

* `repo`, `ref`, clone instructions (or local path)
* constraints (no stack change, diff budget, etc.)

**Outputs**

* `repo_context.json` (machine-readable)

  * language/tooling detection (package manager, solution files)
  * test commands discovered
  * CI workflows discovered
  * project layout summary
  * baseline status (build/test results, if runnable)
  * high-risk areas (hot files, churn areas)
  * recommended “safe” base branch and warnings (open PR count, recent commits)

### Acceptance criteria

* Downstream agents (Planner/Implementer/Verifier) consume `repo_context.json` and do not invent build commands.

---

# Phase 3 — Maintenance contract + gates (functional maintenance, still minimal UI)

### Goals

* Make “App Maintenance” actually safe and repeatable.
* Implement the **baseline gate** and **diff discipline**.

### Deliverables

* `maintenance_contract.v1` fields (suggested minimum)

  * `repo`: owner/name
  * `ref`: branch + optional commit SHA
  * `goal`: bugfix/enhancement description
  * `constraints`:

    * `no_stack_change: true`
    * `max_files_touched`, `max_loc_changed` (soft/hard)
    * `dependency_updates: disallow|patch_only|allow`
  * `gates`:

    * `baseline_required: true`
    * `tests_required: true`
  * `artifact_policy`:

    * PR as primary artifact
    * patch/zip optional
* Gate implementation:

  * **Baseline Gate:** build/test before change (or explicit “baseline broken” mode)
  * **Change Gate:** tests + lint after change
  * **Diff Gate:** check touched files / LOC / forbidden paths

### Acceptance criteria

* Maintenance runs produce a “change set” and evidence (test output summary) and fail fast if constraints are violated.

---

# Phase 4 — UI merge v1: Toggle + repo picker inside App Factory

### Goals

* Unify the experience without boiling the ocean.
* Keep all orchestration visualization where it belongs: in App Factory.

### Deliverables

* App Factory UI:

  * Job Type toggle: `Create New` / `Maintain Existing`
  * Maintenance path shows:

    * token status (existing GitHub auth)
    * **searchable combobox repo picker**
    * repo status panel: open PR count, last updated, default branch, CI status (basic)
* Contract panel updates:

  * Shows selected contract schema and validates in UI before run

### Acceptance criteria

* Switching job type visibly changes:

  * required input fields
  * agent roster shown
  * gates shown
  * output artifact expectations

---

# Phase 5 — PR-first workflow: branch/PR orchestration + “conflict avoidance”

### Goals

* Make maintenance produce PRs predictably and reduce conflicts by design.

### Deliverables

* PR workflow policy:

  * create maintenance branch naming convention: `maintenance/<run_id>/<slug>`
  * PR template body auto-generated (summary, evidence, rollback)
* “Conflict avoidance” guardrail:

  * If open PRs > N or churn high:

    * warn and require choice: base on default branch vs base on PR branch
* Artifact viewer:

  * “PR created” link + diff summary + files touched list

### Acceptance criteria

* Maintenance runs end with a PR artifact every time (or a clear failure reason).
* System provides “risk: low/med/high” signal based on repo status.

---

# Phase 6 — Lifecycle glue: Factory-created repo provenance + monitoring loop

### Goals

* Close the lifecycle loop: factory-created repos are “known objects” the system can manage.

### Deliverables

* When App Factory creates repos, it writes provenance:

  * topic tag (discoverable)
  * `.appfactory/metadata.json` (versioned provenance)
* Optional monitoring stage:

  * watch Actions workflows
  * watch releases/tags
  * show “health” status on repo card in picker

### Acceptance criteria

* “Only repos created by App Factory” filter works reliably.
* Maintenance can preferentially target “known repos” and load their preferred contracts.

---

## Supervisor requirements (non-negotiable for the whole roadmap)

The Supervisor must treat this as **two contract universes**:

* It must **refuse** mismatched contracts.
* It must load the correct:

  * agent roster
  * stage sequence
  * gate strictness
  * artifact policy
* It must log the job type at the top of the run and include it in every artifact record.

---

## Suggested file structure to keep this sane

* `contracts/`

  * `common_run_contract.v1.json`
  * `build_app_contract.v1.json`
  * `maintenance_contract.v1.json`
* `pipelines/`

  * `pipeline_build_app.v1.json`
  * `pipeline_maintenance.v1.json`
* `agents/`

  * `repo_context_builder.agent.json`
  * (existing agents)
* `supervisor/`

  * `job_router.ps1|ts`
  * `contract_validator.*`
  * `pipeline_executor.*`

---

## Why this phasing works

* Phases 0–1 make the **system architecture** correct before UI polish.
* Phases 2–3 make maintenance **grounded and safe** before you expose it widely.
* Phase 4 merges UI without destabilizing the engine.
* Phases 5–6 deliver “lifecycle” as an actual feature, not a slogan.

## Prompt Chain

### Prompt 1

You are Codex working inside the UnifiedAIToolbox repo.

North Star:
We are merging “Create New App” and “App Maintenance” into a single App Lifecycle Console.
This requires two separate job types with different contracts, agent rosters, gate policies, and artifact policies.
Job Type must be a first-class control plane primitive, not a UI-only toggle.

Your task scope is ONLY Phase 0 + Phase 1.

Phase 0 (Contract System):

1) Create versioned JSON schemas:
   * contracts/common_run_contract.v1.json (shared header + shared fields)
   * contracts/build_app_contract.v1.json (extends common)
   * contracts/maintenance_contract.v1.json (extends common)
2) Create a job type registry:
   * job_types.json mapping job_type -> schema file + pipeline template + default agent roster + gate policy + artifact policy
3) Implement a contract validation utility used by the supervisor.
   * must validate contract against the correct schema based on job_type
   * must fail fast with actionable errors
4) Add a contract hash to the run manifest (sha256 of canonicalized JSON).
   1) Canonical JSON hashing
     * sort keys
     * no insiggnificant whitespace
     * consistent newline handling

Phase 1 (Supervisor Awareness + Routing):

1) Update the supervisor/orchestrator entrypoint so job_type is an explicit input (config/env/cli).
2) Add job_type in every log line.
   1) log prefix
   2) output folder naming
   3) manifest fields
3) Implement deterministic routing:
   * load job_types.json
   * select pipeline template + policies based on job_type
   * validate contract BEFORE executing any stages
   * emit run_manifest.json at run start
4) Stage Policy:
   * represent required/optional/forbidden stages per job type
   * enforce forbidden stages at runtime
5) Add a “dry-run validate” mode now
   1) A CLI like: orchestrator --job-type maintain_existing_app --contract path.json --validate-only

Deliverables:

* contracts/*.json as above
* job_types.json
* supervisor/job_router.*and supervisor/contract_validator.*
* run_manifest.json generation at run start
* minimal unit tests (or smoke tests) for:
  * valid build_app_contract passes validation
  * valid maintenance_contract passes validation
  * unknown job_type fails
  * missing required fields fails
  * forbidden stage enforcement fails run with clear message

Constraints / Do Not:

* Do NOT modify UI pages.
* Do NOT add GitHub API calls.
* Do NOT implement repo ingestion, PR creation, or maintenance execution logic beyond routing/validation.
* Do NOT refactor unrelated code.
* Keep changes minimal and well-contained.

Output:

* Provide a short summary of files changed/added and how to run the validation tests locally.
