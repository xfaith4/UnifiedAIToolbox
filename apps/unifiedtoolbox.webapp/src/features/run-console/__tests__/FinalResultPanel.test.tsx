import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import FinalResultPanel from '../FinalResultPanel'
import type { FinalRunSummary } from '@/lib/app-factory/runs/finalSummary'

const SUMMARY: FinalRunSummary = {
  schema_version: 1,
  run_id: 'maint-test-1',
  objective: 'Migrate to typescript v5',
  outcome: 'completed_with_warnings',
  completed_work: ['Upgraded compiler', 'Updated tsconfig'],
  changed_files: ['package.json', 'tsconfig.json'],
  created_artifacts: ['REPORT.json'],
  validation_results: [
    { name: 'typecheck', status: 'passed', detail: 'tsc exit 0' },
    { name: 'unit tests', status: 'partial', detail: '3 deferred' },
  ],
  blockers: [
    { severity: 'non_blocking_gap', summary: 'Docs not updated', agent: 'Engineer' },
  ],
  warnings: ['Deprecated flag detected'],
  next_steps: ['Update docs', 'Run E2E suite'],
  generated_at: new Date().toISOString(),
}

describe('FinalResultPanel', () => {
  it('renders the objective', () => {
    const html = renderToStaticMarkup(<FinalResultPanel summary={SUMMARY} />)
    expect(html).toContain('Migrate to typescript v5')
  })

  it('renders the outcome label', () => {
    const html = renderToStaticMarkup(<FinalResultPanel summary={SUMMARY} />)
    expect(html).toContain('Completed with warnings')
    expect(html).toContain('data-outcome="completed_with_warnings"')
  })

  it('renders completed work items', () => {
    const html = renderToStaticMarkup(<FinalResultPanel summary={SUMMARY} />)
    expect(html).toContain('Upgraded compiler')
    expect(html).toContain('Updated tsconfig')
  })

  it('renders changed files', () => {
    const html = renderToStaticMarkup(<FinalResultPanel summary={SUMMARY} />)
    expect(html).toContain('package.json')
    expect(html).toContain('tsconfig.json')
  })

  it('renders created artifacts', () => {
    const html = renderToStaticMarkup(<FinalResultPanel summary={SUMMARY} />)
    expect(html).toContain('REPORT.json')
  })

  it('renders validation results', () => {
    const html = renderToStaticMarkup(<FinalResultPanel summary={SUMMARY} />)
    expect(html).toContain('typecheck')
    expect(html).toContain('unit tests')
  })

  it('renders warnings', () => {
    const html = renderToStaticMarkup(<FinalResultPanel summary={SUMMARY} />)
    expect(html).toContain('Deprecated flag detected')
  })

  it('renders next recommended steps', () => {
    const html = renderToStaticMarkup(<FinalResultPanel summary={SUMMARY} />)
    expect(html).toContain('Update docs')
    expect(html).toContain('Run E2E suite')
  })

  it('renders blockers under "Known Gaps" heading', () => {
    const html = renderToStaticMarkup(<FinalResultPanel summary={SUMMARY} />)
    expect(html).toContain('Known Gaps')
    expect(html).toContain('Docs not updated')
  })

  it('distinguishes completed_with_warnings from clean completed', () => {
    const clean = renderToStaticMarkup(
      <FinalResultPanel summary={{ ...SUMMARY, outcome: 'completed', warnings: [], blockers: [] }} />
    )
    const warned = renderToStaticMarkup(<FinalResultPanel summary={SUMMARY} />)
    expect(clean).toContain('data-outcome="completed"')
    expect(clean).toContain('Completed')
    expect(warned).toContain('data-outcome="completed_with_warnings"')
  })
})
