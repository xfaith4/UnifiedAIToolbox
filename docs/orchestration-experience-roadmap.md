# Orchestration Experience Roadmap

Last updated: 2026-04-05

## Goal

Transform Unified AI Toolbox from a collection of powerful orchestration features into a coherent product journey where users can:

1. define what they want to build,
2. assemble the right prompt and agent collective,
3. run and supervise execution with confidence,
4. learn from each run, and
5. shape the next application chapter with the system.

This roadmap is focused on UX, use cases, information architecture, and workflow design. It is intentionally product-facing rather than implementation-led.

## Current state

Unified AI Toolbox already contains valuable building blocks:

- a narrative-first `Concierge` surface
- rich `Prompt Library` and `Agent Library` editors
- a powerful `Playground` for orchestration and swarm execution
- an `App Lifecycle` surface for application building and maintenance
- durable `Runs`, `Knowledge`, telemetry, and artifact tracking
- PowerShell and CLI orchestration entrypoints for advanced operators

The main product problem is not missing capability. It is fragmented storytelling.

Today, the user has to infer how these surfaces connect:

- `Home` shows telemetry, not intent capture
- `/` is still a placeholder
- `Concierge`, `Playground`, and `App Lifecycle` each feel like different front doors
- libraries are editable, but not clearly reusable in the moment of building
- orchestration modes are mixed together in ways that make expert power visible before user confidence exists
- docs and route aliases suggest an architecture migration that is not fully resolved in the UI

## North star

Unified AI Toolbox should feel like a creative operations studio for application building.

The system should tell one story:

`Intent -> Proposal -> Cast -> Run -> Review -> Learn -> Next chapter`

The user should not feel like they are choosing between unrelated tools. They should feel like they are moving through a guided production pipeline where prompts, agents, tools, runs, and knowledge are different lenses on the same work.

## Product principles

### 1. Narrative before mechanics

Lead with the application story and current objective, not the raw system topology.

### 2. Progressive disclosure

Show guided defaults first. Reveal graph controls, route-level detail, and advanced orchestration switches only when the user chooses them.

### 3. Reusable building blocks in context

Prompt and agent libraries should be selectable, previewable, and remixable inside the flow of starting work, not only in separate management pages.

### 4. Human authorship stays visible

The system should suggest, scaffold, and execute, but the user must always see where they can intervene, approve, redirect, or edit the narrative.

### 5. Runs are chapters, not logs

A run is more than a status badge. It is a readable story with setup, cast, decisions, blockers, artifacts, and lessons.

### 6. Memory should compound

Knowledge gathered from previous runs should improve future intake, agent selection, prompt choice, and risk framing automatically.

## Primary user journeys

### Journey A: Start a new application

User need:
Turn an idea into an execution-ready proposal and launch a guided build.

Target flow:

1. Describe the application idea in Concierge.
2. Receive a structured proposal with goals, risks, assumptions, and suggested build path.
3. Review the recommended prompt kits, agents, tools, and success criteria.
4. Approve the plan and launch into App Lifecycle.
5. Watch live execution as a readable production board.
6. Review artifacts and refinement suggestions.

### Journey B: Improve an existing repository

User need:
Bring an existing codebase into the system and let the toolbox help plan, execute, and review maintenance work.

Target flow:

1. Select repo and intent.
2. Let the system build repo context and identify safe change boundaries.
3. Assemble a repo-specific agent cast with permissions and risk gates.
4. Run guided maintenance with review checkpoints.
5. Export a PR package or continue into another iteration.

### Journey C: Curate reusable intelligence

User need:
Turn successful work into reusable prompts, teams, and playbooks.

Target flow:

1. Start from a successful run.
2. Extract the prompts, agents, tool scopes, and acceptance criteria that worked.
3. Save them as a reusable recipe, team, or template.
4. Use that recipe in future proposals.

### Journey D: Operate a portfolio of application stories

User need:
Understand what is being built, what is blocked, which patterns work, and where intervention is needed.

Target flow:

1. Open a story-centric home page.
2. See active initiatives, not just telemetry aggregates.
3. Drill into runs, decisions, blockers, and knowledge trends.
4. Re-launch or branch new work from prior outcomes.

## Target information architecture

The current Build / Run / Observe grouping is directionally correct, but the primary navigation should align to user intent.

### Proposed top-level IA

- `Studio`
  - the new narrative home and mission control
- `Ideas`
  - intake, Concierge, proposal history, requirements loops
- `Recipes`
  - prompt kits, agent teams, tool bundles, playbooks
- `Build`
  - App Lifecycle and repo execution flows
- `Runs`
  - live work, review, artifacts, approvals, swarm view
- `Memory`
  - knowledge, lessons, reusable patterns, comparisons
- `Admin`
  - MCP/tooling, settings, governance, diagnostics

### Mapping from current surfaces

- `Dashboard` -> `Studio`
- `Concierge` -> `Ideas`
- `Prompt Library` + `Agent Library` -> `Recipes`
- `Orchestrator` + `Engine` -> `Build`
- `Runs` stays `Runs`
- `Knowledge` -> `Memory`
- `MCP Library` + settings + operator tooling -> `Admin`

## Roadmap

### Phase 0: Clarify the product story

Outcome:
One visible, product-level narrative for the toolbox.

Deliverables:

- replace the placeholder `/` route with a real story-first landing page
- define the canonical user journey from idea to refinement
- audit route aliases, labels, and stale docs so naming matches the product story
- position `Concierge` as the guided front door and `App Lifecycle` as the execution environment
- add a concise “What happens next” strip on every major page

Success measures:

- reduced first-session drop-off
- fewer route bounces between `Concierge`, `Playground`, and `App Lifecycle`
- higher rate of users reaching first proposal or first run

### Phase 1: Turn libraries into recipes

Outcome:
Prompts and agents become composable building blocks for application work.

Deliverables:

- introduce reusable `Recipe` objects that bundle prompts, agent roster, tool permissions, and success criteria
- enable “use in proposal” and “use in build” actions directly from prompt and agent pages
- show provenance for prompts and agents used by successful runs
- support “save this run as a recipe”
- add starter kits by use case:
  - greenfield app build
  - repo maintenance
  - debugging and incident response
  - design critique
  - documentation and release work

Success measures:

- increased reuse of prompts and agent teams
- fewer manual setup steps per run
- higher conversion from library browsing to launched work

### Phase 2: Build the cast assembly experience

Outcome:
Agent selection feels like assembling a creative and technical team, not filling a checklist.

Deliverables:

- add a `Cast Builder` that recommends agents based on goal, repo context, and prior outcomes
- show why each agent is recommended, what it contributes, and what it costs
- support mode presets:
  - guided
  - balanced
  - autonomous
  - review-heavy
- separate required roles from optional specialists
- make tool permissions part of cast design, not an afterthought

Success measures:

- lower abandonment on orchestration setup
- improved agent mix consistency across similar tasks
- increased user edits that are purposeful rather than exploratory confusion

### Phase 3: Make runs feel like collaborative production

Outcome:
Users can understand and steer live execution without needing internal orchestrator knowledge.

Deliverables:

- redesign run detail around chapters:
  - setup
  - active cast
  - current scene
  - blockers
  - artifacts
  - decisions
  - lessons
- merge live telemetry, event stream, and artifact outputs into one readable timeline
- add intervention controls tied to moments:
  - approve
  - answer question
  - redirect
  - pause
  - branch
- make the swarm view a drill-down, not the default cognitive load
- surface “what changed because of you” when the user intervenes

Success measures:

- faster time to understanding a live run
- more successful requirement-resolution loops
- lower incidence of “stuck but unclear why” sessions

### Phase 4: Close the learning loop

Outcome:
Every run improves future proposals and execution quality.

Deliverables:

- connect `Knowledge` directly back into Concierge intake and recipe suggestions
- generate automatic “lessons learned” summaries after runs
- expose before/after comparisons between run attempts
- let users promote a lesson into:
  - recipe improvement
  - prompt revision
  - agent policy change
  - requirements checklist item
- add story threads so multiple runs can belong to one initiative

Success measures:

- increased rate of successful second attempts
- lower repeated failure patterns
- measurable reuse of lessons across related initiatives

### Phase 5: Portfolio and multi-story operations

Outcome:
Users can manage several application efforts as a coherent creative portfolio.

Deliverables:

- replace telemetry-only home emphasis with initiative boards
- group runs, proposals, recipes, and knowledge by application story
- add story health indicators:
  - momentum
  - risk
  - unresolved questions
  - artifact completeness
  - cost trend
- support branching from one story into another application or feature line
- add executive and operator views over the same underlying runs

Success measures:

- improved portfolio visibility
- reduced effort to resume dormant work
- stronger continuity across related build efforts

### Phase 6: Application production loop

Outcome:
The system moves from orchestrated planning to verifiably functioning application output.

Deliverables:

- add generated-app production gates as a first-class run concept
- verify install/build/test/smoke steps against the materialized app, not just the orchestration wrapper
- route failing evidence into targeted repair loops
- define delivery readiness states for `build_new_app` runs
- expose gate evidence clearly to both operators and learning systems

Success measures:

- higher percentage of `build_new_app` runs that end with runnable apps
- lower rate of “files generated, app not actually working”
- improved operator confidence in completion claims

### Phase 7: Delivery and deployment readiness

Outcome:
Runs end with outputs that are handoff-ready, not merely internally coherent.

Deliverables:

- package source, evidence, and readiness summary together
- add preview/screenshot or demo proof where relevant
- document deployment assumptions and runtime requirements
- make the final synthesis cite concrete gate evidence, not just agent narrative

Success measures:

- fewer manual steps after orchestration before review or handoff
- stronger trust in exported deliverables
- faster path from run completion to human acceptance

## UX backlog themes

### High-priority cleanup

- remove placeholder and legacy-first routes from the primary experience
- reconcile stale documentation and missing IA references
- unify naming across launcher, docs, pages, and APIs
- reduce mode overload inside `orchestrator/page.tsx`
- refresh `App Lifecycle` copy and supporting docs to match current stack and model strategy

### High-priority experience additions

- canonical story landing page
- recipe system
- cast builder
- story-threaded runs
- run chapter timeline
- lesson promotion flow

### Later-stage differentiators

- agent ensemble comparison mode
- branch a new application from prior run artifacts
- “director mode” for explicitly co-writing acceptance criteria and narrative beats
- public/private playbook marketplace backed by prompt and agent provenance

## Suggested sequencing

### Next 30 days

- define the canonical story model and update navigation labels
- ship a real landing page
- simplify front-door routing between Concierge and App Lifecycle
- document the new product narrative

### Next 60 days

- introduce recipe objects and contextual reuse actions
- add cast recommendation UX
- consolidate orchestration mode selection

### Next 90 days

- redesign runs around chapter-based storytelling
- connect knowledge back into proposal and recipe generation
- add story threads spanning proposals, runs, and lessons

### Next 120 days

- add generated-app production gates and readiness states
- prove install/build/smoke for common web app stacks
- route failing app-production gates into targeted repair loops

## Success metrics

Track both workflow performance and product understanding.

### Activation

- time from first launch to first proposal
- time from first launch to first run
- percent of users who reach a successful artifact-producing run

### Composition

- recipe reuse rate
- percent of runs launched from recommendations vs manual assembly
- average number of manual agent edits before launch

### Runtime confidence

- time to understand why a run is blocked
- intervention rate by type
- percent of blocked runs successfully resumed

### Learning loop

- percent of runs with promoted lessons
- second-attempt success rate
- prompt and agent updates sourced from prior runs

## Immediate recommendations

If only a small amount of work can happen first, prioritize these three moves:

1. make `/` the real narrative front door,
2. turn prompts and agents into reusable recipes inside the build flow,
3. make run detail read like a story with checkpoints and interventions.

Those three changes will do the most to transform Unified AI Toolbox from a capable orchestration workbench into a system that helps users write and refine application stories with it.

## 2026-05 modernization pass — status against this roadmap

The four-lane modernization pass landed canonical contracts and the run-telemetry
surface that the experience goals above depend on. Mapping:

### Satisfied (or substantially advanced)

- **Phase 3 — runs feel like collaborative production.** The Run Console now has
  a canonical agent-card surface, blockers panel, final-result panel, and
  artifacts panel driven by the same A2A and event contracts. Status clarity
  follows the 8-status state machine in
  [contracts/RUN_LIFECYCLE.md](contracts/RUN_LIFECYCLE.md). Live event stream
  has SSE replay via `Last-Event-ID` and a 15 s heartbeat
  ([contracts/EVENT_TAXONOMY.md](contracts/EVENT_TAXONOMY.md)).
- **Phase 4 — close the learning loop (partial).** Final summaries are now
  written atomically to `final_summary.json` with a stable shape, giving the
  knowledge surface a single artifact to read from. Promoting lessons into
  recipes is still outstanding.
- **Phase 7 — delivery readiness (partial).** The new manifest endpoint
  consolidates status, blockers, artifacts, and validation in one document so
  exports can cite concrete evidence.

### Remaining

- **Producer migration.** The orchestrator and agent runners must call the new
  canonical helpers (`appendEvent`, `indexArtifact`, `writeFinalSummary`) for
  the Phase 3 redesign to apply to new runs. See [ROADMAP.md](ROADMAP.md) →
  "Post-Modernization → Now".
- **Story threads, recipe promotion, portfolio boards (Phases 4–5).** Untouched
  by this pass; they remain on the experience roadmap.
- **Cast assembly UX (Phase 2).** No changes; the contracts make this easier to
  build but don't deliver it.

