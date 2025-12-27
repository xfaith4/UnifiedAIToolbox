import { GoalInfo } from './types';
import { safeNumber, readField } from './metrics';

export function normalizeGoal(raw: Record<string, unknown> | null | undefined): GoalInfo {
  const source: Record<string, unknown> = raw ?? {};
  const goalField = readField(source, ['goal', 'Goal']);
  const goalText = typeof goalField === 'string' && goalField.trim().length ? goalField : 'Goal not captured yet';

  const successCriteriaRaw = readField(source, ['successCriteria', 'SuccessCriteria']);
  const successCriteria = Array.isArray(successCriteriaRaw)
    ? successCriteriaRaw
    : typeof successCriteriaRaw === 'string'
    ? successCriteriaRaw.split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean)
    : [];

  const objectiveField = readField(source, ['objective', 'Objective']);
  const trendField = readField(source, ['trend', 'Trend']);
  const momentumField = readField(source, ['momentum', 'Momentum']);
  const timestampField = readField(source, ['timestamp', 'Timestamp']);

  return {
    goal: goalText as string,
    objective: typeof objectiveField === 'string' ? objectiveField : '',
    successCriteria,
    score: safeNumber(readField(source, ['score', 'Score'])),
    trend: typeof trendField === 'string' ? trendField : '↔',
    momentum: typeof momentumField === 'string' ? momentumField : 'Stable',
    timestamp: typeof timestampField === 'string' ? timestampField : null,
  };
}
