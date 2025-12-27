export type Outcome = 'accepted' | 'refine' | 'rejected' | 'unknown';

export type RunRecord = {
  runId: string;
  runFolder?: string;
  message?: string;
  goal?: string;
  score: number | null;
  tokens: number | null;
  cost: number | null;
  durationMs: number | null;
  outcome: Outcome;
  timestamp: string;
  timestampValue: number | null;
  retries: number;
  errorCount: number;
  synthesis?: string;
};

export type GoalInfo = {
  goal: string;
  objective?: string;
  successCriteria: string[];
  score: number | null;
  trend: string;
  momentum: string;
  timestamp: string | null;
};

export type HistogramBucket = {
  start: number;
  end: number;
  count: number;
  percentage: number;
  label: string;
};

export type Distribution = {
  buckets: HistogramBucket[];
  min: number;
  max: number;
  total: number;
};

export type MetricsSummary = {
  totalRuns: number;
  avgScore: number;
  medianCost: number;
  tokensP90: number;
  tokensMedian: number;
  scoreMedian: number;
  scoreP75: number;
  scoreP90: number;
  costP75: number;
  costP90: number;
  durationP95: number;
  errorRate: number;
  acceptRate: number;
  outcomeCounts: {
    accepted: number;
    refine: number;
    rejected: number;
    unknown: number;
  };
  histogram: {
    tokens: Distribution;
    cost: Distribution;
    score: Distribution;
  };
};

export type TimeWindowState =
  | { type: 'all' }
  | { type: 'last7' }
  | { type: 'last30' }
  | { type: 'custom'; customStart: string; customEnd: string };

export type WindowComputation = {
  windowRuns: RunRecord[];
  previousRuns: RunRecord[];
  label: string;
  customValid: boolean;
  totalRuns: number;
};

export type MilestoneThreshold = {
  metric: keyof MetricsSummary;
  direction: 'gte' | 'lte';
  target: number;
  label: string;
  tolerance?: number;
};

export type MilestoneDefinition = {
  id: string;
  title: string;
  description: string;
  thresholds: MilestoneThreshold[];
  nextAction: string;
};

export type MilestoneStatus = 'not_started' | 'at_risk' | 'on_track' | 'achieved';

export type MilestoneEvaluation = {
  id: string;
  title: string;
  status: MilestoneStatus;
  detail: string;
  nextAction: string;
  thresholds: MilestoneThreshold[];
};

export type OutlierSet = {
  topCost: RunRecord[];
  topTokens: RunRecord[];
  lowestScore: RunRecord[];
  weird: RunRecord[];
};
