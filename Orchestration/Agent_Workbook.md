“Product Creator Mode”
You are the Release Engineer. Your job is to prevent non-runnable artifacts.

Deliver a Repo Contract that MUST be satisfied by the final ZIP.
You must choose exactly ONE stack and enforce it everywhere (docs + code + scripts). The product requirements include a Trend Thesis Workbench with Trend Cards/Trend Map, skeptic mode, and walk-forward testing. (See user prompt.)

Repo Contract MUST include:
1) Stack decision: one sentence. (Example: "Next.js (app router) + Node API routes + SQLite + Vitest")
2) Folder layout (exact paths) and what lives where.
3) Exact commands that MUST work from a clean machine:
   - install
   - dev (frontend + backend if separate)
   - test
   - build
4) Required files must be REAL machine-readable files (no Markdown-in-JSON):
   - package.json (valid JSON)
   - lockfile (pnpm-lock.yaml or package-lock.json)
   - tsconfig.json (if TS)
   - .env.example
   - README.md that matches the repo
5) "Demo mode": app runs without any API keys using deterministic sample data, but supports real connectors later.
6) CI gate: add a GitHub Actions workflow that runs install + tests + build.

Output:
- docs/REPO_CONTRACT.md
- A checklist “PASS/FAIL” section at bottom that later agents must satisfy.
- A short “failure policy”: If any later agent violates the contract, they must fix it before moving on.

Do not write any feature code. Only define the contract.

BEGIN: ORCHESTRATION WORKFLOW SPEC (Machine-Executable)

Workflow Spec Purpose:
Convert this runbook into a deterministic, machine-executable plan that Unified AI Toolbox (or any orchestrator) can run without interpretation drift. This spec is a hard constraint: the pipeline MUST follow it.

Hard Rules:

- The orchestrator MUST execute stages strictly in order unless a stage explicitly allows retry.
- Each stage MUST emit its required outputs to disk at the exact paths specified.
- A stage MUST NOT begin until all required outputs from prior stages exist and pass gate checks.
- If a gate fails, the workflow MUST enter Fix Pass Mode (P0/P1 only) or halt, as specified.
- Any artifact labeled “machine-readable” MUST be a real file of the correct type (no JSON embedded in Markdown, no pseudo-files).

Workflow Format:
The following is the canonical workflow definition. If an orchestrator requires a different format, it MUST preserve the same fields and semantics.
Next step:
Agent: Product Strategist
Anchor: Your original mission + differentiation (Trend Cards, causal graph, uncertainty distribution, heuristics, skeptic mode)
Write a 1-page PRD for the Trend Thesis Workbench.

Must include:
- Personas
- Core flows:
  1) Explore trends
  2) Open Trend Card (thesis, causal graph, uncertainty bands, failure modes)
  3) Run skeptic mode (falsification attempt + leakage warnings)
  4) Walk-forward backtest and export research note
- MVP scope vs V2 scope
- Explicit non-goals (no financial advice, no "buy/sell" language)
- UX acceptance criteria (what the user can do in 5 minutes)
- docs/WORKFLOW_SPEC.json is a first-class artifact. Later agents MUST treat it as binding. If a later stage’s work contradicts the workflow or contract, the stage is invalid and MUST be redone.

Constraint:
The PRD must match the Repo Contract stack and folder layout.
Output: docs/PRD.md

Next step:
Agent: Architect + Data Engineer
Anchor: “pick realistic MVP scope” + ingestion abstraction + feature store + reproducible backtests
Design the MVP architecture that can be implemented in 1–2 days.

Hard constraints:
- Must comply with docs/REPO_CONTRACT.md.
- Must run in demo mode without external credentials.
- Must include an abstraction layer for data sources so we can swap later.
- Must have a minimal "feature store" concept with provenance timestamps.
- Must support walk-forward backtesting and leakage warnings (even if basic).

Deliver:
1) docs/ARCHITECTURE.md (modules + data flow)
2) docs/DATA_MODEL.md (tables/collections)
3) docs/API.md (endpoints with request/response)
4) docs/JOBS.md (what runs on schedule vs on-demand)

Next Step:
Agent: Full-Stack Engineer
Goal: A minimal app that boots and demonstrates the core flow.
Implement a vertical slice MVP that proves the product works.

Must include:
- Home page with "Latest Trends" list.
- Trend Card page that displays:
  - Trend name
  - Causal graph visualization (simple node/edge rendering is OK)
  - Uncertainty bands (best/base/worst with probability mass)
  - Failure modes
  - 3–7 heuristics with entry/invalidation/risk/horizon/expected-edge format
- "Skeptic mode" action that attempts to falsify the thesis and emits warnings.
- Walk-forward backtest page that runs on the MVP dataset and renders summary.

Data requirements:
- OHLCV via a single public source OR demo dataset.
- At least 2 additional metrics via deterministic demo providers.

Engineering requirements:
- Add scripts under scripts/:
  - scripts/dev
  - scripts/test
  - scripts/build
  - scripts/verify (runs install/test/build and a basic API smoke check)
- All configs must be machine-readable.
- Add at least:
  - unit tests for backtest engine + leakage checks
  - integration test for at least one API endpoint

Deliver:
- Working code + tests + updated README.md with exact run commands
- No placeholder “TODO: implement everything” endpoints.

Next step:
Agent: Verifier / Critic (Build + Quality)
You are the Build Verifier. Your job is to prove the repo is runnable and testable.

Run the Repo Contract checklist against the repo tree.
If you cannot execute commands in your environment, you must:
- ensure scripts/verify works
- ensure GitHub Actions workflow runs the verify script
- describe expected outputs and failure modes

You must check for:
- package.json validity (JSON)
- lockfile exists
- README matches repo
- scripts exist and are referenced in README
- tests present and runnable
- build produces artifacts

Deliver:
- docs/VERIFICATION_REPORT.md with PASS/FAIL per checklist item
- A Fix List (max 15 items), sorted by severity:
  P0 blocks running
  P1 blocks tests/build
  P2 polish
Hard rule:
If any P0 exists, DO NOT sign off. Require a fix pass.

Agent: Full-Stack Engineer (Fix-only mode)
Apply ONLY the P0 and P1 fixes from docs/VERIFICATION_REPORT.md.

Rules:
- No refactors.
- No new features.
- Keep patch small and targeted.
- Update verification report after fixes.

Deliver:
- Updated repo
- Updated docs/VERIFICATION_REPORT.md showing P0/P1 cleared


Mission: Build a production-ready, runnable, testable “Trend Thesis Workbench” crypto app.
It must be meaningfully unique: Trend Cards + Trend Map causal graph + uncertainty distribution + testable heuristics + skeptic mode + walk-forward backtesting + leakage warnings. (Do not devolve into an indicator dashboard.) (See attached prompt.)

Execution:
Run stages in order:
0) Repo Contract Lock (Release Engineer) — hard-stop gate
1) PRD + UX narrative
2) Architecture + Data model + APIs
3) Vertical slice implementation (MVP end-to-end)
4) Build Verifier Gate with PASS/FAIL report
5) Fix pass for P0/P1 only

Non-negotiables:
- Choose ONE stack and stick to it everywhere. (No Next.js docs with Fastify code, etc.) (The original prompt requires this.)
- Repo must run in “demo mode” with no API keys using deterministic sample data.
- ZIP must contain real config files (no Markdown-in-JSON).
- Provide scripts/verify and CI workflow that runs it.

Final outputs:
- repo.zip that runs
- README.md with exact commands
- docs/REPO_CONTRACT.md, PRD, ARCHITECTURE, DATA_MODEL, API, VERIFICATION_REPORT

