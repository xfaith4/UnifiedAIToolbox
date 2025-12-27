import { describe, expect, it } from 'vitest';
import { evaluateMilestones } from '../../../lib/milestones/evaluate';
import { summarizeRuns } from '../../../lib/milestones/metrics';
import { MetricsSummary, RunRecord } from '../../../lib/milestones/types';

const baseMetrics: MetricsSummary = {
  totalRuns: 10,
  avgScore: 8.1,
  medianCost: 0.18,
  tokensP90: 6500,
  tokensMedian: 4200,
  scoreMedian: 8,
  scoreP75: 8.3,
  scoreP90: 9.1,
  costP75: 0.22,
  costP90: 0.32,
  durationP95: 80000,
  errorRate: 0.05,
  acceptRate: 0.9,
  outcomeCounts: { accepted: 9, refine: 0, rejected: 1, unknown: 0 },
  histogram: {
    tokens: { buckets: [], min: 0, max: 0, total: 0 },
    cost: { buckets: [], min: 0, max: 0, total: 0 },
    score: { buckets: [], min: 0, max: 0, total: 0 },
  },
};

function cloneMetrics(overrides: Partial<MetricsSummary> = {}): MetricsSummary {
  return { ...baseMetrics, ...overrides };
}

describe('evaluateMilestones', () => {
  it('marks all milestones achieved when thresholds are satisfied', () => {
    const results = evaluateMilestones(baseMetrics);
    expect(results).toHaveLength(5);
    results.forEach((m) => expect(m.status).toBe('achieved'));
  });

  it('flags milestones as at risk when far from targets', () => {
    const risky = cloneMetrics({
      avgScore: 6,
      scoreP75: 6.5,
      medianCost: 0.5,
      costP90: 0.8,
      tokensP90: 11000,
      tokensMedian: 8000,
      acceptRate: 0.6,
      errorRate: 0.4,
      durationP95: 200000,
    });
    const results = evaluateMilestones(risky);
    const riskStatuses = results.map((m) => m.status);
    expect(riskStatuses).toContain('at_risk');
    expect(riskStatuses.filter((s) => s === 'at_risk').length).toBeGreaterThan(2);
  });

  it('returns not started when there are no runs or missing metrics', () => {
    const emptyMetrics: MetricsSummary = {
      ...baseMetrics,
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
    };
    const results = evaluateMilestones(emptyMetrics);
    results.forEach((m) => expect(m.status).toBe('not_started'));
  });

  it('summarizes runs defensively when values are missing', () => {
    const runs: RunRecord[] = [
      { runId: 'a', score: 8, tokens: 1000, cost: 0.1, durationMs: 10000, outcome: 'accepted', timestamp: '', timestampValue: null, retries: 0, errorCount: 0 },
      { runId: 'b', score: null, tokens: null, cost: null, durationMs: null, outcome: 'unknown', timestamp: '', timestampValue: null, retries: 0, errorCount: 0 },
      { runId: 'c', score: 6, tokens: 2000, cost: 0.2, durationMs: 20000, outcome: 'rejected', timestamp: '', timestampValue: null, retries: 0, errorCount: 1 },
    ];
    const summary = summarizeRuns(runs);
    expect(summary.totalRuns).toBe(3);
    expect(summary.acceptRate).toBeCloseTo(1 / 3, 3);
    expect(summary.tokensP90).toBeGreaterThan(0);
  });
});
