'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  COST_PER_DOLLAR_ENERGY_KWH,
  COST_PER_DOLLAR_WATER_LITERS,
} from '@/config/telemetry';

const baseURL = '/milestone-data/data/';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const timeWindowOptions = [
  { id: 'all', label: 'All runs' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'custom', label: 'Custom range' },
];

const glossaryDefinitions = [
  { term: 'Score', definition: 'Commissioner-rated quality 0-10 (higher is better).' },
  { term: 'Outcome', definition: 'Final disposition: Accepted, Refine, Rejected, or Unknown.' },
  { term: 'Tokens', definition: 'Total tokens consumed during the orchestration run.' },
  { term: 'Cost', definition: 'Raw dollars spent on the run (USD).' },
  { term: 'Duration', definition: 'Wall-clock time captured for the run (seconds).' },
  { term: 'Retries', definition: 'How many times the orchestrator re-ran before completion.' },
  { term: 'Error rate', definition: 'Total errors emitted per run averaged across the window.' },
  { term: 'Percentiles', definition: 'Sorted metrics showing where runs fall relative to each other (e.g., p90 means 90% of runs are at or below that value).' },
];

const scoringMethodology =
  'Score is a Commissioner-defined 0-10 rating that blends reliability, completion, and cost trade-offs. Lower scores reflect uncertainty, while higher scores signal consistent, goal-aligned outcomes.';

function safeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTimestamp(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  const text = String(value).replace(/[\r\n]+/g, ' ').trim();
  if (!text) return null;
  const candidates = [
    text,
    text.replace(' ', 'T'),
    text.replace(/\s+(AM|PM)/i, (match) => match.toUpperCase()),
    `${text}Z`,
  ];
  for (const candidate of candidates) {
    const parsed = Date.parse(candidate);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}

function normalizeOutcome(raw) {
  if (!raw) return 'unknown';
  const normalized = String(raw).toLowerCase();
  if (normalized.includes('accept')) return 'accepted';
  if (normalized.includes('refine')) return 'refine';
  if (normalized.includes('reject')) return 'rejected';
  if (normalized.includes('unknown')) return 'unknown';
  return normalized;
}

function formatDuration(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return 'Not captured';
  const sign = ms < 0 ? '-' : '';
  const absolute = Math.abs(ms);
  const seconds = Math.round(absolute / 1000);
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes && remaining) return `${sign}${minutes}m ${remaining}s`;
  if (minutes) return `${sign}${minutes}m`;
  return `${sign}${remaining}s`;
}

function formatCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '$0.00';
  const prefix = value < 0 ? '-$' : '$';
  return `${prefix}${Math.abs(value).toFixed(2)}`;
}

function formatPercent(value, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return '0%';
  return `${(value * 100).toFixed(decimals)}%`;
}

function getShortRunId(run) {
  if (!run) return 'run';
  if (run.runId && !run.runId.includes('\\') && !run.runId.includes('/')) return run.runId;
  const folder = run.runFolder ?? '';
  const normalized = folder.replace(/\\/g, '/').split('/').filter(Boolean);
  return normalized.at(-1) || run.runId || 'run';
}

function getRunTimestampLabel(run) {
  if (!run) return 'Timestamp missing';
  if (run.timestampValue) {
    return new Date(run.timestampValue).toLocaleString();
  }
  if (run.timestamp) {
    return run.timestamp;
  }
  return 'Timestamp missing';
}

// Pure helper for percentile calculation.
function calculatePercentile(values = [], percentile = 50) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const weight = idx % 1;
  if (upper >= sorted.length) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
}

function formatDeltaValue(delta, formatter = (value) => value.toFixed(2)) {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return '—';
  const prefix = delta > 0 ? '+' : '';
  return `${prefix}${formatter(delta)}`;
}

function buildHistogramSegments(items = [], bucketCount = 6, { min, max } = {}) {
  const values = items.map((item) => safeNumber(item.value)).filter((value) => value !== null && value !== undefined);
  if (!values.length) {
    const emptyBuckets = Array.from({ length: bucketCount }, (_, index) => ({
      start: 0,
      end: 0,
      count: 0,
      percentage: 0,
      examples: [],
      label: `bin-${index + 1}`,
    }));
    return {
      buckets: emptyBuckets,
      min: min ?? 0,
      max: max ?? 0,
      total: 0,
    };
  }

  const sanitizedMin = min ?? Math.min(...values);
  const sanitizedMax = max ?? Math.max(...values);
  const range = sanitizedMax - sanitizedMin || 1;
  const size = Math.max(1, bucketCount);

  const rawBuckets = Array.from({ length: size }, (_, index) => ({
    start: sanitizedMin + (range * index) / size,
    end: sanitizedMin + (range * (index + 1)) / size,
    count: 0,
    examples: [],
  }));

  items.forEach((item) => {
    const value = safeNumber(item.value);
    if (value === null || value === undefined) return;
    const normalized = Math.min(size - 1, Math.floor(((value - sanitizedMin) / range) * size));
    const target = rawBuckets[Math.max(0, normalized)];
    target.count += 1;
    if (target.examples.length < 3 && item.runId) {
      target.examples.push(item.runId);
    }
  });

  const total = values.length;
  const buckets = rawBuckets.map((bucket) => ({
    ...bucket,
    percentage: total ? bucket.count / total : 0,
    label: `${bucket.start.toFixed(2)} - ${bucket.end.toFixed(2)}`,
  }));

  return { buckets, min: sanitizedMin, max: sanitizedMax, total };
}

function normalizeGoal(raw = {}) {
  const source = raw ?? {};
  const goalText = source.goal ?? source.Goal ?? 'Goal not captured yet';
  const scoreValue = safeNumber(source.score ?? source.Score);
  return {
    goal: goalText,
    objective: source.objective ?? source.Objective ?? '',
    successCriteria: Array.isArray(source.successCriteria)
      ? source.successCriteria
      : typeof source.successCriteria === 'string'
      ? source.successCriteria.split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean)
      : [],
    score: scoreValue,
    trend: source.trend ?? source.Trend ?? '↔',
    momentum: source.momentum ?? source.Momentum ?? 'Stable',
    timestamp: source.timestamp ?? source.Timestamp ?? null,
  };
}

function normalizeLogEntries(entries = []) {
  return entries.map((entry, index) => {
    const scoreValue = safeNumber(entry.Score ?? entry.score);
    const tokensValue = safeNumber(entry.Tokens ?? entry.tokens);
    const costValue = safeNumber(entry.Cost ?? entry.cost);
    const durationMsRaw = safeNumber(entry.DurationMs ?? entry.durationMs);
    const durationSeconds = safeNumber(entry.Duration ?? entry.duration);
    const durationMs = durationMsRaw ?? (durationSeconds !== null ? durationSeconds * 1000 : null);
    const timestampValue = parseTimestamp(entry.Timestamp ?? entry.timestamp ?? entry.TimestampStart ?? entry.timestampStart);
    const evaluation = typeof entry.Evaluation === 'object' ? entry.Evaluation : entry.evaluation ?? {};

    return {
      runId: entry.runId ?? entry.RunId ?? entry.runFolder ?? entry.RunFolder ?? `run-${index + 1}`,
      runFolder: entry.runFolder ?? entry.RunFolder ?? '',
      message: entry.Message ?? entry.message ?? entry.Synthesis ?? '',
      goal: entry.Goal ?? entry.goal ?? '',
      score: scoreValue,
      tokens: tokensValue,
      cost: costValue,
      durationMs,
      outcome: normalizeOutcome(entry.Outcome ?? entry.outcome),
      timestamp: entry.Timestamp ?? entry.timestamp ?? '',
      timestampValue,
      retries: safeNumber(entry.RetryCount ?? entry.retries) ?? 0,
      errorCount: safeNumber(entry.Errors ?? entry.errorCount) ?? 0,
      agentsUsed: Array.isArray(entry.agentsUsed ?? entry.AgentsUsed) ? entry.agentsUsed ?? entry.AgentsUsed : [],
      steps: Array.isArray(entry.steps ?? entry.Steps) ? entry.steps ?? entry.Steps : [],
      evaluation: {
        ...evaluation,
        rubric: Array.isArray(evaluation.rubric)
          ? evaluation.rubric
          : evaluation.rubric
          ? [evaluation.rubric]
          : [],
      },
    };
  });
}

function computeTimeWindow(runs, windowState) {
  if (!runs.length) {
    return { windowRuns: [], previousRuns: [], label: 'No runs yet', customValid: true };
  }

  const enriched = runs.map((run, index) => ({
    ...run,
    _index: index,
    _timestamp: run.timestampValue ?? index * ONE_DAY_MS,
  }));

  const timestamps = enriched.map((run) => run._timestamp);
  const maxTimestamp = Math.max(...timestamps);
  const minTimestamp = Math.min(...timestamps);

  let start = minTimestamp;
  let end = maxTimestamp;
  let label = 'All runs';
  let customValid = true;

  if (windowState.type === 'last7') {
    end = maxTimestamp;
    start = end - 7 * ONE_DAY_MS;
    label = 'Last 7 days';
  } else if (windowState.type === 'last30') {
    end = maxTimestamp;
    start = end - 30 * ONE_DAY_MS;
    label = 'Last 30 days';
  } else if (windowState.type === 'custom') {
    const parsedStart = safeNumber(Date.parse(windowState.customStart));
    const parsedEnd = safeNumber(Date.parse(windowState.customEnd));
    if (parsedStart && parsedEnd && parsedEnd > parsedStart) {
      start = parsedStart;
      end = parsedEnd + ONE_DAY_MS - 1;
      label = `Custom ${new Date(parsedStart).toLocaleDateString()} → ${new Date(parsedEnd).toLocaleDateString()}`;
    } else {
      customValid = false;
      label = 'Custom (invalid dates, showing all runs)';
    }
  }

  if (start >= end) {
    start = minTimestamp;
    end = maxTimestamp;
    label = 'All runs';
  }

  const windowLength = Math.max(0, end - start);
  const windowRuns = enriched
    .filter((run) => run._timestamp >= start && run._timestamp <= end)
    .sort((a, b) => a._timestamp - b._timestamp);

  const previousRuns = windowState.type === 'all' || windowLength <= 0
    ? []
    : enriched
        .filter((run) => run._timestamp >= start - windowLength && run._timestamp < start)
        .sort((a, b) => a._timestamp - b._timestamp);

  return {
    windowRuns,
    previousRuns,
    label,
    customValid,
    totalRuns: runs.length,
  };
}

function summarizeRuns(runs) {
  const total = runs.length;
  if (!total) {
    return {
      avgScore: 0,
      medianCost: 0,
      tokensP90: 0,
      scorePercentiles: { median: 0, p75: 0, p90: 0 },
      tokensPercentiles: { median: 0, p75: 0, p90: 0 },
      costPercentiles: { median: 0, p75: 0, p90: 0 },
      durationP95: 0,
      errorRate: 0,
      acceptRate: 0,
      outcomeCounts: { accepted: 0, refine: 0, rejected: 0, unknown: 0 },
      dataQuality: { durationCaptured: 0, agentsCaptured: 0, stepsCaptured: 0 },
      histogram: {
        tokens: buildHistogramSegments([], 6),
        cost: buildHistogramSegments([], 6),
        score: buildHistogramSegments([], 6),
      },
      totalRuns: 0,
    };
  }

  const scoreValues = runs.map((run) => run.score).filter((value) => typeof value === 'number');
  const tokensValues = runs.map((run) => run.tokens).filter((value) => typeof value === 'number');
  const costValues = runs.map((run) => run.cost).filter((value) => typeof value === 'number');
  const durationValues = runs
    .map((run) => run.durationMs)
    .filter((value) => typeof value === 'number' && value > 0);
  const totalErrors = runs.reduce((acc, run) => acc + (safeNumber(run.errorCount) ?? 0), 0);

  const outcomeBuckets = runs.reduce(
    (acc, run) => {
      const outcome = run.outcome;
      if (outcome === 'accepted') acc.accepted += 1;
      else if (outcome === 'refine') acc.refine += 1;
      else if (outcome === 'rejected') acc.rejected += 1;
      return acc;
    },
    { accepted: 0, refine: 0, rejected: 0 },
  );
  const knownTotals = outcomeBuckets.accepted + outcomeBuckets.refine + outcomeBuckets.rejected;
  const unknownCount = Math.max(0, total - knownTotals);

  const scoreMin = scoreValues.length ? Math.min(...scoreValues) : 0;
  const scoreMax = scoreValues.length ? Math.max(...scoreValues) : 10;
  const scoreBucketRange = Math.max(1, scoreMax - scoreMin);
  const scoreBucketCount = scoreValues.length
    ? Math.min(12, Math.max(6, Math.ceil(scoreBucketRange * 2)))
    : 6;

  const tokensBucketCount = tokensValues.length
    ? Math.min(10, Math.max(6, Math.ceil(Math.sqrt(tokensValues.length) + 2)))
    : 6;

  const costMin = costValues.length ? Math.min(...costValues) : 0;
  const costMax = costValues.length ? Math.max(...costValues) : 1;
  const costBucketRange = Math.max(1, costMax - costMin);
  const costBucketCount = costValues.length
    ? Math.min(10, Math.max(6, Math.ceil(costBucketRange * 2)))
    : 6;

  return {
    avgScore: scoreValues.length ? scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length : 0,
    medianCost: calculatePercentile(costValues, 50),
    tokensP90: calculatePercentile(tokensValues, 90),
    scorePercentiles: {
      median: calculatePercentile(scoreValues, 50),
      p75: calculatePercentile(scoreValues, 75),
      p90: calculatePercentile(scoreValues, 90),
    },
    tokensPercentiles: {
      median: calculatePercentile(tokensValues, 50),
      p75: calculatePercentile(tokensValues, 75),
      p90: calculatePercentile(tokensValues, 90),
    },
    costPercentiles: {
      median: calculatePercentile(costValues, 50),
      p75: calculatePercentile(costValues, 75),
      p90: calculatePercentile(costValues, 90),
    },
    durationP95: calculatePercentile(durationValues, 95),
    errorRate: total ? totalErrors / total : 0,
    acceptRate: total ? outcomeBuckets.accepted / total : 0,
    outcomeCounts: {
      accepted: outcomeBuckets.accepted,
      refine: outcomeBuckets.refine,
      rejected: outcomeBuckets.rejected,
      unknown: unknownCount,
    },
    dataQuality: {
      durationCaptured: runs.filter((run) => typeof run.durationMs === 'number').length,
      agentsCaptured: runs.filter((run) => Array.isArray(run.agentsUsed) && run.agentsUsed.length).length,
      stepsCaptured: runs.filter((run) => Array.isArray(run.steps) && run.steps.length).length,
    },
    histogram: {
      tokens: buildHistogramSegments(tokensValues, tokensBucketCount),
      cost: buildHistogramSegments(costValues, costBucketCount),
      score: buildHistogramSegments(scoreValues, scoreBucketCount, { min: scoreMin, max: scoreMax || scoreMin + 1 }),
    },
    totalRuns: total,
  };
}

function calculateDelta(currentValue, previousValue) {
  if (previousValue === null || previousValue === undefined) return null;
  const delta = currentValue - previousValue;
  if (Number.isNaN(delta)) return null;
  return delta;
}

function detectOutliersByZScore(runs, field, threshold = 1.5, limit = 3) {
  const values = runs
    .map((run) => safeNumber(run[field]))
    .filter((value) => value !== null && value !== undefined);
  if (!values.length) return [];
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const stddev = Math.sqrt(variance);
  if (!stddev) return [];

  const scored = runs
    .map((run) => {
      const value = safeNumber(run[field]);
      if (value === null || value === undefined) return null;
      const z = (value - mean) / stddev;
      return { run, z, value };
    })
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z));

  return scored.filter((entry) => Math.abs(entry.z) >= threshold).slice(0, limit);
}

function buildInsights(runs, stats, previousStats) {
  const insights = [];
  const sortedByTimestamp = [...runs].sort((a, b) => (a.timestampValue ?? 0) - (b.timestampValue ?? 0));
  const latest = sortedByTimestamp.at(-1);
  const baseline = sortedByTimestamp[0];

  if (latest && baseline && safeNumber(latest.score) !== null && safeNumber(baseline.score) !== null) {
    const improvement = latest.score - baseline.score;
    insights.push({
      id: 'improvement',
      title: 'Most improved recent run',
      detail: `Run ${latest.runId} is ${improvement.toFixed(1)} points higher than run ${baseline.runId}.`,
      link: `#run-${latest.runId}`,
      runId: latest.runId,
    });
  }

  const costExclusions = runs.filter((run) => {
    const costValue = safeNumber(run.cost);
    return costValue === null || costValue === undefined || costValue <= 0.005;
  }).length;
  const efficiencyCandidates = runs
    .map((run) => {
      const scoreValue = safeNumber(run.score);
      const costValue = safeNumber(run.cost);
      if (scoreValue === null || costValue === null || costValue <= 0.005) return null;
      return { run, ratio: scoreValue / Math.max(costValue, 0.01) };
    })
    .filter((entry) => entry !== null)
    .sort((a, b) => (b?.ratio ?? 0) - (a?.ratio ?? 0));
  const bestEfficiency = efficiencyCandidates[0];

  if (bestEfficiency) {
    insights.push({
      id: 'efficiency',
      title: 'Best efficiency (normalized)',
      detail: `Run ${bestEfficiency.run.runId} delivers ${(bestEfficiency.ratio ?? 0).toFixed(1)} normalized score/$ (cost floored to $0.01).`,
      link: `#run-${bestEfficiency.run.runId}`,
      runId: bestEfficiency.run.runId,
    });
  } else if (costExclusions) {
    insights.push({
      id: 'efficiency-limited',
      title: 'Efficiency insights limited',
      detail: `Cost too small to compute score/$ reliably for ${costExclusions} run(s).`,
      link: '#top',
    });
  }

  const medianScore = stats?.scorePercentiles?.median ?? 0;
  const lowScoreHighCost = runs
    .filter(
      (run) =>
        safeNumber(run.score) !== null &&
        safeNumber(run.cost) !== null &&
        (run.score ?? 0) <= medianScore,
    )
    .sort((a, b) => (safeNumber(b.cost) ?? 0) - (safeNumber(a.cost) ?? 0));

  if (lowScoreHighCost.length) {
    const top = lowScoreHighCost.slice(0, 2);
    const runIds = top.map((run) => run.runId).join(', ');
    insights.push({
      id: 'cost-low-score',
      title: 'High-cost low-score outliers',
      detail: `Runs ${runIds} spend more while scoring below average.`,
      link: `#run-${top[0].runId}`,
      runId: top[0].runId,
    });
  }

  if (runs.length >= 3) {
    const outliers = detectOutliersByZScore(runs, 'tokens');
    if (outliers.length) {
      insights.push({
        id: 'tokens-outliers',
        title: 'Token outliers',
        detail: `Runs ${outliers.map((o) => o.run.runId).join(', ')} sit >1.5σ away from the median token usage.`,
        link: `#run-${outliers[0].run.runId}`,
        runId: outliers[0].run.runId,
      });
    }
  }

  if (previousStats) {
    const deltaAccept = calculateDelta(stats.acceptRate, previousStats.acceptRate);
    if (deltaAccept !== null) {
      const magnitude = Math.abs(deltaAccept * 100);
      const direction = deltaAccept > 0 ? 'up' : deltaAccept < 0 ? 'down' : null;
      const detail =
        direction && magnitude >= 0.1
          ? `Accept rate is ${direction} ${magnitude.toFixed(1)} pts vs previous window.`
          : 'Accept rate flat vs previous window.';
      insights.push({
        id: 'accept-rate',
        title: 'Accept rate trend',
        detail,
        link: '#top',
      });
    }
  }

  return insights.slice(0, 5);
}

export default function App() {
  const [goalData, setGoalData] = useState(null);
  const [logData, setLogData] = useState([]);
  const [timeWindow, setTimeWindow] = useState({ type: 'all', customStart: '', customEnd: '' });
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [scoringInfoOpen, setScoringInfoOpen] = useState(false);
  const [trendXAxis, setTrendXAxis] = useState('index');
  const [copyStatusByRun, setCopyStatusByRun] = useState({});

  useEffect(() => {
    let active = true;
    async function fetchData() {
      try {
        const [goalResp, logResp] = await Promise.all([
          fetch(`${baseURL}CurrentGoal.json`),
          fetch(`${baseURL}Milestone_Log.json`),
        ]);
        if (goalResp.ok) {
          const goal = await goalResp.json();
          if (active) setGoalData(goal);
        }
        if (logResp.ok) {
          const log = await logResp.json();
          if (active) setLogData(log);
        }
      } catch (error) {
        console.error('Unable to load milestone data', error);
      }
    }
    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const normalizedGoal = useMemo(() => normalizeGoal(goalData), [goalData]);
  const normalizedLogs = useMemo(() => normalizeLogEntries(logData), [logData]);
  const { windowRuns, previousRuns, label: windowLabel, customValid, totalRuns } = useMemo(
    () => computeTimeWindow(normalizedLogs, timeWindow),
    [normalizedLogs, timeWindow],
  );

  const stats = useMemo(() => summarizeRuns(windowRuns), [windowRuns]);
  const previousStats = useMemo(() => (previousRuns.length ? summarizeRuns(previousRuns) : null), [previousRuns]);
  const insights = useMemo(() => buildInsights(windowRuns, stats, previousStats), [windowRuns, stats, previousStats]);
  const insightAnchors = useMemo(() => {
    const map = new Map();
    insights.forEach((insight) => {
      if (!insight.runId) return;
      const target = normalizedLogs.find((entry) => entry.runId === insight.runId);
      if (target && !map.has(target.runId)) {
        map.set(target.runId, target);
      }
    });
    return Array.from(map.values());
  }, [insights, normalizedLogs]);

  const avgScoreDelta = previousStats ? calculateDelta(stats.avgScore, previousStats.avgScore) : null;
  const costDelta = previousStats ? calculateDelta(stats.medianCost, previousStats.medianCost) : null;
  const tokensDelta = previousStats ? calculateDelta(stats.tokensP90, previousStats.tokensP90) : null;
  const acceptDelta = previousStats ? calculateDelta(stats.acceptRate, previousStats.acceptRate) : null;
  const durationDelta = previousStats ? calculateDelta(stats.durationP95, previousStats.durationP95) : null;
  const errorDelta = previousStats ? calculateDelta(stats.errorRate, previousStats.errorRate) : null;

  const highestCostRuns = [...windowRuns]
    .sort((a, b) => (safeNumber(b.cost) ?? 0) - (safeNumber(a.cost) ?? 0))
    .slice(0, 3);
  const additionalInsightRuns = insightAnchors.filter(
    (run) => !highestCostRuns.some((costRun) => costRun.runId === run.runId),
  );

  const rubricBreakdown = useMemo(() => {
    const rubricEntries = normalizedLogs.flatMap((run) => {
      const values = run.evaluation?.rubric ?? [];
      return Array.isArray(values) ? values : [values];
    });
    const counts = rubricEntries.reduce((acc, value) => {
      if (!value) return acc;
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    }, {});
    return { counts, total: rubricEntries.length };
  }, [normalizedLogs]);

  const dataQualityLine = `Duration captured: ${stats.dataQuality.durationCaptured}/${stats.totalRuns} runs · ` +
    `Agents captured: ${stats.dataQuality.agentsCaptured}/${stats.totalRuns} runs · ` +
    `Steps captured: ${stats.dataQuality.stepsCaptured}/${stats.totalRuns} runs`;

  const envBreakdown = [];
  if (COST_PER_DOLLAR_WATER_LITERS) {
    envBreakdown.push(`💧 ${(stats.medianCost * COST_PER_DOLLAR_WATER_LITERS).toFixed(1)} L`);
  }
  if (COST_PER_DOLLAR_ENERGY_KWH) {
    envBreakdown.push(`⚡ ${(stats.medianCost * COST_PER_DOLLAR_ENERGY_KWH).toFixed(2)} kWh`);
  }

  const scoringRubricList = Object.entries(rubricBreakdown.counts)
    .map(([label, count]) => `${label} (${count})`)
    .slice(0, 5);

  const rangeLabel = `${windowLabel} · ${windowRuns.length}/${totalRuns} runs`;

  const handleCopyRunPath = async (runId, path) => {
    if (!path || typeof navigator?.clipboard?.writeText !== 'function') {
      setCopyStatusByRun((prev) => ({ ...prev, [runId]: 'Clipboard unavailable' }));
      return;
    }
    try {
      await navigator.clipboard.writeText(path);
      setCopyStatusByRun((prev) => ({ ...prev, [runId]: 'Copied!' }));
    } catch {
      setCopyStatusByRun((prev) => ({ ...prev, [runId]: 'Copy failed' }));
    }
  };

  const hasTimestamps = windowRuns.some((run) => typeof run.timestampValue === 'number');
  useEffect(() => {
    if (!hasTimestamps && trendXAxis === 'time') {
      setTrendXAxis('index');
    }
  }, [hasTimestamps, trendXAxis]);

  const correlationData = useMemo(() => {
    const filtered = [];
    let missingTokens = 0;
    let missingScore = 0;
    windowRuns.forEach((run) => {
      const tokens = safeNumber(run.tokens);
      const score = safeNumber(run.score);
      if (tokens === null || tokens === undefined) {
        missingTokens += 1;
      }
      if (score === null || score === undefined) {
        missingScore += 1;
      }
      if (tokens !== null && tokens !== undefined && score !== null && score !== undefined) {
        filtered.push({ run, tokens, score });
      }
    });
    return { filtered, missingTokens, missingScore };
  }, [windowRuns]);

  const trendData = useMemo(() => {
    const baseRuns = trendXAxis === 'time'
      ? windowRuns
          .filter((run) => typeof run.timestampValue === 'number')
          .sort((a, b) => (a.timestampValue ?? 0) - (b.timestampValue ?? 0))
      : windowRuns;
    const entries = baseRuns.length ? baseRuns : [];
    const scoreMaxValue = 10;
    const costMaxValue = Math.max(...entries.map((run) => safeNumber(run.cost) ?? 0), 0.01);
    const minTime = Math.min(...entries.map((run) => run.timestampValue ?? 0), 0);
    const maxTime = Math.max(...entries.map((run) => run.timestampValue ?? 0), 0);
    const timeRange = Math.max(1, maxTime - minTime);

    const points = entries.map((run, index) => {
      const x = entries.length > 1
        ? ((trendXAxis === 'time'
          ? ((run.timestampValue ?? minTime) - minTime) / timeRange
          : index / (entries.length - 1)) * 400)
        : 0;
      const scoreValue = safeNumber(run.score) ?? 0;
      const yScore = 200 - (scoreValue / scoreMaxValue) * 200;
      const costValue = safeNumber(run.cost) ?? 0;
      const yCost = 200 - (costValue / costMaxValue) * 200;
      return { run, x, yScore, yCost };
    });

    const scoreAxisTicks = [0, scoreMaxValue / 2, scoreMaxValue];
    const costAxisTicks = [0, costMaxValue / 2, costMaxValue];

    return {
      baseRuns: entries,
      scorePoints: points.map((point) => ({ x: point.x, y: point.yScore, run: point.run })),
      costPoints: points.map((point) => ({ x: point.x, y: point.yCost, run: point.run })),
      xAxisLabel: trendXAxis === 'time' ? 'Time' : 'Run index',
      scoreAxisTicks,
      costAxisTicks,
      costMaxValue,
    };
  }, [windowRuns, trendXAxis]);

  const renderRunSummary = (run, { showCopy = false } = {}) => {
    const runShortId = getShortRunId(run);
    const timestampLabel = getRunTimestampLabel(run);
    const runKey = run.runId || runShortId;
    const copyStatus = copyStatusByRun[runKey];
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'center' }}>
        <div>
          <strong style={{ fontSize: '1rem' }}>{runShortId}</strong>
          <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: '#cbd5f5' }}>{timestampLabel}</p>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
            Score: {run.score ?? 'n/a'} · Cost: {run.cost !== null && run.cost !== undefined ? formatCurrency(run.cost) : 'n/a'}
          </p>
        </div>
        {showCopy && run.runFolder ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.35rem' }}>
            <button
              type="button"
              title={run.runFolder}
              onClick={() => handleCopyRunPath(runKey, run.runFolder)}
              style={{
                borderRadius: '999px',
                border: '1px solid #1e293b',
                background: '#0f172a',
                color: '#38bdf8',
                padding: '0.35rem 0.75rem',
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              Copy path
            </button>
            {copyStatus && <span style={{ fontSize: '0.75rem', color: '#fcd34d' }}>{copyStatus}</span>}
          </div>
        ) : null}
      </div>
    );
  };

  const correlationPoints = correlationData.filtered;
  const maxTokenValue = Math.max(1, 8000, ...correlationPoints.map((point) => point.tokens));

  return (
    <div style={{ padding: '2rem', background: '#020617', minHeight: '100vh', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div id="top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.75rem' }}>AI-Orchestration Milestones</h1>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.85rem', color: '#94a3b8' }}>
            Time window
            <select
              value={timeWindow.type}
              onChange={(event) => setTimeWindow((prev) => ({ ...prev, type: event.target.value }))}
              style={{ marginTop: '0.25rem', background: '#0f172a', color: '#f8fafc', border: '1px solid #1e293b', borderRadius: '6px', padding: '0.35rem 0.75rem' }}
            >
              {timeWindowOptions.map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
          </label>
          {timeWindow.type === 'custom' && (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
              <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                From
                <input
                  type="date"
                  value={timeWindow.customStart}
                  onChange={(event) => setTimeWindow((prev) => ({ ...prev, customStart: event.target.value }))}
                  style={{ display: 'block', marginTop: '0.25rem', background: '#0f172a', color: '#f8fafc', border: '1px solid #1e293b', borderRadius: '6px', padding: '0.35rem 0.5rem' }}
                />
              </label>
              <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                To
                <input
                  type="date"
                  value={timeWindow.customEnd}
                  onChange={(event) => setTimeWindow((prev) => ({ ...prev, customEnd: event.target.value }))}
                  style={{ display: 'block', marginTop: '0.25rem', background: '#0f172a', color: '#f8fafc', border: '1px solid #1e293b', borderRadius: '6px', padding: '0.35rem 0.5rem' }}
                />
              </label>
            </div>
          )}
          <button
            type="button"
            onClick={() => setGlossaryOpen(true)}
            style={{ background: '#1e293b', color: '#cbd5f5', border: '1px solid #1e293b', borderRadius: '6px', padding: '0.5rem 0.75rem' }}
          >
            Glossary / Methodology
          </button>
        </div>
      </div>

      {!customValid && <p style={{ color: '#fca5a5' }}>Custom range requires valid start and end dates. Showing all runs.</p>}
      <p style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: '1rem' }}>{rangeLabel}</p>

      <section style={{ marginBottom: '2rem' }}>
        <h2 style={{ marginTop: 0 }}>A) Health at a glance</h2>
        <p style={{ marginTop: 0, color: '#94a3b8' }}>Score, cost, tokens, and reliability KPIs describe the current time window with deltas vs the previous window.</p>
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div style={{ background: '#0f172a', borderRadius: '16px', padding: '1rem', border: '1px solid #1f2937' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>Avg score</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem' }}>
              <strong style={{ fontSize: '1.7rem' }}>{stats.avgScore.toFixed(2)}</strong>
              <button
                type="button"
                onClick={() => setScoringInfoOpen(true)}
                style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer' }}
              >
                ⓘ How scoring works
              </button>
            </div>
            <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.8rem', color: '#cbd5f5' }}>
              Δ {formatDeltaValue(avgScoreDelta)}
            </p>
          </div>
          <div style={{ background: '#0f172a', borderRadius: '16px', padding: '1rem', border: '1px solid #1f2937' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>Median cost</p>
            <strong style={{ fontSize: '1.7rem' }}>{formatCurrency(stats.medianCost)}</strong>
            <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.8rem', color: '#cbd5f5' }}>
              Δ {formatDeltaValue(costDelta, formatCurrency)}
            </p>
            <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }} title="Environmental conversions can be enabled via src/config/telemetry.ts">
              {envBreakdown.length ? envBreakdown.join(' · ') : 'Env: not configured'}
            </p>
          </div>
          <div style={{ background: '#0f172a', borderRadius: '16px', padding: '1rem', border: '1px solid #1f2937' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>Tokens p90</p>
            <strong style={{ fontSize: '1.7rem' }}>{Math.round(stats.tokensP90)}</strong>
            <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.8rem', color: '#cbd5f5' }}>
              Δ {formatDeltaValue(tokensDelta, (value) => Math.round(value).toString())}
            </p>
          </div>
          <div style={{ background: '#0f172a', borderRadius: '16px', padding: '1rem', border: '1px solid #1f2937' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>Accept rate</p>
            <strong style={{ fontSize: '1.7rem' }}>{formatPercent(stats.acceptRate)}</strong>
            <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.8rem', color: '#cbd5f5' }}>
              Δ {formatDeltaValue(acceptDelta, formatPercent)}
            </p>
          </div>
          <div style={{ background: '#0f172a', borderRadius: '16px', padding: '1rem', border: '1px solid #1f2937' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>Reliability</p>
            <p style={{ margin: 0, fontSize: '1rem' }}>Duration p95: {formatDuration(stats.durationP95)}</p>
            <p style={{ margin: '0.3rem 0', fontSize: '1rem' }}>Error rate: {formatPercent(stats.errorRate)}</p>
            <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.8rem', color: '#cbd5f5' }}>
              Duration Δ {formatDeltaValue(durationDelta, formatDuration)}
            </p>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: '#cbd5f5' }}>
              Error Δ {formatDeltaValue(errorDelta, formatPercent)}
            </p>
          </div>
        </div>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginTop: '1rem' }}>{dataQualityLine}</p>
        <p style={{ color: '#cbd5f5', marginTop: '0.5rem' }}>
          Rubric: {scoringRubricList.length ? scoringRubricList.join(' · ') : 'Rubric data not captured'}
        </p>
      </section>

      <section style={{ marginBottom: '2rem' }}>
        <h2>B) Distributions & outliers</h2>
        <p style={{ marginTop: 0, color: '#94a3b8' }}>Histograms show how tokens, cost, and score bins break down. Hover for exact counts and percentages.</p>
        <div style={{ display: 'grid', gap: '1.25rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {[
            { title: 'Score distribution', hist: stats.histogram.score, axis: 'Score (points)', percentiles: stats.scorePercentiles, markerLabel: 'points' },
            { title: 'Cost distribution', hist: stats.histogram.cost, axis: 'Cost (USD)', percentiles: stats.costPercentiles, markerLabel: 'USD' },
            { title: 'Token distribution', hist: stats.histogram.tokens, axis: 'Tokens', percentiles: stats.tokensPercentiles, markerLabel: 'tokens' },
          ].map((item) => {
            const bucketRangeLabel = `${item.hist.buckets[0]?.start?.toFixed(1) ?? '0'} → ${item.hist.buckets[item.hist.buckets.length - 1]?.end?.toFixed(1) ?? '0'}`;
            return (
              <div key={item.title} style={{ background: '#0f172a', borderRadius: '16px', padding: '1rem', border: '1px solid #1f2937' }}>
                <p style={{ margin: '0 0 0.5rem 0', fontWeight: '600' }}>{item.title}</p>
                <div style={{ position: 'relative', height: '80px', background: '#020617', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', height: '100%' }}>
                    {item.hist.buckets.map((bucket, index) => {
                      const bucketLabel = `${item.markerLabel} ${bucket.label}`;
                      const examplesText = bucket.examples.length ? `Examples: ${bucket.examples.join(', ')}` : 'Examples: none';
                      return (
                        <div
                          key={`${item.title}-bucket-${index}`}
                          title={`${bucketLabel} · ${bucket.count} runs · ${(bucket.percentage * 100).toFixed(1)}% · ${examplesText}`}
                          style={{
                            flex: bucket.percentage === 0 ? 0.3 : bucket.percentage,
                            minWidth: '6px',
                            background: '#22d3ee',
                            marginRight: '2px',
                            display: 'flex',
                            alignItems: 'flex-end',
                            justifyContent: 'center',
                            fontSize: '0.65rem',
                            color: '#030712',
                            fontWeight: '600',
                          }}
                        >
                          {bucket.count}
                        </div>
                      );
                    })}
                  </div>
                  {[{ label: 'median', value: item.percentiles?.median }, { label: 'p90', value: item.percentiles?.p90 }]
                    .filter((marker) => typeof marker.value === 'number' && item.hist.max !== item.hist.min)
                    .map((marker) => {
                      const position = ((marker.value - item.hist.min) / (item.hist.max - item.hist.min)) * 100;
                      return (
                        <div
                          key={`${item.title}-${marker.label}`}
                          title={`${marker.label.toUpperCase()}: ${marker.value.toFixed(2)}`}
                          style={{
                            position: 'absolute',
                            left: `${Math.max(0, Math.min(position, 100))}%`,
                            top: 0,
                            bottom: 0,
                            width: '2px',
                            background: '#f97316',
                          }}
                        />
                      );
                    })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                  <span>{item.axis}</span>
                  <span>Runs: {stats.totalRuns}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#cbd5f5', marginTop: '0.25rem' }}>
                  <span>Range: {bucketRangeLabel}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: '#cbd5f5', marginTop: '0.25rem' }}>
                  <span>Median {item.percentiles?.median?.toFixed(1) ?? 'n/a'}</span>
                  <span>P90 {item.percentiles?.p90?.toFixed(1) ?? 'n/a'}</span>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: '1.5rem', background: '#0f172a', borderRadius: '16px', padding: '1rem', border: '1px solid #1f2937' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ margin: 0, fontWeight: '600' }}>Top outliers</p>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Sorted by cost</span>
          </div>
          {highestCostRuns.length ? (
            <ul style={{ margin: '0.75rem 0 0 0', paddingLeft: 0, fontSize: '0.9rem' }}>
              {highestCostRuns.map((run, index) => (
                <li
                  key={run.runId || run.runFolder || `cost-${index}`}
                  id={`run-${run.runId || index}`}
                  title={run.runFolder || 'Path not captured'}
                  style={{ marginBottom: '0.8rem', listStyle: 'none' }}
                >
                  {renderRunSummary(run, { showCopy: true })}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: '0.75rem 0 0 0', color: '#94a3b8' }}>No runs captured for this window.</p>
          )}
          {additionalInsightRuns.length ? (
            <div style={{ marginTop: '0.75rem', borderTop: '1px solid #1f2937', paddingTop: '0.75rem' }}>
              <p style={{ margin: '0 0 0.4rem 0', fontSize: '0.85rem', color: '#cbd5f5' }}>Insight run references</p>
              <ul style={{ margin: 0, paddingLeft: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
              {additionalInsightRuns.map((run, index) => (
                <li
                  key={`insight-${run.runId || run.runFolder || index}`}
                  id={`run-${run.runId || index}`}
                  title={run.runFolder || 'Path not captured'}
                  style={{ marginBottom: '0.4rem', listStyle: 'none' }}
                >
                  {renderRunSummary(run)}
                </li>
              ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      <section style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: '2fr 1fr', marginBottom: '2rem' }}>
        <div>
          <h2>C) Trends & drivers</h2>
          <p style={{ marginTop: 0, color: '#94a3b8' }}>Score and cost over time plus correlation help identify where improvements happen.</p>
          <div style={{ background: '#0f172a', borderRadius: '16px', padding: '1rem', border: '1px solid #1f2937', marginBottom: '1rem' }}>
            <p style={{ margin: 0, fontWeight: '600' }}>Score & Cost trend</p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: '#cbd5f5' }}>X-axis</span>
              <button
                type="button"
                onClick={() => setTrendXAxis('index')}
                style={{
                  borderRadius: '999px',
                  border: '1px solid #1e293b',
                  background: trendXAxis === 'index' ? '#2563eb' : '#0f172a',
                  color: trendXAxis === 'index' ? '#e0f2fe' : '#cbd5f5',
                  padding: '0.25rem 0.75rem',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                }}
              >
                Run index
              </button>
              {hasTimestamps && (
                <button
                  type="button"
                  onClick={() => setTrendXAxis('time')}
                  style={{
                    borderRadius: '999px',
                    border: '1px solid #1e293b',
                    background: trendXAxis === 'time' ? '#2563eb' : '#0f172a',
                    color: trendXAxis === 'time' ? '#e0f2fe' : '#cbd5f5',
                    padding: '0.25rem 0.75rem',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                  }}
                >
                  Time
                </button>
              )}
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>using {trendData.baseRuns.length} run(s)</span>
            </div>
            <div style={{ height: '200px', position: 'relative', marginTop: '0.75rem' }}>
              <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="none" style={{ display: 'block' }}>
                <polyline
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="2"
                  points={trendData.scorePoints
                    .map((point) => `${point.x},${point.y}`)
                    .join(' ')}
                />
                <polyline
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="2"
                  points={trendData.costPoints
                    .map((point) => `${point.x},${point.y}`)
                    .join(' ')}
                />
                {trendData.scorePoints.map((point, index) => {
                  const runKey = point.run.runId || getShortRunId(point.run);
                  return (
                    <circle
                      key={`${runKey}-point-${index}`}
                      cx={point.x}
                      cy={point.y}
                      r="4"
                      fill="#22d3ee"
                      title={`Score ${point.run.score ?? 'n/a'} · ${runKey}`}
                    />
                  );
                })}
              </svg>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                <span>Runs →</span>
                <span>Score</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
              <div>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>Score (points)</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#cbd5f5' }}>
                  {trendData.scoreAxisTicks.map((value) => (
                    <span key={`score-tick-${value}`}>{value.toFixed(1)}</span>
                  ))}
                </div>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>Cost (USD)</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#cbd5f5' }}>
                  {trendData.costAxisTicks.map((value) => (
                    <span key={`cost-tick-${value}`}>${value.toFixed(2)}</span>
                  ))}
                </div>
              </div>
            </div>
            <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#cbd5f5' }}>X-axis label: {trendData.xAxisLabel}</p>
          </div>

          <div style={{ background: '#0f172a', borderRadius: '16px', padding: '1rem', border: '1px solid #1f2937' }}>
            <p style={{ margin: 0, fontWeight: '600' }}>Score vs Tokens correlation</p>
            <div style={{ position: 'relative', height: '200px', marginTop: '0.75rem' }}>
              <svg width="100%" height="100%" viewBox="0 0 400 200" preserveAspectRatio="none">
                {correlationPoints.map((point, index) => {
                  const sanitizedTokens = Math.min(point.tokens, maxTokenValue);
                  const x = (sanitizedTokens / maxTokenValue) * 400;
                  const scoreValue = safeNumber(point.score) ?? 0;
                  const y = 200 - (scoreValue / 10) * 200;
                  return (
                    <circle
                      key={`tokens-point-${index}`}
                      cx={x}
                      cy={y}
                      r="4"
                      fill="#f472b6"
                      opacity="0.9"
                      title={`Tokens ${point.tokens} · Score ${point.score}`}
                    />
                  );
                })}
              </svg>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                <span>Tokens ↑</span>
                <span>Score →</span>
              </div>
            </div>
            {!correlationPoints.length && (
              <p style={{ marginTop: '0.5rem', color: '#fca5a5' }}>No runs captured with both score and tokens.</p>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem', fontSize: '0.75rem' }}>
              {correlationData.missingTokens ? (
                <span style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', background: '#361b45', color: '#fcd34d' }}>
                  Excluded due to missing tokens: {correlationData.missingTokens}
                </span>
              ) : (
                <span style={{ color: '#94a3b8' }}>Tokens captured for all runs</span>
              )}
              {correlationData.missingScore ? (
                <span style={{ padding: '0.2rem 0.5rem', borderRadius: '6px', background: '#361b45', color: '#fcd34d' }}>
                  Excluded due to missing score: {correlationData.missingScore}
                </span>
              ) : (
                <span style={{ color: '#94a3b8' }}>Score captured for all runs</span>
              )}
            </div>
          </div>
        </div>
        <aside style={{ background: '#0f172a', borderRadius: '16px', padding: '1rem', border: '1px solid #1f2937', minHeight: '260px' }}>
          <p style={{ margin: 0, fontWeight: '600' }}>Insights</p>
          <ul style={{ margin: '0.75rem 0 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {insights.map((insight) => (
              <li key={insight.id} style={{ fontSize: '0.9rem' }}>
                <a href={insight.link} style={{ color: '#38bdf8', textDecoration: 'none', fontWeight: '600' }}>{insight.title}</a>
                <p style={{ margin: '0.25rem 0 0 0', color: '#cbd5f5' }}>{insight.detail}</p>
              </li>
            ))}
            {!insights.length && <li style={{ color: '#94a3b8' }}>No insights available yet.</li>}
          </ul>
        </aside>
      </section>

      <section style={{ background: '#0f172a', borderRadius: '16px', padding: '1rem', border: '1px solid #1f2937' }}>
        <h2 style={{ marginTop: 0 }}>Current goal</h2>
        <p style={{ color: '#cbd5f5' }}>{normalizedGoal.goal}</p>
        {normalizedGoal.successCriteria.length ? (
          <ul style={{ color: '#cbd5f5', paddingLeft: '1.2rem' }}>
            {normalizedGoal.successCriteria.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p style={{ color: '#94a3b8' }}>Success criteria not captured.</p>
        )}
      </section>

      {glossaryOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ background: '#020617', border: '1px solid #1f2937', borderRadius: '16px', padding: '2rem', width: 'min(600px, 90vw)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Glossary & methodology</h3>
              <button type="button" onClick={() => setGlossaryOpen(false)} style={{ background: 'transparent', border: 'none', color: '#f87171', fontSize: '1.25rem' }}>×</button>
            </div>
            <p style={{ color: '#cbd5f5' }}>{scoringMethodology}</p>
            <ul style={{ paddingLeft: '1.2rem', color: '#e2e8f0' }}>
              {glossaryDefinitions.map((entry) => (
                <li key={entry.term} style={{ marginBottom: '0.5rem' }}>
                  <strong>{entry.term}:</strong> {entry.definition}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {scoringInfoOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 6, 23, 0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ background: '#020617', border: '1px solid #1f2937', borderRadius: '16px', padding: '2rem', width: 'min(480px, 90vw)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Scoring methodology</h3>
              <button type="button" onClick={() => setScoringInfoOpen(false)} style={{ background: 'transparent', border: 'none', color: '#f87171', fontSize: '1.25rem' }}>×</button>
            </div>
            <p style={{ color: '#cbd5f5', marginTop: '1rem' }}>{scoringMethodology}</p>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Scores are compared against previous windows to produce the KPIs above. Ties fall back to latest timestamps.</p>
          </div>
        </div>
      )}
    </div>
  );
}
