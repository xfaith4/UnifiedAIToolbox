/**
 * navConfig.ts
 * Single source of truth for sidebar navigation labels, routes, and section structure.
 * Import from here anywhere you need a nav label or canonical route.
 */

// ── Canonical routes (what the sidebar links to) ────────────────────────────
export const ROUTES = {
  home: '/',                   // canonical; /home and /overview redirect here
  concierge: '/concierge',     // new Phase 1 — Concierge chat + Proposal
  prompts: '/prompts',
  agents: '/agents',
  tooling: '/mcp-library',     // canonical; sidebar label = "Tooling"
  playground: '/orchestrator', // canonical; /playground redirects here
  appFactory: '/engine',
  runs: '/runs',               // Runs list page
  reports: '/milestones',      // canonical; /reports redirects here
  knowledge: '/knowledge',     // Phase 2 — Agent Knowledge Base
  settings: '/settings',
  help: '/help',               // global docs hub
} as const

export type RouteKey = keyof typeof ROUTES

// ── Redirect aliases (legacy → canonical) ───────────────────────────────────
export const ROUTE_ALIASES: Record<string, string> = {
  '/home': ROUTES.home,
  '/overview': ROUTES.home,
  '/dashboard': ROUTES.home,
  '/playground': ROUTES.playground,
  '/reports': ROUTES.reports,
}

// ── Nav section / item labels ────────────────────────────────────────────────
export const NAV_LABELS = {
  // section headers
  sections: {
    home: 'Home',
    build: 'Build',
    run: 'Run',
    observe: 'Observe',
    settings: 'Settings',
  },
  // item labels
  items: {
    home: 'Home',
    concierge: 'Concierge',      // Phase 1 — chat-first front door
    promptLibrary: 'Prompt Library',
    agentLibrary: 'Agent Library',
    tooling: 'Tooling',          // was "MCP Library"
    playground: 'Playground',    // was "Orchestrator"
    appFactory: 'App Lifecycle',
    runs: 'Runs',
    knowledge: 'Knowledge',      // Phase 2 — Agent Knowledge Base
    reports: 'Reports',          // was "Milestones"
    settings: 'Settings',
  },
} as const

// ── Page titles (used in <h1> inside each page) ──────────────────────────────
export const PAGE_TITLES = {
  home: 'Home',
  concierge: 'Concierge',
  prompts: 'Prompt Library',
  agents: 'Agent Library',
  tooling: 'Tooling (MCP)',
  playground: 'Playground',
  appFactory: 'App Lifecycle',
  runs: 'Runs',
  knowledge: 'Knowledge',
  reports: 'Reports',
  settings: 'Settings',
} as const
