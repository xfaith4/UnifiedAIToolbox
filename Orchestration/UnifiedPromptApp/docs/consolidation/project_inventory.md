# Project Inventory

## Prompt-Focused Repos
- **Ideal-Prompt-Library** (40 files, 69.2 KB) – # Ideal Prompt Library
  - Tech: powershell
  - Key dirs: demos, policies, prompts, schemas, tooling
- **Invoke-SavedPrompt** (1 files, 7.2 KB) – No README headline.
  - Tech: powershell
  - Key dirs: n/a
- **PromptGenerationLibrary** (2 files, 17.6 KB) – # PromptGenerationLibrary
  - Tech: n/a
  - Key dirs: n/a
- **PromptLibrary** (48 files, 391.7 KB) – # Prompt Library (React + Vite)
  - Tech: node, powershell
  - Key dirs: apps, patches, scripts, src
- **PromptService** (12 files, 120.1 KB) – ### BEGIN FILE: README.md
  - Tech: powershell, python
  - Key dirs: powerbi, templates
- **prompt-library-starter** (34 files, 97.1 KB) – No README headline.
  - Tech: node, powershell
  - Key dirs: prompt-library

## Orchestration & Supporting Apps
- **AI Orchestration** (0 files, 0.0 KB) - No README headline.
  - Tech: n/a
  - Key dirs: n/a
- **AI-Agent-Communication** (18 files, 101.0 KB) – No README headline.
  - Tech: python
  - Key dirs: AI-Agent-Communication
- **AI-Orcheestration-New** (96 files, 1541.2 KB) – No README headline.
  - Tech: node, powershell
  - Key dirs: AI-Orchestration
- **GeminiAIOrchestrator** (67 files, 3868.3 KB) – # Agentic Workflow Orchestrator
  - Tech: node, powershell, python
  - Key dirs: public, src
- **Goals** (17 files, 21.6 KB) – No README headline.
  - Tech: n/a
  - Key dirs: archive
- **MilestoneDashboard** (46 files, 535.5 KB) – # React + Vite
  - Tech: node
  - Key dirs: public, server, src
- **OrchestrationDesktop** (484 files, 64765.3 KB) – No README headline.
  - Tech: dotnet, powershell
  - Key dirs: Assets, Infrastructure, Models, Services, Themes, ViewModels, Views, bin, obj
- **Orchestrator** (8 files, 25.8 KB) – No README headline.
  - Tech: powershell
  - Key dirs: artifacts
- **codex-multiagent-swarm** (4 files, 10.4 KB) – No README headline.
  - Tech: powershell
  - Key dirs: n/a
- **modules** (1 files, 2.9 KB) – No README headline.
  - Tech: powershell
  - Key dirs: n/a
- **prompts** (2 files, 6.5 KB) – No README headline.
  - Tech: n/a
  - Key dirs: n/a
- **scripts** (16 files, 67.5 KB) - No README headline.
  - Tech: powershell
  - Key dirs: n/a

## Pending Integration Targets
- **AI Prompt Workbench** – Replace legacy Streamlit/Power BI tooling with a unified Streamlit console inside `apps/prompt-workbench`, wired to `services/prompt-api` for prompt listings, render previews, and run execution.
- **Prompt Hub React UI** – Rewire React data stores to fetch/sync via the Prompt API, expose agent/prompt runbooks (summary, reasoning, next steps), and add orchestration dashboards for a glanceable status view.
- **Orchestration Bridge Service** – Promote the current CLI into a persistent worker/queue that pulls supervisor tasks from the Prompt API, invokes refiner/multi-agent critics, and writes telemetry back into prompt YAML and dashboards.
- **Telemetry & Runbook Enhancements** – Capture structured references/reasoning for each run, expose them in the UI (Prompt Hub, Workbench) with export actions, and differentiate between Analyst/Executive views for readability.
