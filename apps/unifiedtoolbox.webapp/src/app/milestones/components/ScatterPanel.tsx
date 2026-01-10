import { CartesianGrid, Label, Legend, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { RunRecord } from '@/lib/milestones/types';
import { calculatePercentile } from '@/lib/milestones/metrics';

type Props = {
  runs: RunRecord[];
};

export function ScatterPanel({ runs }: Props) {
  const data = runs
    .filter((run) => run.tokens !== null && run.tokens !== undefined && run.score !== null && run.score !== undefined)
    .map((run) => ({
      tokens: run.tokens ?? 0,
      score: run.score ?? 0,
      label: run.runId,
    }));

  const tokensMedian = calculatePercentile(data.map((d) => d.tokens), 50);
  const scoreMedian = calculatePercentile(data.map((d) => d.score), 50);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="text-lg font-semibold text-slate-50">Score vs tokens</h3>
      <p className="text-xs text-slate-400 mb-2">
        Each dot is a run. Quadrants show where tokens are high/low for the achieved score.
      </p>
      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="tokens" stroke="#94a3b8" type="number" tickFormatter={(v) => v.toLocaleString()}>
              <Label value="Tokens" position="insideBottom" offset={-6} fill="#cbd5e1" />
            </XAxis>
            <YAxis dataKey="score" stroke="#94a3b8" type="number" domain={[0, 10]}>
              <Label value="Score (0-10)" position="insideLeft" angle={-90} offset={8} fill="#cbd5e1" />
            </YAxis>
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0' }}
              formatter={(value: number, key: string) =>
                key === 'tokens' ? [value.toLocaleString(), 'Tokens'] : [value.toFixed(2), 'Score']
              }
              labelFormatter={(_, payload: Array<{ payload?: { label?: string } }>) => payload?.[0]?.payload?.label}
            />
            <Legend />
            <ReferenceLine x={tokensMedian} stroke="#fbbf24" strokeDasharray="3 3" label={{ value: 'Median tokens', fill: '#fbbf24' }} />
            <ReferenceLine y={scoreMedian} stroke="#22c55e" strokeDasharray="3 3" label={{ value: 'Median score', fill: '#22c55e' }} />
            <Scatter data={data} fill="#38bdf8" name="Runs" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default ScatterPanel;
