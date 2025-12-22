import { promises as fs } from 'fs'
import path from 'path'
import yaml from 'js-yaml'
import { NextResponse } from 'next/server'

const AGENTS_DIR = path.resolve(process.cwd(), '..', '..', 'data', 'agents')

async function readAgentFiles(): Promise<Record<string, unknown>[]> {
  const entries = await fs.readdir(AGENTS_DIR, { withFileTypes: true })
  const docs: Record<string, unknown>[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.yaml')) continue
    const raw = await fs.readFile(path.join(AGENTS_DIR, entry.name), 'utf-8')
    try {
      const parsed = yaml.load(raw)
      if (typeof parsed === 'object' && parsed !== null) {
        docs.push(parsed as Record<string, unknown>)
      }
    } catch (error) {
      console.warn(`Failed to parse ${entry.name}:`, error)
    }
  }
  return docs
}

export async function GET() {
  try {
    await fs.access(AGENTS_DIR)
    console.log('[api/agents] AGENTS_DIR', AGENTS_DIR)
    const agents = await readAgentFiles()
    return NextResponse.json(agents, { status: 200 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn('[api/agents] agents directory missing; returning empty library')
      return NextResponse.json([], { status: 200 })
    }
    return NextResponse.json({ error: 'Failed to load agent definitions' }, { status: 500 })
  }
}
