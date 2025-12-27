import { MilestoneDefinition } from './types';

export const milestoneDefinitions: MilestoneDefinition[] = [
  {
    id: 'reliability',
    title: 'Reliability',
    description: 'Keep acceptance high and errors contained so runs are consistently usable.',
    thresholds: [
      { metric: 'acceptRate', direction: 'gte', target: 0.85, label: 'Acceptance rate ≥ 85%', tolerance: 0.05 },
      { metric: 'errorRate', direction: 'lte', target: 0.15, label: 'Error rate ≤ 0.15 err/run', tolerance: 0.05 },
    ],
    nextAction: 'Triage rejected/refine runs and stabilize flaky steps before adding load.',
  },
  {
    id: 'quality',
    title: 'Quality Score',
    description: 'Commissioner quality should be consistently strong, not just spiky.',
    thresholds: [
      { metric: 'avgScore', direction: 'gte', target: 7.5, label: 'Avg score ≥ 7.5', tolerance: 0.5 },
      { metric: 'scoreP75', direction: 'gte', target: 8, label: 'P75 score ≥ 8', tolerance: 0.5 },
    ],
    nextAction: 'Review rubric feedback for low-score runs and patch prompting gaps.',
  },
  {
    id: 'cost',
    title: 'Cost Efficiency',
    description: 'Keep spending predictable by reducing heavy tails.',
    thresholds: [
      { metric: 'medianCost', direction: 'lte', target: 0.2, label: 'Median cost ≤ $0.20', tolerance: 0.05 },
      { metric: 'costP90', direction: 'lte', target: 0.4, label: 'P90 cost ≤ $0.40', tolerance: 0.05 },
    ],
    nextAction: 'Clamp expensive branches and cache artifacts for high-cost runs.',
  },
  {
    id: 'tokens',
    title: 'Token Discipline',
    description: 'Prevent runaway token use that erodes margins.',
    thresholds: [
      { metric: 'tokensP90', direction: 'lte', target: 7000, label: 'P90 tokens ≤ 7,000', tolerance: 500 },
      { metric: 'tokensMedian', direction: 'lte', target: 4500, label: 'Median tokens ≤ 4,500', tolerance: 250 },
    ],
    nextAction: 'Trim verbose tool traces and tighten context windows for heavy runs.',
  },
  {
    id: 'speed',
    title: 'Throughput & Latency',
    description: 'Long tail latency should stay bounded for operational readiness.',
    thresholds: [
      { metric: 'durationP95', direction: 'lte', target: 120000, label: 'P95 duration ≤ 120s', tolerance: 15000 },
    ],
    nextAction: 'Parallelize slow steps or increase concurrency for the slowest 5%.',
  },
];
