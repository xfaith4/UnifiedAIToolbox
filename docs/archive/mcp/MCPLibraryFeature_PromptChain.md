You are working inside the AI Toolbox monorepo.

Non-negotiables:
- Do not invent existing files. Inspect repository structure first.
- Prefer incremental change sets over rewrites.
- Every implementation step must include: (a) code changes, (b) tests or verification steps, (c) updated docs.
- Avoid TODO-only PRs. If you add TODOs, they must be non-blocking and tracked.
- Fail closed: security policy should deny by default until explicitly allowed.

Output rules:
- Always list files you changed/added with short rationale.
- Provide run instructions (dev + tests).
- Provide a rollback plan.

Stop conditions:
- If you detect missing context (framework unknown, DB unknown), pause and produce a short "Repo Facts Needed" section and proceed with best-effort assumptions labeled clearly.


GOAL: Establish ground truth about the AI Toolbox stack so later work is aligned.

TASKS:
1) Inspect the repo structure: frontend framework, backend framework, auth, DB, ORM, API pattern, logging, tests.
2) Identify existing plugin/tool integration patterns (any “connectors”, “libraries”, “registries”, “marketplace”, “modules”).
3) Identify how “jobs/runs” are represented (Orchestrator/App Factory). Find where policies could attach to a run.
4) Identify existing audit/logging/event systems (or note absence).
5) Produce a short “Architecture Facts” report and recommended insertion points for:
   - MCP registry ingestion adapter
   - MCP catalog storage (installed vs discovered)
   - search UI
   - per-run allowlist + policy engine
   - audit log

DELIVERABLES:
- Architecture Facts report (bulleted)
- Proposed module boundaries + folder locations (specific paths)
- Risks and unknowns (max 8)
- Minimal integration plan (3 milestones)

ACCEPTANCE:
- Mentions exact file paths and existing systems discovered.
- No speculation without labeling it as assumption.


GOAL: Convert the idea into a precise product/engineering spec with crisp scope.

INPUTS:
- Architecture Facts from Stage 0

OUTPUT:
Create an MCP Library feature spec that includes:

A) User stories:
- Browse/search MCP servers (from official registry + optional community feeds)
- View MCP server details (capabilities, install method, required secrets)
- Create collections (curated bundles)
- Install/enable/disable servers (recorded state)
- Bind collection(s) or explicit MCP allowlist to a job/run
- Enforce deny-by-default policy at runtime
- Audit MCP tool calls (who/when/what; redact secrets)

B) Data model:
- MCPServer (discovered metadata)
- MCPInstall (installed state, version pin, config)
- MCPCollection (user-curated)
- MCPRunAllowlist (run/job binding)
- MCPAuditEvent (append-only)

C) Security & trust model:
- Verification steps (source/provenance)
- Permission footprint display
- Egress/network policy
- Secret handling rules
- Threat model table: abuse case → mitigations

D) Non-goals (explicit):
- No “auto install random MCPs”
- No remote execution without explicit permission
- No credential harvesting

E) Acceptance criteria:
- Provide 10 acceptance checks, including security checks and UX checks.

FORMAT:
- Markdown spec
- Include “Phase 1 / Phase 2 / Phase 3” rollout plan.

ACCEPTANCE:
- Spec is implementable (fields, endpoints, UX flows are concrete).
- Security is deny-by-default and audit-first.



GOAL: Design the core backend contracts.

TASKS:
1) Define API endpoints (or RPC handlers) for:
   - registry sync / refresh
   - search/browse servers
   - CRUD collections
   - install records (create/update/disable)
   - bind allowlist to run/job
   - query audit logs

2) Define a Policy Engine interface:
   - Inputs: run context, requested MCP server/tool, args metadata
   - Outputs: allow/deny + reason + redaction directives
   - Default: deny

3) Define a runtime enforcement integration point:
   - Where tool calls happen
   - How to block
   - How to log

4) Define audit event schema & redaction rules.

DELIVERABLES:
- Endpoint table (route, method, request/response)
- Policy Engine pseudo-interface (language-appropriate)
- Data model (schema or ORM models) aligned to repo stack
- Sequence diagram (text-based) showing tool call → policy → audit

ACCEPTANCE:
- Addresses how the orchestrator/runtime invokes MCPs today (must align with Stage 0 facts).
- Clear denial reasons and logging.


GOAL: Implement ingestion from an upstream registry into your local catalog.

TASKS:
1) Implement an adapter for the official MCP registry (and optionally a secondary feed, but mark optional).
2) Normalize upstream fields into MCPServer records.
3) Add scheduled refresh OR manual refresh endpoint (choose best fit for repo).
4) Add caching and incremental update strategy (avoid full wipes).
5) Add tests for parsing + normalization.

DELIVERABLES:
- Code changes implementing adapter + storage updates
- Tests
- Docs: config for registry URL, refresh intervals, failure behavior

ACCEPTANCE:
- Works without external secrets.
- Fails gracefully if registry unreachable (serves cached data).
- Includes tests that validate normalization.


GOAL: Add the MCP Library UI, aligned with existing app patterns.

TASKS:
1) Add nav item “MCP Library”.
2) Pages:
   - Browse/Search list view (filter by tags, auth type, installable, verified)
   - Detail view (capabilities, permissions footprint, install instructions, provenance)
   - Collections (CRUD + add/remove servers)
   - Installations (enabled/disabled, version pin, config status)
3) Integrate with backend API.
4) UX must surface:
   - “Blast radius” / permission footprint
   - Verification status (official registry / community / local)
   - Clear warning banners for unverified sources

DELIVERABLES:
- UI components and routing
- API wiring
- Minimal styling aligned with app theme
- Basic UI tests (or existing framework equivalent)

ACCEPTANCE:
- Search is functional and responsive.
- Details page is information-dense but scannable.
- No “dark pattern” installs; explicit confirmations where needed.


GOAL: Put MCPs in the hands of the commissioner AND user by binding curated sets to runs.

TASKS:
1) Add “Allowed MCPs” selection to:
   - Orchestrator run config OR App Factory job definition (choose correct insertion point).
   - Support selecting:
     - (a) explicit servers
     - (b) a collection
2) Implement runtime enforcement:
   - Every MCP tool call checks Policy Engine
   - Deny-by-default
3) Add audit event emission for:
   - Allowed calls
   - Denied calls (with reason)
4) Add integration tests:
   - allowed server/tool call passes
   - not-allowed call fails closed
   - audit records created with redaction

DELIVERABLES:
- Code + tests + docs
- “How to add MCPs to a run” walkthrough

ACCEPTANCE:
- You can demonstrate a run that tries to call non-allowed MCP and is blocked.
- Audit log shows both blocked and allowed calls.


GOAL: Prove the feature works and doesn’t create a security foot-gun.

TASKS:
1) E2E workflow test plan:
   - refresh registry
   - search server
   - create collection
   - install/enable server record
   - bind to run
   - run triggers MCP calls
   - audit log shows events
2) Validate denial behavior:
   - unlisted MCP blocked
   - missing permissions blocked
3) Validate redaction:
   - secrets not logged
   - large payload truncation rules
4) Validate UX warnings:
   - unverified sources are clearly marked

DELIVERABLES:
- E2E test script(s) or automated tests
- Security checklist results
- Bugs found + fixes (if small) or tracked issues

ACCEPTANCE:
- Demonstrates at least one successful and one blocked MCP call.
- No secrets appear in logs.


GOAL: Improve quality without scope creep. One pass only.

TASKS:
1) Review code for:
   - policy bypass paths
   - missing input validation
   - missing error handling
   - inconsistent naming or folder structure
2) Recommend at most:
   - 5 high-impact fixes
   - 5 medium-impact fixes
3) Apply only high-impact fixes in this pass.
4) Ensure docs are coherent and run steps are correct.

DELIVERABLES:
- Patch set (high-impact only)
- Short report of remaining medium-impact items

ACCEPTANCE:
- No major refactors.
- No breaking API changes unless unavoidable and documented.


MISSION: Build an MCP Library feature inside AI Toolbox.

The feature must:
- Ingest MCP server metadata from the official MCP registry.
- Provide UI to browse/search servers, view details, and curate collections.
- Track installations (enabled/disabled, version pin, config).
- Let the commissioner and user bind explicit servers/collections to an orchestration run.
- Enforce deny-by-default tool call policy at runtime.
- Record audit events for allowed and denied tool calls with secret-safe redaction.

Success is measured by:
- An end-to-end demo: search → collection → bind to run → allow one MCP call → block another → audit shows both.
