export type DiffStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface NormalizedAgent {
  name?: string;
  role?: string;
  model?: string;
  order?: number;
}

export interface NormalizedStep {
  t?: string;
  timestamp?: string;
  agent?: string;
  type?: string;
  label?: string;
  tokens?: number | string;
  cost?: number | string;
  status?: string;
  artifactPaths?: string[];
}

export interface NormalizedEvaluation {
  outcome?: string;
  score?: number | string;
  rubric?: string[] | string;
  successCriteria?: string[] | string;
  [key: string]: any;
}

export interface NormalizedFeedback {
  rating?: number | string | null;
  thumbs?: string | null;
  tags?: string[];
  note?: string;
  createdAt?: string;
}

export interface NormalizedRunEntry {
  runId?: string;
  runFolder?: string;
  timestamp?: string;
  timestampStart?: string | null;
  timestampEnd?: string | null;
  durationMs?: number | null;
  message?: string;
  goal?: string;
  outcome?: string;
  score?: number | string | null;
  tokens?: number | string;
  cost?: number | string;
  goalPromptOriginal?: string;
  goalPromptEffective?: string;
  agentsUsed?: NormalizedAgent[];
  steps?: NormalizedStep[];
  evaluation?: NormalizedEvaluation;
  feedback?: NormalizedFeedback;
  tags?: string[];
  derivedTags?: string[];
  artifacts?: string[];
}

export interface ListDiffItem<T> {
  key: string;
  status: DiffStatus;
  left?: T;
  right?: T;
  changes?: string[];
}

export interface TextDiffLine {
  type: DiffStatus;
  text: string;
}

export interface CompareSelection {
  runAKey?: string;
  runBKey?: string;
}

export function normalizeRunForCompare(entry: NormalizedRunEntry): NormalizedRunEntry {
  const evaluation = entry.evaluation ?? {};
  const normalizedCriteria = Array.isArray(evaluation.successCriteria)
    ? evaluation.successCriteria
    : typeof evaluation.successCriteria === 'string'
      ? [evaluation.successCriteria]
      : [];
  const normalizedRubric = Array.isArray(evaluation.rubric)
    ? evaluation.rubric
    : typeof evaluation.rubric === 'string'
      ? [evaluation.rubric]
      : [];
  const normalizedFeedback = entry.feedback ?? {};
  const mergedArtifacts = [
    ...(entry.artifacts ?? []),
    ...((entry.steps ?? []).flatMap((step) => step.artifactPaths ?? [])),
  ];

  return {
    ...entry,
    agentsUsed: Array.isArray(entry.agentsUsed) ? entry.agentsUsed : [],
    steps: Array.isArray(entry.steps) ? entry.steps : [],
    evaluation: {
      ...evaluation,
      successCriteria: normalizedCriteria,
      rubric: normalizedRubric,
    },
    feedback: {
      rating: normalizedFeedback.rating ?? null,
      thumbs: normalizedFeedback.thumbs ?? null,
      tags: Array.isArray(normalizedFeedback.tags) ? normalizedFeedback.tags.filter(Boolean) : [],
      note: normalizedFeedback.note ?? '',
      createdAt: normalizedFeedback.createdAt,
    },
    artifacts: Array.from(new Set(mergedArtifacts)),
  };
}

function buildListDiff<T>(
  leftList: T[] = [],
  rightList: T[] = [],
  keyFn: (item: T, index: number) => string,
  detectChanges?: (left: T, right: T) => string[],
): ListDiffItem<T>[] {
  const leftMap = new Map<string, T>();
  leftList.forEach((item, index) => {
    leftMap.set(keyFn(item, index), item);
  });

  const rightMap = new Map<string, T>();
  rightList.forEach((item, index) => {
    rightMap.set(keyFn(item, index), item);
  });

  const combinedKeys = Array.from(new Set([...leftMap.keys(), ...rightMap.keys()]));
  return combinedKeys.map((key) => {
    const left = leftMap.get(key);
    const right = rightMap.get(key);
    if (left && right) {
      const changes = detectChanges ? detectChanges(left, right) : [];
      return {
        key,
        status: changes.length ? 'changed' : 'unchanged',
        left,
        right,
        ...(changes.length ? { changes } : {}),
      };
    }
    if (left) {
      return { key, status: 'removed', left };
    }
    return { key, status: 'added', right };
  });
}

export function diffText(a = '', b = ''): TextDiffLine[] {
  const leftLines = (a ?? '').split(/\r?\n/);
  const rightLines = (b ?? '').split(/\r?\n/);
  const maxLen = Math.max(leftLines.length, rightLines.length);
  const diff: TextDiffLine[] = [];
  for (let index = 0; index < maxLen; index += 1) {
    const left = leftLines[index] ?? '';
    const right = rightLines[index] ?? '';
    if (left === right) {
      diff.push({ type: 'unchanged', text: left });
      continue;
    }
    if (left) {
      diff.push({ type: 'removed', text: left });
    }
    if (right) {
      diff.push({ type: 'added', text: right });
    }
  }
  return diff;
}

export function diffAgents(left: NormalizedAgent[] = [], right: NormalizedAgent[] = []): ListDiffItem<NormalizedAgent>[] {
  const buildKey = (agent: NormalizedAgent, index: number) => `${agent.order ?? index}-${agent.name ?? 'agent'}-${agent.role ?? 'role'}`;
  const detectChanges = (a: NormalizedAgent, b: NormalizedAgent) => {
    const changes: string[] = [];
    if ((a.name ?? '') !== (b.name ?? '')) changes.push('name');
    if ((a.role ?? '') !== (b.role ?? '')) changes.push('role');
    if ((a.model ?? '') !== (b.model ?? '')) changes.push('model');
    return changes;
  };
  return buildListDiff(left, right, buildKey, detectChanges);
}

export function diffSteps(left: NormalizedStep[] = [], right: NormalizedStep[] = []): ListDiffItem<NormalizedStep>[] {
  const buildKey = (step: NormalizedStep, index: number) => `${step.label ?? 'step'}-${step.agent ?? 'agent'}-${step.type ?? 'type'}-${index}`;
  const detectChanges = (a: NormalizedStep, b: NormalizedStep) => {
    const changes: string[] = [];
    if ((a.tokens ?? '') !== (b.tokens ?? '')) changes.push('tokens');
    if ((a.cost ?? '') !== (b.cost ?? '')) changes.push('cost');
    if ((a.status ?? '') !== (b.status ?? '')) changes.push('status');
    return changes;
  };
  return buildListDiff(left, right, buildKey, detectChanges);
}

export function diffCriteria(left: string[] = [], right: string[] = []): ListDiffItem<string>[] {
  const normalize = (value: string) => value?.toString().trim() ?? '';
  const leftList = left.map((item) => normalize(item)).filter(Boolean);
  const rightList = right.map((item) => normalize(item)).filter(Boolean);
  const buildKey = (value: string, index: number) => `${value}-${index}`;
  return buildListDiff(leftList, rightList, buildKey);
}

export function diffArtifacts(left: string[] = [], right: string[] = []): ListDiffItem<string>[] {
  const normalize = (value: string) => value?.toString().trim() ?? '';
  const leftList = left.map((item) => normalize(item)).filter(Boolean);
  const rightList = right.map((item) => normalize(item)).filter(Boolean);
  const buildKey = (value: string, index: number) => `${value}-${index}`;
  return buildListDiff(leftList, rightList, buildKey);
}
