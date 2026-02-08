import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'

import { ingestArtifacts } from '../ingestArtifacts'

describe('ingestArtifacts', () => {
  it('stores unsafe artifact names under orphaned/ and does not throw', async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'uaitoolbox-ingest-'))

    const result = await ingestArtifacts(repoDir, [
      { name: 'src/app/api/trends/*, src/app/api/backtests/*', type: 'CODE', content: 'test' },
      { name: 'src/app/page.tsx', type: 'CODE', content: 'export const x = 1\n' },
    ])

    expect(result.items).toHaveLength(2)
    const orphaned = result.items.find((i) => i.originalName.includes('trends/*'))
    const safe = result.items.find((i) => i.originalName === 'src/app/page.tsx')

    expect(orphaned?.status).toBe('written')
    expect(orphaned?.storedPath).toMatch(/^orphaned\//)
    expect(safe?.status).toBe('written')
    expect(safe?.storedPath).toBe('src/app/page.tsx')

    const report = await fs.readFile(path.join(repoDir, 'ARTIFACT_INGEST_REPORT.md'), 'utf8')
    expect(report).toContain('# Artifact Ingest Report')

    const orphanedPath = orphaned?.storedPath ? path.join(repoDir, orphaned.storedPath) : null
    expect(orphanedPath ? await fs.stat(orphanedPath).then(() => true, () => false) : false).toBe(true)

    const safePath = safe?.storedPath ? path.join(repoDir, safe.storedPath) : null
    expect(safePath ? await fs.stat(safePath).then(() => true, () => false) : false).toBe(true)
  })

  it('strips markdown code fencing from artifact content', async () => {
    const repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'uaitoolbox-ingest-'))

    const htmlWithFencing = '```html\n<!doctype html>\n<html>\n  <body>test</body>\n</html>\n```'
    const cssWithFencing = '```css\nbody { margin: 0; }\n.test { color: red; }\n```'

    const result = await ingestArtifacts(repoDir, [
      { name: 'index.html', type: 'CODE', content: htmlWithFencing },
      { name: 'styles.css', type: 'CODE', content: cssWithFencing },
    ])

    expect(result.items).toHaveLength(2)
    
    // Read the actual file contents to verify cleanup
    const htmlContent = await fs.readFile(path.join(repoDir, 'index.html'), 'utf8')
    const cssContent = await fs.readFile(path.join(repoDir, 'styles.css'), 'utf8')

    // Should not contain the markdown fencing markers
    expect(htmlContent).not.toContain('```html')
    expect(htmlContent).not.toContain('```')
    expect(htmlContent).toContain('<!doctype html>')
    expect(htmlContent).toContain('<body>test</body>')

    expect(cssContent).not.toContain('```css')
    expect(cssContent).not.toContain('```')
    expect(cssContent).toContain('body { margin: 0; }')
    expect(cssContent).toContain('.test { color: red; }')
  })
})

