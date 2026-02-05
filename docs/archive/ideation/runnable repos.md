
### **ROLE**

You are a senior engineer specializing in **build systems**, **CI-style acceptance gating**, and **orchestration pipelines**. You ship changes that make “success” mean “runnable repo,” not “tasks completed.”

### **CONTEXT**

I have an “App Factory” orchestrator that runs multiple specialist agents and then exports a ZIP repo. The current frontend (`engine.htm`) shows a Run Monitor, clusters, and an “Acceptance Checks” box — but these checks are static and the run can complete even when the output repo does not install/build/boot.

**Goal:** Make the orchestrator reliably produce **runnable repos** by adding a hardening layer:

* Repo Contract
* Normalizer/Assembler
* Real Acceptance Gates
* Patch-only Repair Loop
* And update the UI/engine state model so the frontend reflects these phases and blocks export until gates pass.

### **NON-NEGOTIABLE OUTCOMES**

1. **Source file purity**

   * Any code file (`.ts .tsx .js .jsx .py .go .cs .java .rb .ps1 …`) must contain **raw source only**.
   * Forbidden inside code files: Markdown fences (```), YAML frontmatter (`---`), headings like `## File:`, or narrative wrappers.
   * If agent output includes wrappers, the system **auto-normalizes** (strip wrappers) or fails the run with precise errors.

2. **Repo Contract**

   * A stack-specific checklist of required files, forbidden patterns, required env vars, and commands.
   * Run is not successful until the contract passes.

3. **Real acceptance gates**

   * Actually run commands to verify:

     * install
     * typecheck/lint (if configured)
     * build
     * boot + health checks
   * Capture logs and surface them in UI.
   * If any gate fails, enter repair loop.

4. **Patch-only repair loop**

   * Fix attempts must be minimal diffs (unified diff format preferred).
   * No repo-wide rewrites unless absolutely necessary.
   * Max repair cycles configurable (default 3).

5. **Human-visible artifacts**

   * `REPO_CONTRACT.json` (pass/fail + details)
   * `NORMALIZATION_REPORT.md`
   * `GATE_REPORT.md` (commands run, results, log pointers)
   * `PATCHLOG.md` (cycle-by-cycle what changed)

6. **UI/engine contract aligned**

   * The engine must expose pipeline stage status so the UI can show:

     * Agents → Assemble → Normalize → Contract → Gates → Repair (conditional) → Export
   * “Acceptance Checks” UI must become live and bound to gate results.
   * **Export remains disabled** unless gates pass (and contract/normalize pass).

---

# **WHAT TO BUILD**

## A) Pipeline stages (backend)

Add these stages to the orchestrator pipeline:

1. `agents_generate` (existing)
2. `assemble_repo` (new or formalize existing merge step)
3. `normalize_repo` (new)
4. `evaluate_repo_contract` (new)
5. `run_acceptance_gates` (new)
6. `repair_loop` (new, conditional)
7. `export_zip` (existing, but gated)

### Required behavior

* Always run: assemble → normalize → contract → gates.
* On failure: run repair loop (max N), re-run normalize+contract+gates each cycle.
* Only then enable export.

---

## B) Repo Contract module

Create a contract definition system:

### Contract schema (example fields)

* `stackId`
* `requiredFiles`: list of glob patterns
* `forbiddenPatternsByExtension`: map extension -> list of regex patterns
* `envVarsRequired`: list
* `commands`:

  * `install`
  * `typecheck?`
  * `lint?`
  * `test?`
  * `build`
  * `boot`: list of boot commands (api/web)
* `healthChecks`: list of checks:

  * `name`, `url`, `expectedStatus`, optional JSON checks

Provide at least one built-in contract:

* `node + pnpm workspace + next.js web + fastify api`

Output `REPO_CONTRACT.json` for every run.

---

## C) Normalizer module

Implement a repo normalization pass that:

* Walks the generated repo tree.
* For code files, strips common wrapper formats:

  * YAML frontmatter blocks (`--- ... ---`)
  * leading “## File:” / “# File:” headers
  * fenced code blocks: keep only the inner content if the whole file is wrapped
* After normalization, validate forbidden patterns are gone:

  * if any forbidden pattern remains, fail with:

    * file path
    * offending line numbers
    * pattern matched

Write `NORMALIZATION_REPORT.md` (what changed; files touched; any failures).

---

## D) Acceptance Gates runner

Implement a gate runner that:

* Runs commands from the contract (install, typecheck/lint/test as configured, build)
* Starts services for boot checks:

  * API + Web (dev or prod mode; pick whichever is most stable for your stack)
  * timeouts configurable
* Performs HTTP health checks with polling until pass or timeout
* Captures stdout/stderr logs to `gate-logs/`
* Writes `GATE_REPORT.md` with:

  * commands run
  * per-gate status
  * log file pointers
  * summarized error excerpt (first N lines) for quick scanning

---

## E) Patch-only Repair Loop

Implement a repair loop:

* Inputs:

  * failing gate
  * gate logs
  * contract expectations
  * normalization report
* Produces:

  * unified diffs (preferred) OR minimal targeted file replacements
* Applies patch
* Re-runs normalize + contract + gates
* Stops after `MAX_REPAIR_CYCLES` (default 3)

Write `PATCHLOG.md` capturing:

* cycle number
* failure summary
* patch summary (files changed)
* result of re-run gates

---

# **UI / ENGINE INTEGRATION REQUIREMENTS**

## 1) Extend engine run state with pipeline info

The frontend (engine.htm) currently shows clusters + “Acceptance Checks” section but does not reflect real gate outcomes.

Extend the engine’s run status payload to include a `pipeline` object like:

* `pipeline.stages[]` with:

  * `id`, `label`, `status` (pending/running/passed/failed/skipped)
  * `startedAt`, `endedAt` (optional)
  * `reportPath` (optional)
* `pipeline.gates.checks[]` with:

  * `id`, `label`, `status`
  * `logPath` and `reportPath` (optional)
* `pipeline.repair` with:

  * `status`, `cycle`, `maxCycles`

## 2) Make Acceptance Checks live

Bind the existing Acceptance Checks UI to real gate status:

* “Project builds successfully” → build gate
* “Lint/tests pass (if configured)” → lint/test gate (or show “skipped”)
* “App starts and primary workflow loads” → boot+health gates
* “Any required env vars are documented” → contract evaluation (README/env check)

Each failed check must expose a “View logs” link.

## 3) Export gating

Export must remain disabled unless:

* normalize: passed
* contract: passed
* gates: passed

Optionally: add an “Export anyway (unsafe)” behind an advanced toggle, but default remains blocked.

## 4) Visible pipeline stepper

Add a simple stepper UI above clusters:
Agents → Normalize → Contract → Gates → Repair (conditional) → Export

(Keep it minimal; no redesign required. Use existing styling.)

---

# **TESTS YOU MUST ADD**

### Normalizer tests

* Strips fenced code blocks cleanly
* Removes `## File:` headers
* Removes YAML frontmatter
* Fails when forbidden patterns remain
* Preserves valid code content

### Repo contract evaluator tests

* Missing required files fail with clear messages
* Forbidden patterns caught per extension
* Env var requirements are reported

### Integration-ish test

* Create a tiny generated repo with one `.ts` containing fences
* Run normalize + contract; confirm normalization fixes it and contract passes

---

# **CONSTRAINTS**

* Integrate into existing orchestrator architecture; don’t rewrite the world.
* Keep changes incremental and PR-friendly.
* Do not add external paid services.
* If you use Docker for dependencies, include a minimal `docker-compose.yml` only if needed by gates.

---

# **DELIVERABLES**

1. PR-ready code changes (modules + wiring)
2. Tests
3. Updated internal docs:

   * how to add a new stack contract
   * how to read gate reports
   * how to tune timeouts/repair cycles
4. A short PR summary: what changed, why, and how to verify locally

---

# **START**

1. Inspect current orchestrator runtime and how it reports cluster status to the UI.
2. Identify where to insert the new pipeline stages and how to persist reports.
3. Implement: Repo Contract + Normalizer + Gates + Repair loop.
4. Update engine status payload and wire UI to show live acceptance checks + stepper + export gating.
5. Add tests and provide verification steps.

