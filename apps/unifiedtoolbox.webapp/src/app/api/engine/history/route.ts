import path from 'path';
import { NextResponse } from 'next/server';
import type { Session, EnvironmentalImpact } from '@/app/engine/_source/types';
import { readSessionsFile, writeSessionsFile } from '@/lib/app-factory/history/sessionsStore'

export const dynamic = 'force-dynamic';

const HISTORY_DIR = path.resolve(process.cwd(), '..', '..', 'data', 'orchestrator-history');
const HISTORY_FILE = path.join(HISTORY_DIR, 'sessions.json');
const MAX_HISTORY_ITEMS = 50;

async function readHistory(): Promise<Session[]> {
  const res = await readSessionsFile<Session>(HISTORY_FILE)
  if (res.error) console.warn('[api/engine/history] Failed to read history file:', res.error)
  return Array.isArray(res.sessions) ? res.sessions : []
}

async function writeHistory(history: Session[]): Promise<void> {
  await writeSessionsFile(HISTORY_FILE, history)
}

function normalizeSession(raw: unknown): Session | null {
  if (!raw || typeof raw !== 'object') return null;
  const session = raw as Record<string, unknown>;

  if (!session.id) return null;

  const date = session.date ? String(session.date) : new Date().toISOString();
  const tasks = Array.isArray(session.tasks) ? session.tasks : [];

  // Validate environmentalImpact structure
  let environmentalImpact: EnvironmentalImpact | null = null;
  if (session.environmentalImpact && typeof session.environmentalImpact === 'object') {
    const impact = session.environmentalImpact as Record<string, unknown>;
    if (typeof impact.co2e === 'number' && typeof impact.water === 'number') {
      environmentalImpact = { co2e: impact.co2e, water: impact.water };
    }
  }

  return {
    ...session,
    id: String(session.id),
    goal: session.goal ? String(session.goal) : '',
    fileContent: typeof session.fileContent === 'string' ? session.fileContent : null,
    date,
    tasks,
    environmentalImpact,
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
