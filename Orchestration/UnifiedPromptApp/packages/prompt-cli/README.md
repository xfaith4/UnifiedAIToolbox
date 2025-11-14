# Prompt CLI Tooling

Modernizes the scattered PowerShell scripts (`QuickStart.ps1`, `Invoke-SavedPrompt.ps1`, `Start-PromptWorkbench.ps1`) into a cohesive CLI that talks to `services/prompt-api`.

## Features

- `prompt login` – configure API keys + endpoints.
- `prompt pull` / `prompt push` – sync YAML prompts locally.
- `prompt render <id>` – render with inline JSON or file-based inputs.
- `prompt refine <id>` – call the hosted refiner pipeline, preview diffs, and optionally raise PRs.
- `prompt test` – run schema + golden validations before commits.

PowerShell and Node entrypoints will coexist so Windows automation and cross-platform scripts share the same behavior.
