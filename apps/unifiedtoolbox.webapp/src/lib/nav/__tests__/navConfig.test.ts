import { describe, it, expect } from 'vitest'
import { ROUTES, ROUTE_ALIASES, NAV_LABELS, PAGE_TITLES } from '../navConfig'

describe('navConfig — ROUTES', () => {
  it('all route values are non-empty strings starting with /', () => {
    for (const [key, value] of Object.entries(ROUTES)) {
      expect(typeof value, `ROUTES.${key} should be a string`).toBe('string')
      expect(value.startsWith('/'), `ROUTES.${key} should start with /`).toBe(true)
    }
  })

  it('canonical routes match expected values', () => {
    expect(ROUTES.home).toBe('/dashboard')
    expect(ROUTES.playground).toBe('/orchestrator')
    expect(ROUTES.reports).toBe('/milestones')
    expect(ROUTES.runs).toBe('/runs')
    expect(ROUTES.tooling).toBe('/mcp-library')
  })
})

describe('navConfig — ROUTE_ALIASES', () => {
  it('legacy aliases redirect to correct canonical routes', () => {
    expect(ROUTE_ALIASES['/home']).toBe('/dashboard')
    expect(ROUTE_ALIASES['/overview']).toBe('/dashboard')
    expect(ROUTE_ALIASES['/playground']).toBe('/orchestrator')
    expect(ROUTE_ALIASES['/reports']).toBe('/milestones')
  })

  it('alias targets are all present in ROUTES values', () => {
    const routeValues = new Set<string>(Object.values(ROUTES))
    for (const [alias, target] of Object.entries(ROUTE_ALIASES)) {
      expect(routeValues.has(target), `alias ${alias} → ${target} must point to a known ROUTE`).toBe(true)
    }
  })
})

describe('navConfig — NAV_LABELS', () => {
  it('section labels contain expected workflow stages', () => {
    const { sections } = NAV_LABELS
    expect(sections.home).toBeTruthy()
    expect(sections.build).toBeTruthy()
    expect(sections.run).toBeTruthy()
    expect(sections.observe).toBeTruthy()
    expect(sections.settings).toBeTruthy()
  })

  it('item labels match expected renames', () => {
    const { items } = NAV_LABELS
    expect(items.tooling).not.toBe('MCP Library')
    expect(items.playground).not.toBe('Orchestrator')
    expect(items.reports).not.toBe('Milestones')
    expect(items.home).not.toBe('Dashboard')
    expect(items.playground).toBe('Playground')
    expect(items.reports).toBe('Reports')
    expect(items.tooling).toBe('Tooling')
    expect(items.runs).toBe('Runs')
  })
})

describe('navConfig — PAGE_TITLES', () => {
  it('all page titles are non-empty strings', () => {
    for (const [key, value] of Object.entries(PAGE_TITLES)) {
      expect(typeof value, `PAGE_TITLES.${key} must be a string`).toBe('string')
      expect(value.length > 0, `PAGE_TITLES.${key} must not be empty`).toBe(true)
    }
  })

  it('page titles use new names', () => {
    expect(PAGE_TITLES.home).toBe('Home')
    expect(PAGE_TITLES.playground).toBe('Playground')
    expect(PAGE_TITLES.reports).toBe('Reports')
    expect(PAGE_TITLES.tooling).toBe('Tooling (MCP)')
    expect(PAGE_TITLES.runs).toBe('Runs')
  })
})
