'use client';

import { useEffect, useMemo, useState } from 'react';
import KpiBoard from '../components/KpiBoard';
import MilestoneProgress from '../components/MilestoneProgress';
import HistogramPanel from '../components/HistogramPanel';
import TrendPanel from '../components/TrendPanel';
import ScatterPanel from '../components/ScatterPanel';
import OutlierTables, { buildOutlierGroups } from '../components/OutlierTables';
import RunTable from '../components/RunTable';
import { normalizeGoal } from '@/lib/milestones/goals';
import { computeOutliers } from '@/lib/milestones/outliers';
import { computeTimeWindow, normalizeRuns, summarizeRuns } from '@/lib/milestones/metrics';
import { evaluateMilestones } from '@/lib/milestones/evaluate';
import { GoalInfo, RunRecord, TimeWindowState } from '@/lib/milestones/types';

const baseURL = '/milestone-data/data/';
const timeWindowOptions = [
  { id: 'all', label: 'All runs' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'custom', label: 'Custom range' },
] as const;

const glossaryDefinitions = [
  { term: 'Run', definition: 'One orchestrated job with tokens, cost, duration, and outcome.' },
  { term: 'Score', definition: 'Commissioner-rated quality 0-10 (higher is better).' },
  { term: 'Outcome', definition: 'Accepted, Refine, Rejected, or Unknown.' },
  { term: 'Tokens', definition: 'Total tokens consumed during the run.' },
  { term: 'Cost', definition: 'USD spend for the run.' },
  { term: 'Acceptance rate', definition: 'Accepted ÷ total runs in the window.' },
];

function formatPercent(value: number | null, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(decimals)}%`;
}

function formatCurrency(value: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return '$0.00';
  const prefix = value < 0 ? '-$' : '$';
  return `${prefix}${Math.abs(value).toFixed(3)}`;
}

function getShortRunId(run: RunRecord | undefined) {
  if (!run) return 'run';
  if (run.runId && !run.runId.includes('\\') && !run.runId.includes('/')) return run.runId;
  const folder = run.runFolder ?? '';
  const normalized = folder.replace(/\\/g, '/').split('/').filter(Boolean);
  return normalized.at(-1) || run.runId || 'run';
}

export default function App() {
  const [goalData, setGoalData] = useState<GoalInfo | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeWindow, setTimeWindow] = useState<TimeWindowState>({ type: 'last30' });
  const [xAxisMode, setXAxisMode] = useState<'index' | 'time'>('index');

  useEffect(() => {
    let active = true;
    async function fetchData() {
      try {
        setError(null);
        const [goalResp, logResp] = await Promise.all([
          fetch(`${baseURL}CurrentGoal.json`),
          fetch(`${baseURL}Milestone_Log.json`),
        ]);
        if (goalResp.ok) {
          const goal = await goalResp.json();
          if (active) setGoalData(normalizeGoal(goal));
        }
        if (logResp.ok) {
          const log = await logResp.json();
          if (active) setRuns(normalizeRuns(log));
        } else {
          setError('Unable to load run log.');
        }
      } catch (err) {
        console.error(err);
        setError('Unable to load milestone data.');
      } finally {
        if (active) setLoading(false);
      }
    }
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const windowed = useMemo(() => computeTimeWindow(runs, timeWindow), [runs, timeWindow]);
  const metrics = useMemo(() => summarizeRuns(windowed.windowRuns), [windowed.windowRuns]);
  const previousMetrics = useMemo(
    () => (windowed.previousRuns.length ? summarizeRuns(windowed.previousRuns) : null),
    [windowed.previousRuns],
  );
  const milestones = useMemo(() => evaluateMilestones(metrics), [metrics]);
  const outliers = useMemo(() => computeOutliers(windowed.windowRuns), [windowed.windowRuns]);

  const deltas = useMemo(
    () => ({
      avgScore: previousMetrics ? metrics.avgScore - previousMetrics.avgScore : null,
      medianCost: previousMetrics ? metrics.medianCost - previousMetrics.medianCost : null,
      tokensP90: previousMetrics ? metrics.tokensP90 - previousMetrics.tokensP90 : null,
      acceptRate: previousMetrics ? metrics.acceptRate - previousMetrics.acceptRate : null,
    }),
    [metrics, previousMetrics],
  );

  const rangeLabel = `${windowed.label} · ${windowed.windowRuns.length}/${windowed.totalRuns} runs`;
  const comparisonLabel = previousMetrics ? 'Δ vs previous window' : 'No prior window to compare';
  const hasTimestamps = windowed.windowRuns.some((run) => typeof run.timestampValue === 'number');
  const latestRun = windowed.windowRuns.at(-1);

  useEffect(() => {
    if (!hasTimestamps && xAxisMode === 'time') {
      setXAxisMode('index');
    }
  }, [hasTimestamps, xAxisMode]);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-sky-300">Milestones</p>
            <h1 className="text-3xl font-bold text-white">AI-Orchestration Milestone Dashboard</h1>
            <p className="text-sm text-slate-300">
              Current health, what improved, and where to focus next. {rangeLabel}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {timeWindowOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() =>
                  setTimeWindow((prev) => {
                    if (option.id === 'custom') {
                      const prevCustom =
                        prev.type === 'custom'
                          ? { customStart: prev.customStart, customEnd: prev.customEnd }
                          : { customStart: '', customEnd: '' };
                      return { type: 'custom', ...prevCustom };
                    }
                    return { type: option.id as Exclude<TimeWindowState['type'], 'custom'> };
                  })
                }
                className={`rounded-full border px-3 py-1 text-sm ${
                  timeWindow.type === option.id ? 'border-sky-400 text-sky-100' : 'border-slate-800 text-slate-300'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {timeWindow.type === 'custom' ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-200">
            <label className="flex items-center gap-2">
              Start
              <input
                type="date"
                value={(timeWindow as any).customStart ?? ''}
                onChange={(e) => setTimeWindow((prev) => ({ ...(prev as any), type: 'custom', customStart: e.target.value }))}
                className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-slate-100"
              />
            </label>
            <label className="flex items-center gap-2">
              End
              <input
                type="date"
                value={(timeWindow as any).customEnd ?? ''}
                onChange={(e) => setTimeWindow((prev) => ({ ...(prev as any), type: 'custom', customEnd: e.target.value }))}
                className="rounded border border-slate-800 bg-slate-950 px-2 py-1 text-slate-100"
              />
            </label>
            {!windowed.customValid && <span className="text-rose-300">Invalid date range — showing all runs.</span>}
          </div>
        ) : null}
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-100">{error}</div>
      ) : null}

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Health at a glance</h2>
          <p className="text-xs text-slate-400">{comparisonLabel}</p>
        </div>
        <KpiBoard metrics={metrics} deltas={deltas} />
        <MilestoneProgress milestones={milestones} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <HistogramPanel
          title="Token distribution"
          distribution={metrics.histogram.tokens}
          median={metrics.tokensMedian}
          p90={metrics.tokensP90}
          xLabel="Tokens"
          formatTick={(v) => Number(v).toLocaleString()}
        />
        <HistogramPanel
          title="Cost distribution"
          distribution={metrics.histogram.cost}
          median={metrics.medianCost}
          p90={metrics.costP90}
          xLabel="Cost ($)"
          formatTick={(v) => `$${Number(v).toFixed(2)}`}
          color="#fbbf24"
        />
        <HistogramPanel
          title="Score distribution"
          distribution={metrics.histogram.score}
          median={metrics.scoreMedian}
          p90={metrics.scoreP90}
          xLabel="Score (0-10)"
          color="#22c55e"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <TrendPanel runs={windowed.windowRuns} xAxisMode={xAxisMode} />
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-50">Trend axis</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setXAxisMode('index')}
                className={`rounded-full border px-3 py-1 text-sm ${
                  xAxisMode === 'index' ? 'border-sky-400 text-sky-100' : 'border-slate-800 text-slate-300'
                }`}
              >
                Run index
              </button>
              <button
                type="button"
                onClick={() => setXAxisMode('time')}
                disabled={!hasTimestamps}
                className={`rounded-full border px-3 py-1 text-sm ${
                  xAxisMode === 'time' ? 'border-sky-400 text-sky-100' : 'border-slate-800 text-slate-300'
                } ${!hasTimestamps ? 'opacity-50' : ''}`}
              >
                Timestamp
              </button>
            </div>
          </div>
          <p className="mt-2 text-sm text-slate-300">
            Score and cost over the selected window. Switch axes to see recency or sequencing.
          </p>
          <ScatterPanel runs={windowed.windowRuns} />
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Outliers & tail health</h2>
          <p className="text-xs text-slate-400">Surfacing heavy / risky runs for follow-up.</p>
        </div>
        <OutlierTables groups={buildOutlierGroups(outliers)} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Run log</h2>
        <RunTable runs={windowed.windowRuns} />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <h3 className="text-lg font-semibold text-white">What is a run?</h3>
          <p className="text-sm text-slate-300">
            Each run logs score, cost, tokens, duration, retries, and outcome. The window selector scopes which runs feed the
            charts and milestone evaluation. Missing values are treated as 0 and made explicit in the visuals.
          </p>
          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <p className="text-sm font-semibold text-slate-200">Current goal</p>
            <p className="text-sm text-slate-300">{goalData?.goal ?? 'Goal not captured yet'}</p>
            {goalData?.successCriteria?.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-300">
                {goalData.successCriteria.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            {goalData && goalData.score !== null ? (
              <p className="mt-2 text-xs text-slate-400">
                Goal score: {goalData.score} · Trend: {goalData.trend} ({goalData.momentum})
              </p>
            ) : null}
          </div>
          <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <p className="text-sm font-semibold text-slate-200">Glossary</p>
            <ul className="mt-2 space-y-1 text-xs text-slate-300">
              {glossaryDefinitions.map((item) => (
                <li key={item.term}>
                  <span className="font-semibold text-slate-100">{item.term}:</span> {item.definition}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <h3 className="text-lg font-semibold text-white">What changed?</h3>
          <p className="text-sm text-slate-300">
            Deltas compare the selected window to an equally sized previous window. If there is no prior window we skip the delta to keep the story honest.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-200">
            <li>
              Quality delta: <span className="text-slate-100">{deltas.avgScore !== null ? deltas.avgScore.toFixed(2) : 'n/a'}</span>
            </li>
            <li>
              Cost delta: <span className="text-slate-100">{deltas.medianCost !== null ? formatCurrency(deltas.medianCost) : 'n/a'}</span>
            </li>
            <li>
              Token delta: <span className="text-slate-100">{deltas.tokensP90 !== null ? deltas.tokensP90.toLocaleString() : 'n/a'}</span>
            </li>
            <li>
              Acceptance delta: <span className="text-slate-100">{deltas.acceptRate !== null ? formatPercent(deltas.acceptRate) : 'n/a'}</span>
            </li>
          </ul>
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-300">
            <p className="font-semibold text-slate-100">Why milestones matter</p>
            <p>
              Milestones are the gates for declaring the system reliable, cost-efficient, and ready for promotion. Each threshold is declared
              here; change them in one place in <code className="text-sky-300">lib/milestones/definitions.ts</code>.
            </p>
            {latestRun ? (
              <p className="mt-2 text-slate-200">
                Latest run {getShortRunId(latestRun)} scored {latestRun.score ?? 'n/a'} costing {formatCurrency(latestRun.cost)} with outcome{' '}
                {latestRun.outcome}.
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {loading ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-slate-300">Loading Milestone Dashboard…</div>
      ) : null}
    </div>
  );
}
