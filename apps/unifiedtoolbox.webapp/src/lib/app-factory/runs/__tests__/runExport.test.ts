import path from 'path'
import { fileURLToPath } from 'url'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { zipDirectoryToBuffer } from '../../pipeline/zipRepo'

describe('run export', () => {
  it('zips run folder contents', async () => {
    const fixturesRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')
    const runDir = path.join(fixturesRoot, 'sample-run')
    const buffer = await zipDirectoryToBuffer(runDir)
    const zip = await JSZip.loadAsync(buffer)
    const files = Object.keys(zip.files)

    expect(files).toContain('run_state.json')
    expect(files).toContain('events.ndjson')
    expect(files).toContain('artifacts/pr.md')
  })
})
