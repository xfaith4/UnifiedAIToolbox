import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import RuntimeActivityDrawer from '../RuntimeActivityDrawer'

describe('RuntimeActivityDrawer', () => {
  it('renders runtime metadata with sample events', () => {
    const html = renderToStaticMarkup(
      <RuntimeActivityDrawer
        runId="maint-2026-02-28-abc123"
        status={{
          runId: 'maint-2026-02-28-abc123',
          status: 'running',
          currentStage: 'gates',
          stages: [],
          events: [],
          artifacts: [],
          updatedAt: '2026-02-28T18:00:10.000Z',
        }}
        events={[
          {
            ts: '2026-02-28T18:00:00.000Z',
            stage: 'gates',
            type: 'stage.start',
            message: 'Gate checks started',
          },
          {
            ts: '2026-02-28T18:00:05.000Z',
            stage: 'gates',
            type: 'step.progress',
            message: 'export.enumeration.progress',
            data: { files_scanned: 30, files_excluded: 4, bytes_written: 1024 },
          },
          {
            ts: '2026-02-28T18:00:06.000Z',
            stage: 'repair',
            type: 'error',
            level: 'error',
            message: 'lint failed',
          },
        ]}
        mode="file"
      />
    )

    expect(html).toContain('Runtime Log / Activity')
    expect(html).toContain('gates')
    expect(html).toContain('Show')
  })
})
