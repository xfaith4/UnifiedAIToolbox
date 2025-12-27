import { RunRecord } from '@/lib/milestones/types';

type Props = {
  runs: RunRecord[];
};

const formatCurrency = (value: number | null) => (value === null || value === undefined ? 'n/a' : `$${value.toFixed(3)}`);
const formatDuration = (ms: number | null) => {
  if (ms === null || ms === undefined) return 'n/a';
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes && remaining) return `${minutes}m ${remaining}s`;
  if (minutes) return `${minutes}m`;
  return `${remaining}s`;
};

export function RunTable({ runs }: Props) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-50">Run history</h3>
        <p className="text-xs text-slate-400">{runs.length} runs in view</p>
      </div>
      <div className="overflow-x-auto">
        <table className="mt-3 min-w-full text-sm text-slate-200">
          <thead>
            <tr className="border-b border-slate-800 text-left text-xs text-slate-400">
              <th className="py-2">Timestamp</th>
              <th className="py-2">Score</th>
              <th className="py-2">Cost</th>
              <th className="py-2">Tokens</th>
              <th className="py-2">Duration</th>
              <th className="py-2">Outcome</th>
              <th className="py-2">Run path</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-3 text-slate-500">
                  No runs available yet.
                </td>
              </tr>
            ) : (
              runs.map((run) => (
                <tr key={run.runId} className="border-b border-slate-800/60">
                  <td className="py-2">
                    {run.timestampValue ? new Date(run.timestampValue).toLocaleString() : run.timestamp || 'n/a'}
                  </td>
                  <td className="py-2">{run.score ?? 'n/a'}</td>
                  <td className="py-2">{formatCurrency(run.cost)}</td>
                  <td className="py-2">{run.tokens?.toLocaleString() ?? 'n/a'}</td>
                  <td className="py-2">{formatDuration(run.durationMs)}</td>
                  <td className="py-2 capitalize">{run.outcome}</td>
                  <td className="py-2 text-xs text-slate-400 break-all">{run.runFolder || 'n/a'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default RunTable;
