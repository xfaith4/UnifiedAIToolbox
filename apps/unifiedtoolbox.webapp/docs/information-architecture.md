# Information Architecture — Unified AI Toolbox

> Last updated: 2026-02

## Workflow model

The product is organised around a deliberate 4-stage workflow that maps directly to the sidebar:

```
Home  →  Build  →  Run  →  Observe  →  Configure
```

| Stage | Purpose | Sidebar section |
|-------|---------|----------------|
| **Home** | Real-time health dashboard: costs, token usage, agent distribution | *Home* |
| **Build** | Create and refine prompts, agents, and tool servers | *Build* |
| **Run** | Launch multi-agent orchestrations or structured app-build pipelines | *Run* |
| **Observe** | Inspect the evidence trail of every run; view aggregate analytics | *Observe* |
| **Configure** | Set API keys and user preferences | *Settings* |

---

## Sidebar structure

```
Home
  └─ Home                  → /dashboard

Build
  ├─ Prompt Library        → /prompts
  ├─ Agent Library         → /agents
  └─ Tooling               → /mcp-library   (was: MCP Library)

Run
  ├─ Playground            → /orchestrator  (was: Orchestrator)
  └─ App Factory           → /engine

Observe
  ├─ Runs                  → /runs          (new first-class page)
  └─ Reports               → /milestones    (was: Milestones)

Settings
  └─ Settings              → /settings

[footer]
  └─ Help & Docs           → opens DocsHub modal
```

---

## Route map

### Canonical routes (sidebar links to these)

| Sidebar label | Canonical URL | Component |
|---------------|--------------|-----------|
| Home | `/dashboard` | `src/app/dashboard/page.tsx` |
| Prompt Library | `/prompts` | `src/app/prompts/page.tsx` |
| Agent Library | `/agents` | `src/app/agents/page.tsx` |
| Tooling | `/mcp-library` | `src/app/mcp-library/page.tsx` |
| Playground | `/orchestrator` | `src/app/orchestrator/page.tsx` |
| App Factory | `/engine` | `src/app/engine/page.tsx` |
| Runs | `/runs` | `src/app/runs/page.tsx` |
| Reports | `/milestones` | `src/app/milestones/page.tsx` |
| Settings | `/settings` | `src/app/settings/page.tsx` |

### Redirect aliases (old / friendly URLs → canonical)

| Alias | Redirects to |
|-------|-------------|
| `/home` | `/dashboard` |
| `/overview` | `/dashboard` |
| `/playground` | `/orchestrator` |
| `/reports` | `/milestones` |

Redirects are implemented as Next.js server-side `redirect()` calls in thin wrapper pages (no client-side JS required).

---

## Key files

| File | Role |
|------|------|
| `src/lib/nav/navConfig.ts` | Single source of truth for all route constants, section labels, item labels, and page titles |
| `src/app/layout.tsx` | Root layout — sidebar rendering, DocsHub state, FirstLaunchTour |
| `src/components/docs/DocsHub.tsx` | Global docs hub modal (accessible from every page) |
| `src/components/tour/FirstLaunchTour.tsx` | First-launch guided tour (localStorage-persisted dismissal) |
| `src/app/runs/page.tsx` | New Runs list page |
| `src/lib/nav/__tests__/navConfig.test.ts` | Unit tests for route constants and label correctness |

---

## Naming conventions

- **Nav labels** always use `NAV_LABELS` from `navConfig.ts` — never hardcode in JSX.
- **Route strings** always use `ROUTES.*` from `navConfig.ts`.
- **Page `<h1>`** should match `PAGE_TITLES.*` from `navConfig.ts`.
- **Old names** ("Dashboard", "Orchestrator", "Milestones", "MCP Library") appear only where absolutely backward-compatible (e.g., component function names like `OrchestratorPage`). Do not surface these in the UI.

---

## First-launch tour

- Shown once on first visit (or after upgrade).
- Dismissed permanently by clicking "Get started", the ✕ button, or "Don't show again".
- Persistence flag: `localStorage` key `utb_tour_dismissed_v1`.
- To reset the tour in development: `localStorage.removeItem('utb_tour_dismissed_v1')` in the browser console.

---

## Help & Docs hub

- Accessible from every page via the **"Help & Docs"** button in the sidebar footer.
- Also reachable from the mobile top bar.
- Single source of truth: `src/components/docs/DocsHub.tsx`.
- Contains: What this does · Core concepts · Quick start · Troubleshooting.
