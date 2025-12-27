import { RunRecord } from '@/lib/milestones/types';
import { useState } from 'react';

type OutlierGroup = {
  title: string;
  runs: RunRecord[];
  metricLabel: string;
  format: (value: number | null) => string;
  metricKey: keyof RunRecord;
};

type Props = {
  groups: OutlierGroup[];
};

function formatCurrency(value: number | null) {
  if (value === null || value === undefined) return 'n/a';
  return `$${value.toFixed(3)}`;
}

function formatNumber(value: number | null) {
  if (value === null || value === undefined) return 'n/a';
  return value.toLocaleString();
}

export function OutlierTables({ groups }: Props) {
  const [copyStatusByRun, setCopyStatusByRun] = useState<Record<string, string>>({});

  const handleCopyRunPath = async (runId: string, path?: string) => {
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

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {groups.map((group) => (
        <div key={group.title} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-50">{group.title}</h3>
              <p className="text-xs text-slate-400">Surfaced intentionally so we can inspect the tail.</p>
            </div>
          </div>
          <table className="mt-3 w-full text-sm text-slate-200">
            <thead>
              <tr className="border-b border-slate-800 text-left text-xs text-slate-400">
                <th className="py-2">Run</th>
                <th className="py-2">{group.metricLabel}</th>
                <th className="py-2">Copy path</th>
              </tr>
            </thead>
            <tbody>
              {group.runs.length === 0 ? (
                <tr>
                  <td className="py-2 text-slate-500" colSpan={3}>
                    No runs in this bucket.
                  </td>
                </tr>
              ) : (
                group.runs.map((run) => {
                  const metricValue = run[group.metricKey];
                  const runKey = run.runId;
                  return (
                    <tr key={`${group.title}-${runKey}`} className="border-b border-slate-800/60">
                      <td className="py-2">
                        <div className="font-semibold text-slate-50">{run.runId}</div>
                        <div className="text-xs text-slate-400">
                          {run.timestampValue ? new Date(run.timestampValue).toLocaleString() : 'No timestamp'}
                        </div>
                      </td>
                      <td className="py-2 text-slate-100">{group.format(metricValue as number | null)}</td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => handleCopyRunPath(runKey, run.runFolder)}
                          className="rounded-full border border-slate-800 px-3 py-1 text-xs text-sky-300 hover:bg-slate-800"
                        >
                          Copy path
                        </button>
                        <div className="text-[11px] text-slate-500">{copyStatusByRun[runKey]}</div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export function buildOutlierGroups(outliers: {
  topCost: RunRecord[];
  topTokens: RunRecord[];
  lowestScore: RunRecord[];
  weird: RunRecord[];
}): OutlierGroup[] {
  return [
    { title: 'Top cost runs', runs: outliers.topCost, metricLabel: 'Cost ($)', format: formatCurrency, metricKey: 'cost' },
    { title: 'Highest token runs', runs: outliers.topTokens, metricLabel: 'Tokens', format: formatNumber, metricKey: 'tokens' },
    { title: 'Lowest score runs', runs: outliers.lowestScore, metricLabel: 'Score', format: (v) => (v === null ? 'n/a' : v.toFixed(1)), metricKey: 'score' },
    { title: 'Weird runs (z-score)', runs: outliers.weird, metricLabel: 'Tokens', format: formatNumber, metricKey: 'tokens' },
  ];
}

export default OutlierTables;
