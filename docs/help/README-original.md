# UnifiedAIToolbox

Unified orchestration playground that stitches together prompt/agent assets, a WPF desktop shell, and a lightweight web explorer.

## Repo layout

- `apps/OrchestrationDesktop` – WPF front-end that validates repos, runs the orchestration PowerShell scripts, and surfaces logs.
- `apps/PromptWeb` – static site that builds a searchable catalog (`npm run build` ⇒ `dist/`) from `data/prompts`.
- `modules/PromptLibrary` – PowerShell module that loads prompts/agents from `data/`, renders templates, and writes artifacts to `data/artifacts`.
- `scripts/Unified-Orchestration.ps1` – orchestrator invoked by the desktop app and smoketests; shells out to `codex-multiagent-swarm/Orchestrate-Codex.ps1` when Codex runs are enabled.
- `tests` + `Smoketest.ps1` – quick validation utilities for prompts and orchestration flows.

Truth still lives in `data/` – YAML prompt definitions and agent manifests are the only inputs the tooling needs. SQLite indexing hooks will be added later via `Update-PromptIndex`.

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
   - Open `UnifiedAIToolbox.sln` in Visual Studio and run the `OrchestrationDesktop` project.
   - Provide or paste an OpenAI API key when prompted (the key is cached only for the session).
   - Use *Tools → Milestone Dashboard* to trigger validation and orchestration runs.

5. **PromptWeb**

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
