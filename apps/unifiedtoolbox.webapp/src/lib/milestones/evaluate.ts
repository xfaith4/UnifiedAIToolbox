import { milestoneDefinitions } from './definitions';
import { MetricsSummary, MilestoneEvaluation, MilestoneStatus, MilestoneThreshold } from './types';

const DEFAULT_TOLERANCE = 0.1;

function meetsThreshold(value: number | null, threshold: MilestoneThreshold): { pass: boolean; near: boolean; missing: boolean } {
  if (value === null || Number.isNaN(value)) {
    return { pass: false, near: false, missing: true };
  }
  const tolerance = threshold.tolerance ?? DEFAULT_TOLERANCE * Math.abs(threshold.target || 1);
  if (threshold.direction === 'gte') {
    const pass = value >= threshold.target;
    const near = !pass && value >= threshold.target - tolerance;
    return { pass, near, missing: false };
  }
  const pass = value <= threshold.target;
  const near = !pass && value <= threshold.target + tolerance;
  return { pass, near, missing: false };
}

function resolveMetric(metrics: MetricsSummary, key: MilestoneThreshold['metric']): number | null {
  switch (key) {
    case 'acceptRate':
      return metrics.acceptRate;
    case 'errorRate':
      return metrics.errorRate;
    case 'avgScore':
      return metrics.avgScore;
    case 'scoreP75':
      return metrics.scoreP75;
    case 'tokensMedian':
      return metrics.tokensMedian;
    case 'tokensP90':
      return metrics.tokensP90;
    case 'medianCost':
      return metrics.medianCost;
    case 'costP90':
      return metrics.costP90;
    case 'durationP95':
      return metrics.durationP95;
    default:
      return null;
  }
}

export function evaluateMilestones(metrics: MetricsSummary): MilestoneEvaluation[] {
  if (!metrics) return [];

  return milestoneDefinitions.map((definition) => {
    const evaluations = definition.thresholds.map((threshold) => {
      const value = resolveMetric(metrics, threshold.metric);
      const { pass, near, missing } = meetsThreshold(value, threshold);
      return { pass, near, missing, value, threshold };
    });

    let status: MilestoneStatus = 'not_started';
    if (metrics.totalRuns === 0 || evaluations.every((e) => e.missing)) {
      status = 'not_started';
    } else if (evaluations.every((e) => e.pass)) {
      status = 'achieved';
    } else if (evaluations.some((e) => e.near) || evaluations.filter((e) => e.pass).length >= definition.thresholds.length - 1) {
      status = 'on_track';
    } else {
      status = 'at_risk';
    }

    const unmet = evaluations.find((e) => !e.pass);
    const detail = unmet
      ? `${unmet.threshold.label} (${valueLabel(resolveMetric(metrics, unmet.threshold.metric), unmet.threshold)}).`
      : 'All thresholds met.';

    return {
      id: definition.id,
      title: definition.title,
      status,
      detail,
      nextAction: definition.nextAction,
      thresholds: definition.thresholds,
    };
  });
}

function valueLabel(value: number | null, threshold: MilestoneThreshold): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'no data';
  const formatter =
    threshold.metric === 'acceptRate' || threshold.metric === 'errorRate'
      ? (val: number) => `${(val * 100).toFixed(1)}%`
      : threshold.metric.toLowerCase().includes('cost')
      ? (val: number) => `$${val.toFixed(3)}`
      : threshold.metric.toLowerCase().includes('duration')
      ? (val: number) => `${(val / 1000).toFixed(1)}s`
      : (val: number) => val.toFixed(1);
  return formatter(value);
}
