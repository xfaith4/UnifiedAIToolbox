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

1. **Install prerequisites**
   - .NET 8 SDK + Visual Studio with WPF workload (for `OrchestrationDesktop`).
   - PowerShell 7.4+ (for modules/tests).
   - Node.js 18+ (for `PromptWeb` build).

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

5. **Launch the unified web toolbox**
   - Use `LaunchUnifiedToolbox.ps1` to start the complete stack:
     - FastAPI Prompt API (default `http://localhost:8000`)
     - React/Vite Dashboard (default `http://localhost:5173`)
     - Optional: Streamlit Workbench (use `-EnableStreamlit` flag)
   - Or use `LaunchUnifiedDashboard.bat` for a simpler launch.

6. **PromptWeb** (if available in apps/)

   ```bash
   cd apps/PromptWeb
   npm install
   npm run build     # emits dist/ with prompts.json + static assets
   npm run preview   # serves dist/ at http://localhost:4173
   ```

## Testing helpers

- `tests/Schema.Tests.ps1` – Pester suite that ensures every prompt YAML file parses and contains the required metadata.
- `Smoketest.ps1` – regression check for the `PromptLibrary` module.
- `npm run build` in `apps/PromptWeb` doubles as verification that prompt YAML stays parseable by the Node builder.

## Next steps

- Flesh out `Update-PromptIndex` with SQLite indexing and add CI to run the Pester suite + PromptWeb build.
- Connect `Invoke-Model` to real provider SDKs/CLIs once credentials and quotas are available.
