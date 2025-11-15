# Canonical Prompt Schema & Component Architecture

This document locks in the shared schema and module boundaries for the consolidated prompt application. It reconciles the YAML-first workflow from `Prompt Library Projects/Ideal-Prompt-Library` with the React JSON editor in `Prompt Library Projects/PromptLibrary` and the FastAPI templates in `Prompt Library Projects/PromptService` while keeping AI-Orchestration hooks ready for automated review cycles.

## 1. Data Model Layers

1. **Identity & Governance** – versioned IDs, locale, owners, risk tier, provenance tags so every prompt is traceable (`prompts/catalog/*.prompt.yaml`).
2. **Content Blocks** – structured sections (`system`, `instructions`, `style`, `constraints`, `examples`, etc.) aligned with the PowerShell renderer.
3. **Execution Envelope** – model hints, token budgets, default sampling parameters, and provider payload presets (used by the React live preview and Prompt Workbench FastAPI service).
4. **Variables & Validation** – strongly typed inputs with defaults, validators, and labels to power UI forms and API validation.
5. **Testing & Telemetry** – golden examples, audit tags, PII flags, and test expectations leveraged by CI and Orchestration QA runs.

## 2. Canonical YAML Schema

```yaml
id: analytics.divisions.performance.summary        # unique, dot-delimited identifier
version: 2.1.0                                     # semver, increment for incompatible text or schema updates
locale: en-US                                      # i18n hook for future localization
status: active                                     # active | draft | deprecated
owners:
  - team-analytics@company.com
provenance:
  source: ideal-prompt-library                     # {ideal, react-ui, workbench, imported}
  created_at: 2024-10-15T00:00:00Z
risk_tier: low                                     # aligns with policies in Ideal Prompt Library
models:
  recommended: [gpt-4o-mini, gpt-4o]
  compatible: [gpt-4o-mini, gpt-4o, gpt-5]
  temperature: 0.2
  max_tokens: 1800
  top_p: 0.9
variables:
  division:
    label: Business Division
    type: string                                   # string | number | boolean | enum | list | json
    required: true
    validators:
      - regex: ^[A-Za-z0-9 _-]{2,64}$
  include_mos_detail:
    type: boolean
    default: false
blocks:
  system: >-
    You are a precise analytics explainer for contact-center leaders.
  instructions: >-
    Summarize KPIs for ${division}. Mention MOS ≤3.5 only when ${include_mos_detail}.
  constraints: |
    - Cite at least two quantified metrics.
    - Keep to 250 words.
  style: |
    - Plain English, executive tone.
    - Headings followed by bullet lists.
  examples:
    - input:
        division: Medicare
        include_mos_detail: true
      output: |
        ## Medicare — Oct 2025
        • Total conversations: …
outputs:
  format: markdown                                 # json | markdown | text
  schema: schemas/analytics.summary.schema.json    # optional JSON schema for LLM output
telemetry:
  tags: [analytics, monthly, genesys]
  pii: none
  audit:
    last_validated: 2024-11-10T12:00:00Z
    tests:
      - asserts:
          contains: "##"
        mode: render
integrations:
  ui:
    category: Analytics
    context: Executive KPI summary
    tags: [monthly, mos]
  workbench:
    endpoint: /api/prompts/analytics.divisions.performance.summary/render
  orchestration:
    review_policy: critical                         # critical prompts run through multi-agent critic by default
```

### Notes

- YAML remains the on-disk source of truth for Git workflows and the PowerShell renderer in `tooling/render/PromptLibrary.psd1`.
- `integrations.ui` mirrors the simplified schema that the React library expects (`title`, `category`, `context`, `tags`).
- `outputs.schema` points to JSON Schema definitions (leveraging the existing `schemas/` folder) so APIs can validate LLM responses.

## 3. Simplified JSON (UI/API Payload)

The React editor, APIs, and prompt refiner operate on a trimmed JSON payload. The backend converts between YAML ↔ JSON.

```json
{
  "id": "analytics.divisions.performance.summary",
  "title": "Division KPI Digest",
  "category": "Analytics",
  "context": "Executive-ready monthly KPI summary",
  "prompt": {
    "system": "You are a precise analytics explainer...",
    "instructions": "Summarize KPIs for {{division}}...",
    "style": ["Plain English", "Headings + bullets"],
    "constraints": ["Include two metrics", "<250 words"],
    "examples": [
      {
        "input": {"division": "Medicare", "include_mos_detail": true},
        "output": "## Medicare — Oct 2025..."
      }
    ]
  },
  "variables": [
    {"name": "division", "type": "string", "required": true},
    {"name": "include_mos_detail", "type": "boolean", "default": false}
  ],
  "models": {"recommended": ["gpt-4o"], "temperature": 0.2},
  "outputs": {"format": "markdown"},
  "tags": ["analytics", "genesys"],
  "version": "2.1.0"
}
```

## 4. Component Architecture

| Layer | Responsibilities | Existing Assets | Consolidation Action |
| --- | --- | --- | --- |
| **Prompt Registry (packages/prompt-registry)** | Parse YAML, enforce schema, expose render helpers for PowerShell/Python/Node. | `Ideal-Prompt-Library/tooling`, `PromptService/templates` | Create a language-agnostic core (Python package + PowerShell module wrappers) that every client imports. |
| **Prompt API (services/prompt-api)** | CRUD + render endpoints, refiner, execution history, orchestration triggers. | `PromptService/app.py`, `Invoke-SavedPrompt.ps1` | Upgrade FastAPI app to read from registry + database, expose REST/GraphQL. |
| **Prompt UI (apps/prompt-hub)** | React/Vite experience for browsing, editing, diffing prompts, launching refiners, exporting JSON. | `PromptLibrary/src`, `prompt-library-starter/prompt-library` | Point data layer to Prompt API, reuse existing components, add governance tabs. |
| **Workbench / CLI (apps/prompt-workbench, packages/prompt-cli)** | Streamlit, PowerShell scripts, BI connectors using the same API. | `PromptService/streamlit_app.py`, `Start-PromptWorkbench.ps1`, `Invoke-SavedPrompt.ps1` | Convert to API clients so there is zero local file divergence. |
| **Orchestration Bridge (apps/orchestration-bridge)** | Schedules multi-agent reviews, stores commissioner scores, auto-runs refiner. | `AI-Orchestration/scripts`, `AI-Orcheestration-New` | Provide adapters that push prompt updates into goals and read feedback back into registry telemetry. |

## 5. Validation & Tooling

1. **Schema Validation** – JSON Schema generated from the YAML structure (extends the existing `schemas/` folder). Ran via `uv run validate-prompts` (Python) and `pwsh ./tooling/lint/Test-PromptRepo.ps1`.
2. **Render Tests** – Golden tests from Ideal Prompt Library continue to execute, now invoked through the registry package.
3. **API Contract Tests** – FastAPI `pytest` suite ensures serialization matches the simplified JSON consumed by the UI.
4. **Orchestration Hooks** – Each prompt has `integrations.orchestration.review_policy`. A nightly job calls the AI-Orchestration API for prompts marked `critical` and stores reviewer deltas next to the YAML file metadata.

## 6. Migration Checklist

- [x] Inventory all source projects (`docs/consolidation/project_inventory.md`).
- [ ] Convert representative YAML → JSON prompts and confirm round-tripping through the new schema.
- [ ] Embed the schema into CI (PowerShell + Python validators).
- [ ] Update React data adapters to consume the simplified JSON.
- [ ] Replace Workbench template loading with registry-backed API calls.

This schema anchors every downstream integration so we can safely unify the prompt refiner, Prompt Library UI, and AI-Orchestration automation.
