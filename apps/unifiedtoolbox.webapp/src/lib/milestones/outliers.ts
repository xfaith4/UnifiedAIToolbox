import { RunRecord } from './types';
import { safeNumber } from './metrics';

function topBy(runs: RunRecord[], field: keyof RunRecord, limit = 5, direction: 'asc' | 'desc' = 'desc') {
  const sorted = [...runs]
    .filter((run) => {
      const value = safeNumber(run[field]);
      return value !== null && value !== undefined;
    })
    .sort((a, b) => {
      const aVal = safeNumber(a[field]) ?? 0;
      const bVal = safeNumber(b[field]) ?? 0;
      return direction === 'desc' ? bVal - aVal : aVal - bVal;
    });
  return sorted.slice(0, limit);
}

function detectWeird(runs: RunRecord[], field: keyof RunRecord, zThreshold = 2): RunRecord[] {
  const values = runs
    .map((run) => safeNumber(run[field]))
    .filter((value): value is number => value !== null && value !== undefined);
  if (values.length < 4) return [];
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const stddev = Math.sqrt(variance);
  if (!stddev) return [];

  return runs
    .map((run) => {
      const value = safeNumber(run[field]);
      if (value === null || value === undefined) return null;
      const z = (value - mean) / stddev;
      return { run, z };
    })
    .filter((entry): entry is { run: RunRecord; z: number } => Boolean(entry))
    .filter((entry) => Math.abs(entry.z) >= zThreshold)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, 5)
    .map((entry) => entry.run);
}

export function computeOutliers(runs: RunRecord[]) {
  return {
    topCost: topBy(runs, 'cost', 5, 'desc'),
    topTokens: topBy(runs, 'tokens', 5, 'desc'),
    lowestScore: topBy(runs, 'score', 5, 'asc'),
    weird: detectWeird(runs, 'tokens').concat(detectWeird(runs, 'cost')),
  };
}
