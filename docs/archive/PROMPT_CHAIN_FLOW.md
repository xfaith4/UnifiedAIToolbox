# Prompt Chain Flow Diagram

**Visual representation of the UnifiedAIToolbox rebuild process.**

---

## Overview Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    UNIFIED AI TOOLBOX REBUILD                    │
│                     Prompt Chain Workflow                        │
└─────────────────────────────────────────────────────────────────┘

                              START
                                │
                                ▼
         ┌──────────────────────────────────────┐
         │   PHASE 1: FOUNDATION                 │
         │   (3 prompts, 2-3 hours)              │
         │                                        │
         │   1.1 → Project Structure             │
         │   1.2 → Core Documentation            │
         │   1.3 → Build Scripts                 │
         └──────────────────────────────────────┘
                                │
                                ▼
         ┌──────────────────────────────────────┐
         │   PHASE 2: BACKEND                    │
         │   (5 prompts, 8-12 hours)             │
         │                                        │
         │   2.1 → FastAPI Structure             │
         │   2.2 → Prompt Management             │
         │   2.3 → Orchestration Engine          │
         │   2.4 → GitHub Integration            │
         │   2.5 → Artifact Normalization        │
         └──────────────────────────────────────┘
                                │
                                ▼
         ┌──────────────────────────────────────┐
         │   PHASE 3: FRONTEND                   │
         │   (5 prompts, 10-15 hours)            │
         │                                        │
         │   3.1 → Next.js Setup                 │
         │   3.2 → Core UI Components            │
         │   3.3 → Prompt Library UI             │
         │   3.4 → Orchestration UI              │
         │   3.5 → GitHub Integration UI         │
         └──────────────────────────────────────┘
                                │
                                ▼
         ┌──────────────────────────────────────┐
         │   PHASE 4: INTEGRATION                │
         │   (4 prompts, 6-8 hours)              │
         │                                        │
         │   4.1 → Cost Tracking                 │
         │   4.2 → MCP Integration               │
         │   4.3 → Run Observatory               │
         │   4.4 → Telemetry                     │
         └──────────────────────────────────────┘
                                │
                                ▼
         ┌──────────────────────────────────────┐
         │   PHASE 5: QUALITY & DEPLOY           │
         │   (5 prompts, 8-10 hours)             │
         │                                        │
         │   5.1 → Test Suite                    │
         │   5.2 → Deployment Config             │
         │   5.3 → User Documentation            │
         │   5.4 → Developer Docs                │
         │   5.5 → Final QA                      │
         └──────────────────────────────────────┘
                                │
                                ▼
         ┌──────────────────────────────────────┐
         │   PHASE 6: ADVANCED (OPTIONAL)        │
         │   (3 prompts, 4-6 hours)              │
         │                                        │
         │   6.1 → Parallel Teams                │
         │   6.2 → Requirement Wizard            │
         │   6.3 → Hardening Pipeline            │
         └──────────────────────────────────────┘
                                │
                                ▼
                             SUCCESS
                    Application Fully Rebuilt!
```

---

## Phase 1: Foundation (Detailed)

```
┌────────────────────────────────────────────────────────┐
│                  PHASE 1: FOUNDATION                    │
└────────────────────────────────────────────────────────┘

   Prompt 1.1                Prompt 1.2              Prompt 1.3
 ┌─────────────┐          ┌──────────────┐        ┌──────────────┐
 │  Project    │          │     Core     │        │    Build     │
 │  Structure  │ ───────▶ │ Documentation│ ─────▶ │   Scripts    │
 └─────────────┘          └──────────────┘        └──────────────┘
       │                         │                        │
       ▼                         ▼                        ▼
  Directory Tree            README.md              launch.sh
  package.json              AGENTS.md               Start-Toolbox.ps1
  .env.example              architecture.md         requirements.txt
  .gitignore                orchestration.md
                            integrations.md
```

---

## Phase 2: Backend (Detailed)

```
┌────────────────────────────────────────────────────────┐
│                   PHASE 2: BACKEND                      │
└────────────────────────────────────────────────────────┘

   Prompt 2.1       Prompt 2.2        Prompt 2.3        Prompt 2.4       Prompt 2.5
 ┌──────────┐    ┌───────────┐    ┌────────────┐    ┌───────────┐    ┌──────────┐
 │ FastAPI  │    │  Prompt   │    │Orchestrate │    │  GitHub   │    │ Artifact │
 │Structure │ ─▶ │Management │ ─▶ │  Engine    │ ─▶ │Integration│ ─▶ │Normalize │
 └──────────┘    └───────────┘    └────────────┘    └───────────┘    └──────────┘
      │               │                  │                 │                │
      ▼               ▼                  ▼                 ▼                ▼
   app.py      prompt_registry.py   orchestrator.py   github_api.py   normalizer.py
   config.py   routers/prompts.py   orchestrator_    routers/        blob_splitter.py
   auth.py     models/prompt.py     schemas.py        github.py       scaffolder.py
   database.py SQLite FTS5          Agent configs
```

---

## Phase 3: Frontend (Detailed)

```
┌────────────────────────────────────────────────────────┐
│                  PHASE 3: FRONTEND                      │
└────────────────────────────────────────────────────────┘

   Prompt 3.1     Prompt 3.2       Prompt 3.3       Prompt 3.4      Prompt 3.5
 ┌──────────┐   ┌──────────┐   ┌────────────┐   ┌───────────┐   ┌──────────┐
 │ Next.js  │   │  Core    │   │  Prompt    │   │Orchestrate│   │  GitHub  │
 │  Setup   │─▶ │   UI     │─▶ │ Library UI │─▶ │    UI     │─▶ │   UI     │
 └──────────┘   └──────────┘   └────────────┘   └───────────┘   └──────────┘
      │              │                │                 │              │
      ▼              ▼                ▼                 ▼              ▼
 next.config.js  AppLayout.tsx   PromptCard.tsx   WorkflowCanvas  RepoCard.tsx
 tailwind.config Header.tsx      PromptEditor     RunMonitor      PullRequestList
 tsconfig.json   Sidebar.tsx     PromptSearch     AgentActivity   OrchestDialog
                 theme.ts
```

---

## Phase 4: Integration (Detailed)

```
┌────────────────────────────────────────────────────────┐
│                PHASE 4: INTEGRATION                     │
└────────────────────────────────────────────────────────┘

   Prompt 4.1        Prompt 4.2        Prompt 4.3        Prompt 4.4
 ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐
 │   Cost     │   │    MCP     │   │    Run     │   │ Telemetry  │
 │  Tracking  │─▶ │Integration │─▶ │Observatory │─▶ │    &       │
 │            │   │            │   │            │   │ Monitoring │
 └────────────┘   └────────────┘   └────────────┘   └────────────┘
       │                │                │                │
       ▼                ▼                ▼                ▼
 cost_metrics.py  mcp_registry.py  api-server.js   telemetry_
 telemetry.py     orchestration_   Run storage     logger.py
 routers/         mcp_middleware   structure       health_check.py
 analytics.py     routers/mcp.py   UI explorer     monitoring dash
```

---

## Phase 5: Quality & Deployment (Detailed)

```
┌────────────────────────────────────────────────────────┐
│           PHASE 5: QUALITY & DEPLOYMENT                 │
└────────────────────────────────────────────────────────┘

   Prompt 5.1      Prompt 5.2       Prompt 5.3       Prompt 5.4      Prompt 5.5
 ┌──────────┐   ┌───────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
 │   Test   │   │  Deploy   │   │   User   │   │Developer │   │ Final QA │
 │  Suite   │─▶ │  Config   │─▶ │   Docs   │─▶ │   Docs   │─▶ │& Release │
 └──────────┘   └───────────┘   └──────────┘   └──────────┘   └──────────┘
      │              │               │               │              │
      ▼              ▼               ▼               ▼              ▼
   pytest        Dockerfile      getting-       CONTRIBUTING    Integration
   jest          docker-compose  started.md     development/    tests
   playwright    .github/        user-guide/    ADRs            Performance
   fixtures      workflows/      api-ref.md                     Security audit
```

---

## Component Interaction Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    SYSTEM ARCHITECTURE                           │
└─────────────────────────────────────────────────────────────────┘


    ┌────────────────────────────────────────────────────────┐
    │                    WEB BROWSER                          │
    │                                                          │
    │   ┌──────────────────────────────────────────────┐    │
    │   │    Next.js Frontend (Port 3000)              │    │
    │   │                                               │    │
    │   │  • Prompt Library UI                         │    │
    │   │  • Orchestration Designer                     │    │
    │   │  • GitHub Integration                         │    │
    │   │  • Analytics Dashboard                        │    │
    │   └──────────────────────────────────────────────┘    │
    └────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/REST
                              │
                              ▼
    ┌────────────────────────────────────────────────────────┐
    │         FastAPI Backend (Port 8000)                     │
    │                                                          │
    │  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐ │
    │  │   Prompt     │  │Orchestration │  │   GitHub    │ │
    │  │ Management   │  │   Engine     │  │ Integration │ │
    │  └──────────────┘  └──────────────┘  └─────────────┘ │
    │         │                 │                  │         │
    │         └─────────┬───────┴──────────────────┘         │
    │                   │                                     │
    │        ┌──────────▼──────────┐                        │
    │        │   Core Services      │                        │
    │        │                      │                        │
    │        │  • Authentication    │                        │
    │        │  • Cost Tracking     │                        │
    │        │  • Telemetry         │                        │
    │        │  • MCP Registry      │                        │
    │        └──────────┬───────────┘                        │
    └───────────────────┼────────────────────────────────────┘
                        │
           ┌────────────┼────────────┐
           │            │            │
           ▼            ▼            ▼
    ┌──────────┐ ┌──────────┐ ┌──────────┐
    │  SQLite  │ │  YAML    │ │ GitHub   │
    │ Database │ │ Prompts  │ │   API    │
    └──────────┘ └──────────┘ └──────────┘
                                    │
                                    ▼
                            ┌──────────────┐
                            │  OpenAI API  │
                            │              │
                            │ GPT-4, GPT-5 │
                            └──────────────┘
```

---

## Data Flow: Orchestration Run

```
┌─────────────────────────────────────────────────────────────┐
│              ORCHESTRATION RUN DATA FLOW                     │
└─────────────────────────────────────────────────────────────┘

   User Action              Frontend              Backend                 External
       │                       │                     │                       │
       │  1. Start             │                     │                       │
       │  Orchestration        │                     │                       │
       ├──────────────────────▶│                     │                       │
       │                       │  2. POST            │                       │
       │                       │  /api/orchestrate   │                       │
       │                       ├────────────────────▶│                       │
       │                       │                     │  3. Clone Repo        │
       │                       │                     ├──────────────────────▶│
       │                       │                     │  (GitHub API)         │
       │                       │                     │◀──────────────────────┤
       │                       │                     │                       │
       │                       │                     │  4. Initialize        │
       │                       │                     │  Supervisor Agent     │
       │                       │                     │                       │
       │                       │  5. SSE Stream      │                       │
       │                       │  (Real-time logs)   │                       │
       │                       │◀────────────────────┤                       │
       │  6. Display           │                     │                       │
       │  Progress             │                     │  7. Decompose Task    │
       │◀──────────────────────┤                     │  (Supervisor)         │
       │                       │                     │                       │
       │                       │                     │  8. Call OpenAI       │
       │                       │                     ├──────────────────────▶│
       │                       │                     │◀──────────────────────┤
       │                       │                     │                       │
       │                       │                     │  9. Execute Steps     │
       │                       │  SSE Updates        │  (Engineer Agent)     │
       │◀──────────────────────┤◀────────────────────┤                       │
       │                       │                     │                       │
       │                       │                     │  10. Generate Code    │
       │                       │                     ├──────────────────────▶│
       │                       │                     │  (OpenAI)             │
       │                       │                     │◀──────────────────────┤
       │                       │                     │                       │
       │                       │                     │  11. Normalize        │
       │                       │                     │  Artifacts            │
       │                       │                     │                       │
       │                       │                     │  12. Create PR        │
       │                       │                     ├──────────────────────▶│
       │                       │                     │  (GitHub API)         │
       │  13. Show PR          │  14. PR URL         │◀──────────────────────┤
       │  Link                 │  + Cost Report      │                       │
       │◀──────────────────────┤◀────────────────────┤                       │
       │                       │                     │                       │
       │  15. View Run         │  16. GET            │                       │
       │  Details              │  /api/runs/{id}     │                       │
       │                       ├────────────────────▶│                       │
       │                       │◀────────────────────┤                       │
       │                       │  (steps, decisions, │                       │
       │                       │   artifacts, cost)  │                       │
```

---

## Decision Tree: When to Use Which Prompt

```
                            Need to build something?
                                    │
                        ┌───────────┴───────────┐
                        │                       │
                    From Scratch?          Fix/Enhance Existing?
                        │                       │
                        ▼                       ▼
              ┌─────────────────┐    ┌─────────────────────┐
              │ Start with       │    │ Find relevant phase │
              │ Phase 1          │    │ and prompt          │
              │ (Foundation)     │    └─────────────────────┘
              └─────────────────┘              │
                        │                      │
                        ▼                      ▼
              ┌─────────────────┐    ┌─────────────────────┐
              │ Complete phases  │    │ Execute that prompt │
              │ in order:        │    │ with context        │
              │ 1 → 2 → 3 → 4    │    └─────────────────────┘
              │ → 5 (→ 6)        │              │
              └─────────────────┘              │
                        │                      │
                        └──────────┬───────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │ Test thoroughly │
                          └─────────────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │    Success!     │
                          └─────────────────┘
```

---

## Dependency Graph

```
              Phase 1 (Foundation)
                      │
          ┌───────────┼───────────┐
          │           │           │
      1.1 Project  1.2 Docs   1.3 Scripts
          │           │           │
          └───────────┴───────────┘
                      │
              Phase 2 (Backend)
                      │
          ┌───────────┼───────────┬───────────┐
          │           │           │           │
      2.1 FastAPI  2.2 Prompts 2.3 Orchestrate  2.4 GitHub  2.5 Normalize
          │           │           │           │           │
          └───────────┴───────────┴───────────┴───────────┘
                              │
                      Phase 3 (Frontend)
                              │
          ┌───────────────────┼───────────────────┬───────────┐
          │                   │                   │           │
      3.1 Next.js  3.2 Core UI  3.3 Prompt UI  3.4 Orch UI  3.5 GitHub UI
          │                   │                   │           │
          └───────────────────┴───────────────────┴───────────┘
                                      │
                              Phase 4 (Integration)
                                      │
                  ┌───────────────────┼───────────────────┐
                  │                   │                   │
              4.1 Cost        4.2 MCP         4.3 Run Obs    4.4 Telemetry
                  │                   │                   │
                  └───────────────────┴───────────────────┘
                                      │
                          Phase 5 (Quality & Deploy)
                                      │
              ┌───────────────────────┼───────────────────┬───────────┐
              │                       │                   │           │
          5.1 Tests      5.2 Deploy Config  5.3 User Docs  5.4 Dev Docs  5.5 QA
              │                       │                   │           │
              └───────────────────────┴───────────────────┴───────────┘
                                      │
                          Phase 6 (Advanced - Optional)
                                      │
                          ┌───────────┼───────────┐
                          │           │           │
                   6.1 Parallel  6.2 Wizard  6.3 Hardening
                          │           │           │
                          └───────────┴───────────┘
                                      │
                                  SUCCESS!
```

---

## Testing Pyramid

```
                        ┌─────────────┐
                        │     E2E     │  Phase 5.1
                        │  (Playwright)│  Prompt 5.1
                        └─────────────┘
                       /               \
                      /                 \
                ┌─────────────────────────┐
                │   Integration Tests     │  Phase 5.1
                │  (API + DB + OpenAI)    │  Prompt 5.1
                └─────────────────────────┘
               /                           \
              /                             \
        ┌───────────────────────────────────────┐
        │          Unit Tests                   │  Phase 5.1
        │  (pytest, jest)                       │  Prompt 5.1
        │  • Backend functions                  │
        │  • Frontend components                │
        │  • Utilities                          │
        └───────────────────────────────────────┘
```

---

## Release Checklist Flow

```
┌────────────────────────────────────────────────────────────┐
│                    RELEASE CHECKLIST                        │
└────────────────────────────────────────────────────────────┘

    ┌────────────────┐
    │  All tests     │
    │  passing?      │
    └───────┬────────┘
            │
            ├─ No ──▶ Fix and retest
            │
            ▼ Yes
    ┌────────────────┐
    │  Code          │
    │  reviewed?     │
    └───────┬────────┘
            │
            ├─ No ──▶ Review and improve
            │
            ▼ Yes
    ┌────────────────┐
    │  Security      │
    │  audit done?   │
    └───────┬────────┘
            │
            ├─ No ──▶ Run security scans
            │
            ▼ Yes
    ┌────────────────┐
    │  Documentation │
    │  complete?     │
    └───────┬────────┘
            │
            ├─ No ──▶ Complete docs
            │
            ▼ Yes
    ┌────────────────┐
    │  Performance   │
    │  acceptable?   │
    └───────┬────────┘
            │
            ├─ No ──▶ Optimize
            │
            ▼ Yes
    ┌────────────────┐
    │   READY TO     │
    │    RELEASE!    │
    └────────────────┘
```

---

## Continuous Improvement Cycle

```
        ┌──────────────┐
        │   Monitor    │
        │  Production  │
        └──────┬───────┘
               │
               ▼
        ┌──────────────┐
        │   Gather     │
        │   Feedback   │
        └──────┬───────┘
               │
               ▼
        ┌──────────────┐
        │   Identify   │
        │Improvements  │
        └──────┬───────┘
               │
               ▼
        ┌──────────────┐
        │    Select    │
        │   Relevant   │───────┐
        │    Prompts   │       │
        └──────┬───────┘       │
               │               │
               ▼               │
        ┌──────────────┐       │
        │   Execute    │       │
        │    Prompts   │       │
        └──────┬───────┘       │
               │               │
               ▼               │
        ┌──────────────┐       │
        │     Test     │       │
        │   & Deploy   │       │
        └──────┬───────┘       │
               │               │
               └───────────────┘
```

---

**End of Flow Diagrams**

For detailed prompt content, see: [PROMPT_CHAIN_REBUILD.md](./PROMPT_CHAIN_REBUILD.md)

**Last Updated**: 2026-02-14  
**Version**: 1.0.0
