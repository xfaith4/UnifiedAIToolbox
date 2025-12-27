import { Line, LineChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis, Label } from 'recharts';
import { RunRecord } from '@/lib/milestones/types';

type Props = {
  runs: RunRecord[];
  xAxisMode: 'index' | 'time';
};

const formatCurrency = (value: number) => `$${value.toFixed(3)}`;

export function TrendPanel({ runs, xAxisMode }: Props) {
  const sorted = [...runs].sort((a, b) => {
    if (xAxisMode === 'time') return (a.timestampValue ?? 0) - (b.timestampValue ?? 0);
    return 0;
  });

  const fallbackTimestamp = sorted.find((run) => typeof run.timestampValue === 'number')?.timestampValue ?? 0;
  const data = sorted.map((run, index) => ({
    label:
      xAxisMode === 'time'
        ? new Date(run.timestampValue ?? fallbackTimestamp).toLocaleDateString()
        : `Run ${index + 1}`,
    score: run.score ?? 0,
    cost: run.cost ?? 0,
  }));

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="text-lg font-semibold text-slate-50">Trend: score & cost</h3>
      <p className="text-xs text-slate-400 mb-2">
        Lines share the same x-axis. Costs use the right axis, scores use the left.
      </p>
      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 12, right: 28 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="label" stroke="#94a3b8">
              <Label value={xAxisMode === 'time' ? 'Time' : 'Run order'} position="insideBottom" offset={-6} fill="#cbd5e1" />
            </XAxis>
            <YAxis yAxisId="score" stroke="#38bdf8">
              <Label value="Score (0-10)" position="insideLeft" angle={-90} offset={8} fill="#38bdf8" />
            </YAxis>
            <YAxis yAxisId="cost" orientation="right" stroke="#fbbf24">
              <Label value="Cost ($)" position="insideRight" angle={90} offset={10} fill="#fbbf24" />
            </YAxis>
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0' }}
              formatter={(value: number, key) => (key === 'cost' ? formatCurrency(value) : value.toFixed(2))}
            />
            <Legend />
            <Line yAxisId="score" type="monotone" dataKey="score" stroke="#38bdf8" strokeWidth={2} dot={false} />
            <Line yAxisId="cost" type="monotone" dataKey="cost" stroke="#fbbf24" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default TrendPanel;
