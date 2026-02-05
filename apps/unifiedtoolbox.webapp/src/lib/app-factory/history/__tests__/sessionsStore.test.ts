import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'

import { readSessionsFile } from '../sessionsStore'

type SessionLike = { id: string; goal?: string; tasks?: unknown[] }

describe('sessionsStore', () => {
  it('recovers from NUL bytes and concatenated JSON arrays', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'uaitoolbox-sessions-'))
    const filePath = path.join(tmpDir, 'sessions.json')

    const corrupted = `\u0000[{"id":"old","goal":"a","tasks":[]}]\n{"junk":true}\n[{"id":"new","goal":"b","tasks":[]}]\u0000`
    await fs.writeFile(filePath, corrupted, 'utf8')

    const result = await readSessionsFile<SessionLike>(filePath)
    expect(result.recovered).toBe(true)
    expect(result.sessions).toHaveLength(1)
    expect(result.sessions[0]?.id).toBe('new')
  })
})

