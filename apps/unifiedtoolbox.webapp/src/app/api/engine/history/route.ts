import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import type { Session } from '@/app/engine/_source/types';

export const dynamic = 'force-dynamic';

const HISTORY_DIR = path.resolve(process.cwd(), '..', '..', 'data', 'orchestrator-history');
const HISTORY_FILE = path.join(HISTORY_DIR, 'sessions.json');
const MAX_HISTORY_ITEMS = 50;

async function ensureHistoryDir(): Promise<void> {
  await fs.mkdir(HISTORY_DIR, { recursive: true });
}

async function readHistory(): Promise<Session[]> {
  await ensureHistoryDir();
  try {
    const raw = await fs.readFile(HISTORY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Session[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[api/engine/history] Failed to read history file:', error);
    }
    return [];
  }
}

async function writeHistory(history: Session[]): Promise<void> {
  await ensureHistoryDir();
  await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
}

function normalizeSession(raw: unknown): Session | null {
  if (!raw || typeof raw !== 'object') return null;
  const session = raw as Record<string, unknown>;

  if (!session.id) return null;

  const date = session.date ? String(session.date) : new Date().toISOString();
  const tasks = Array.isArray(session.tasks) ? session.tasks : [];

  return {
    ...session,
    id: String(session.id),
    goal: session.goal ? String(session.goal) : '',
    fileContent: (session as Session).fileContent ?? null,
    date,
    tasks,
    environmentalImpact: (session as Session).environmentalImpact ?? null,
    planningCost: typeof session.planningCost === 'number' ? session.planningCost : undefined,
    totalCost: typeof session.totalCost === 'number' ? session.totalCost : undefined,
  };
}

export async function GET() {
  const history = await readHistory();
  return NextResponse.json(history, { status: 200 });
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const session = normalizeSession(payload);

    if (!session) {
      return NextResponse.json({ error: 'Invalid session payload' }, { status: 400 });
    }

    const history = await readHistory();
    const deduped = history.filter((entry) => entry.id !== session.id);
    const updated = [session, ...deduped].slice(0, MAX_HISTORY_ITEMS);

    await writeHistory(updated);
    return NextResponse.json(updated, { status: 201 });
  } catch (error) {
    console.error('[api/engine/history] Failed to persist session:', error);
    return NextResponse.json({ error: 'Failed to save session history' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await writeHistory([]);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('[api/engine/history] Failed to clear history:', error);
    return NextResponse.json({ error: 'Failed to clear history' }, { status: 500 });
  }
}
