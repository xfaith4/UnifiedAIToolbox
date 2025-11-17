# UnifiedAIToolbox

Unified orchestration playground that stitches together prompt/agent assets, a WPF desktop shell, and a lightweight web explorer.

## Repo layout

### Applications
- `apps/desktop` – WPF front-end that validates repos, runs orchestration scripts, and surfaces logs
- `apps/web` – Next.js web application for the unified toolbox
- `apps/dashboard` – React/Vite dashboard for prompts and orchestration (formerly prompt-hub)
- `apps/prompt-workbench` – Streamlit UI for prompt development
- `apps/orchestration-bridge` – Jobs & scripts connecting AI orchestration with the registry
- `apps/data-exploration` – Data exploration tools
- `apps/sensor-monitor` – Sensor monitoring application

### Services & Packages
- `services/prompt-api` – FastAPI service for CRUD, render, and orchestration operations
- `packages/prompt-registry` – YAML schema, validation, and render helpers
- `packages/prompt-cli` – CLI tools for local scripting
- `modules/PromptLibrary` – PowerShell module for loading/rendering prompts and agents

### Core Data & Documentation
- `data/` – Prompt definitions, agent manifests, and SQLite databases (source of truth)
- `docs/` – Architecture documentation, consolidation guides, and branding assets
- `scripts/` – Utility scripts including `Unified-Orchestration.ps1`
- `tests/` – Test suites and validation utilities including `Smoketest.ps1`

## Getting started

### 🚀 Quick Launch (Recommended)

**Visual Launch Portal:**
Open `launch-portal.html` in your browser for a visual interface with service status and launch commands.

**Windows (PowerShell):**
```powershell
.\LaunchUnifiedToolbox.ps1
```

**Linux/Mac/WSL:**
```bash
./launch.sh
```

**Docker (All Platforms):**
```bash
docker compose up -d
```

📖 **See [LAUNCH_GUIDE.md](LAUNCH_GUIDE.md) for detailed launch instructions, troubleshooting, and configuration options.**

### Prerequisites

1. **Install prerequisites**
   - Node.js 18+ (required for web apps)
   - Python 3.12+ (required for API service)
   - .NET 8 SDK + Visual Studio with WPF workload (optional, for `OrchestrationDesktop`)
   - PowerShell 7.4+ (optional, for modules/tests)
   - Docker & Docker Compose (optional, for containerized deployment)

2. **PowerShell module smoke test**

   ```pwsh
   pwsh ./Smoketest.ps1
   ```

   The script imports `modules/PromptLibrary`, renders a sample artifact into `data/artifacts`, and prints the simulated model output.

3. **Run orchestration scripts directly**

   ```pwsh
   pwsh ./scripts/Unified-Orchestration.ps1 `
     -RepoRoot $PWD `
     -GoalFile ./Goals/CurrentGoal.txt `
     -Model gpt-4o-mini `
     -MaxIterations 3 `
     -PassThreshold 7 `
     -CodexModel gpt-4o-mini
   ```

   Set `-SkipCodex` if you only want the prompt artifact generation step.

4. **Launch the desktop shell**
   - Open `UnifiedAIToolbox.sln` in Visual Studio and run the `OrchestrationDesktop` project (located in `apps/desktop/`).
   - Alternatively, use `Launch-Toolbox.bat` after building the solution.
   - Provide or paste an OpenAI API key when prompted (the key is cached only for the session).
   - Use *Tools → Milestone Dashboard* to trigger validation and orchestration runs.

5. **Additional launch methods**
   - **Windows batch:** `LaunchUnifiedDashboard.bat` for a simpler Windows launcher
   - **Visual portal:** `Launch-Portal.bat` or open `launch-portal.html` directly
   - **Advanced options:** See `LaunchUnifiedToolbox.ps1 --help` or `launch.sh --help`

6. **Access the services**
   - Dashboard UI: http://localhost:5173
   - Prompt API: http://localhost:8000
   - API Documentation: http://localhost:8000/docs
   - Web Portal: http://localhost:3000 (if using Next.js app)

## Testing helpers

- `tests/Schema.Tests.ps1` – Pester suite that ensures every prompt YAML file parses and contains the required metadata.
- `Smoketest.ps1` – regression check for the `PromptLibrary` module.
- `npm run build` in `apps/PromptWeb` doubles as verification that prompt YAML stays parseable by the Node builder.

## Next steps

The project has completed Phase 1 (Foundation & Launch Readiness) and is now **Production Ready**. 

**Current Status:** Milestone 1.5 (Enterprise Ready) - **Sprints 1 & 2 Complete!** ✅

For detailed roadmap and progress, see:
- **[SPRINT_PROGRESS.md](SPRINT_PROGRESS.md)** - Current sprint status and achievements ⭐
- **[PROJECT_PLAN.md](PROJECT_PLAN.md)** - Comprehensive plan for Milestone 1.5 (Enterprise Ready)
- **[SPRINT_BREAKDOWN.md](SPRINT_BREAKDOWN.md)** - Detailed sprint-by-sprint implementation guide

**Milestone 1.5 Progress (2/6 Sprints Complete - 33%):**
- ✅ **Sprint 1:** CI/CD pipeline with automated testing
- ✅ **Sprint 2:** SQLite prompt indexing and fast FTS5 search
- ⬜ **Sprint 3:** Real AI provider integration (OpenAI, Anthropic, Azure)
- ⬜ **Sprint 4:** GitHub automation (clone, Codex swarm)
- ⬜ **Sprint 5:** PR creation & 80%+ test coverage
- ⬜ **Sprint 6:** Performance optimization and security hardening

**Recent Achievements:**
- 43 tests passing (PowerShell, Python, React)
- Search API with FTS5 full-text search (<100ms)
- Reusable React search components with dark mode
- Zero security vulnerabilities (CodeQL clean)
