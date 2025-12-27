import { Distribution, HistogramBucket, MetricsSummary, Outcome, RunRecord, TimeWindowState, WindowComputation } from './types';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTimestamp(value: unknown): number | null {
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

function normalizeOutcome(raw: unknown): Outcome {
  if (!raw) return 'unknown';
  const normalized = String(raw).toLowerCase();
  if (normalized.includes('accept')) return 'accepted';
  if (normalized.includes('refine')) return 'refine';
  if (normalized.includes('reject')) return 'rejected';
  if (normalized.includes('unknown')) return 'unknown';
  return 'unknown';
}

export function readField(entry: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (key in entry) return entry[key];
  }
  return undefined;
}

export function normalizeRun(entry: Record<string, unknown>, index = 0): RunRecord {
  const scoreValue = safeNumber(readField(entry, ['Score', 'score']));
  const tokensValue = safeNumber(readField(entry, ['Tokens', 'tokens']));
  const costValue = safeNumber(readField(entry, ['Cost', 'cost']));
  const durationMsRaw = safeNumber(readField(entry, ['DurationMs', 'durationMs']));
  const durationSeconds = safeNumber(readField(entry, ['Duration', 'duration']));
  const durationMs = durationMsRaw ?? (durationSeconds !== null ? durationSeconds * 1000 : null);
  const timestampValue = parseTimestamp(readField(entry, ['Timestamp', 'timestamp', 'TimestampStart', 'timestampStart']));

  const runFolder = readField(entry, ['runFolder', 'RunFolder']);
  const runIdRaw = readField(entry, ['runId', 'RunId', 'runFolder', 'RunFolder']);

  return {
    runId: typeof runIdRaw === 'string' && runIdRaw.trim() ? runIdRaw : `run-${index + 1}`,
    runFolder: typeof runFolder === 'string' ? runFolder : '',
    message: (readField(entry, ['Message', 'message', 'Synthesis']) as string) ?? '',
    goal: (readField(entry, ['Goal', 'goal']) as string) ?? '',
    score: scoreValue,
    tokens: tokensValue,
    cost: costValue,
    durationMs,
    outcome: normalizeOutcome(readField(entry, ['Outcome', 'outcome'])),
    timestamp: (readField(entry, ['Timestamp', 'timestamp']) as string) ?? '',
    timestampValue,
    retries: safeNumber(readField(entry, ['RetryCount', 'retries'])) ?? 0,
    errorCount: safeNumber(readField(entry, ['Errors', 'errorCount'])) ?? 0,
    synthesis: (() => {
      const synth = readField(entry, ['Synthesis']);
      return typeof synth === 'string' ? synth : undefined;
    })(),
  };
}

export function normalizeRuns(entries: Record<string, unknown>[]): RunRecord[] {
  return (entries ?? []).map((entry, index) => normalizeRun(entry, index));
}

export function calculatePercentile(values: number[], percentile: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  const weight = idx % 1;
  if (upper >= sorted.length) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
}

export function buildHistogramSegments(values: number[], bucketCount = 6, range?: { min?: number; max?: number }): Distribution {
  if (!values.length) {
    const emptyBuckets: HistogramBucket[] = Array.from({ length: bucketCount }, (_, index) => ({
      start: 0,
      end: 0,
      count: 0,
      percentage: 0,
      label: `bin-${index + 1}`,
    }));
    return {
      buckets: emptyBuckets,
      min: range?.min ?? 0,
      max: range?.max ?? 0,
      total: 0,
    };
  }

  const sanitizedMin = range?.min ?? Math.min(...values);
  const sanitizedMax = range?.max ?? Math.max(...values);
  const diff = sanitizedMax - sanitizedMin || 1;
  const size = Math.max(1, bucketCount);

  const rawBuckets = Array.from({ length: size }, (_, index) => ({
    start: sanitizedMin + (diff * index) / size,
    end: sanitizedMin + (diff * (index + 1)) / size,
    count: 0,
  }));

  values.forEach((value) => {
    const normalized = Math.min(size - 1, Math.floor(((value - sanitizedMin) / diff) * size));
    const target = rawBuckets[Math.max(0, normalized)];
    target.count += 1;
  });

  const total = values.length;
  const buckets: HistogramBucket[] = rawBuckets.map((bucket) => ({
    ...bucket,
    percentage: total ? bucket.count / total : 0,
    label: `${bucket.start.toFixed(2)} - ${bucket.end.toFixed(2)}`,
  }));

  return { buckets, min: sanitizedMin, max: sanitizedMax, total };
}

export function summarizeRuns(runs: RunRecord[]): MetricsSummary {
  const total = runs.length;
  if (!total) {
    return {
      totalRuns: 0,
      avgScore: 0,
      medianCost: 0,
      tokensP90: 0,
      tokensMedian: 0,
      scoreMedian: 0,
      scoreP75: 0,
      scoreP90: 0,
      costP75: 0,
      costP90: 0,
      durationP95: 0,
      errorRate: 0,
      acceptRate: 0,
      outcomeCounts: { accepted: 0, refine: 0, rejected: 0, unknown: 0 },
      histogram: {
        tokens: buildHistogramSegments([], 6),
        cost: buildHistogramSegments([], 6),
        score: buildHistogramSegments([], 6),
      },
    };
  }

  const extractNumeric = (field: keyof RunRecord) =>
    runs.map((run) => safeNumber(run[field])).filter((value): value is number => value !== null);

  const scoreValues = extractNumeric('score');
  const tokensValues = extractNumeric('tokens');
  const costValues = extractNumeric('cost');
  const durationValues = extractNumeric('durationMs').filter((value) => value > 0);
  const totalErrors = runs.reduce((acc, run) => acc + (safeNumber(run.errorCount) ?? 0), 0);

  const outcomeBuckets = runs.reduce(
    (acc, run) => {
      const outcome = run.outcome;
      if (outcome === 'accepted') acc.accepted += 1;
      else if (outcome === 'refine') acc.refine += 1;
      else if (outcome === 'rejected') acc.rejected += 1;
      else acc.unknown += 1;
      return acc;
    },
    { accepted: 0, refine: 0, rejected: 0, unknown: 0 },
  );

  const scoreMin = scoreValues.length ? Math.min(...scoreValues) : 0;
  const scoreMax = scoreValues.length ? Math.max(...scoreValues) : 10;
  const scoreBucketRange = Math.max(1, scoreMax - scoreMin);
  const scoreBucketCount = scoreValues.length ? Math.min(12, Math.max(6, Math.ceil(scoreBucketRange * 2))) : 6;

  const tokensBucketCount = tokensValues.length
    ? Math.min(10, Math.max(6, Math.ceil(Math.sqrt(tokensValues.length) + 2)))
    : 6;

  const costMin = costValues.length ? Math.min(...costValues) : 0;
  const costMax = costValues.length ? Math.max(...costValues) : 1;
  const costBucketRange = Math.max(1, costMax - costMin);
  const costBucketCount = costValues.length ? Math.min(10, Math.max(6, Math.ceil(costBucketRange * 2))) : 6;

  return {
    totalRuns: total,
    avgScore: scoreValues.length ? scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length : 0,
    medianCost: calculatePercentile(costValues, 50),
    tokensP90: calculatePercentile(tokensValues, 90),
    tokensMedian: calculatePercentile(tokensValues, 50),
    scoreMedian: calculatePercentile(scoreValues, 50),
    scoreP75: calculatePercentile(scoreValues, 75),
    scoreP90: calculatePercentile(scoreValues, 90),
    costP75: calculatePercentile(costValues, 75),
    costP90: calculatePercentile(costValues, 90),
    durationP95: calculatePercentile(durationValues, 95),
    errorRate: total ? totalErrors / total : 0,
    acceptRate: total ? outcomeBuckets.accepted / total : 0,
    outcomeCounts: outcomeBuckets,
    histogram: {
      tokens: buildHistogramSegments(tokensValues, tokensBucketCount),
      cost: buildHistogramSegments(costValues, costBucketCount),
      score: buildHistogramSegments(scoreValues, scoreBucketCount, { min: scoreMin, max: scoreMax || scoreMin + 1 }),
    },
  };
}

export function computeTimeWindow(runs: RunRecord[], windowState: TimeWindowState): WindowComputation {
  if (!runs.length) {
    return { windowRuns: [], previousRuns: [], label: 'No runs yet', customValid: true, totalRuns: 0 };
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
    .sort((a, b) => a._timestamp - b._timestamp)
    .map((run) => ({ ...run }));

  const previousRuns =
    windowState.type === 'all' || windowLength <= 0
      ? []
      : enriched
          .filter((run) => run._timestamp >= start - windowLength && run._timestamp < start)
          .sort((a, b) => a._timestamp - b._timestamp)
          .map((run) => ({ ...run }));

  return {
    windowRuns,
    previousRuns,
    label,
    customValid,
    totalRuns: runs.length,
  };
}
