import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { zipDirectoryToBuffer } from '../../pipeline/zipRepo'

describe('run export', () => {
  it('zips artifacts directory contents', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uaitoolbox-zip-'))
    const artifactsDir = path.join(root, 'artifacts')
    await fs.mkdir(artifactsDir, { recursive: true })
    await fs.writeFile(path.join(artifactsDir, 'REPORT.md'), '# Report\n', 'utf8')

    const buffer = await zipDirectoryToBuffer(artifactsDir)
    const zip = await JSZip.loadAsync(buffer)
    const files = Object.keys(zip.files)

    expect(files).toContain('REPORT.md')
  })
})
