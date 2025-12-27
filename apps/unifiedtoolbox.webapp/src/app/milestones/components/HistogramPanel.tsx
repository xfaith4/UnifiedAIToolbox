import { Bar, BarChart, CartesianGrid, Label, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Distribution } from '@/lib/milestones/types';

type Props = {
  title: string;
  distribution: Distribution;
  median?: number;
  p90?: number;
  xLabel: string;
  yLabel?: string;
  color?: string;
  formatTick?: (value: number) => string;
};

const defaultFormatter = (value: number) => value.toLocaleString();

export function HistogramPanel({
  title,
  distribution,
  median,
  p90,
  xLabel,
  yLabel = 'Run count',
  color = '#38bdf8',
  formatTick = defaultFormatter,
}: Props) {
  const data = distribution.buckets.map((bucket) => ({
    name: bucket.label,
    count: bucket.count,
  }));
  const medianLabel = typeof median === 'number'
    ? distribution.buckets.find((bucket) => median >= bucket.start && median <= bucket.end)?.label
    : undefined;
  const p90Label = typeof p90 === 'number'
    ? distribution.buckets.find((bucket) => p90 >= bucket.start && p90 <= bucket.end)?.label
    : undefined;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <h3 className="text-lg font-semibold text-slate-50">{title}</h3>
      <p className="text-xs text-slate-400 mb-2">
        Distribution with median and p90 markers. Empty bins mean no data collected.
      </p>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ left: 12, right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="name" tickFormatter={formatTick} interval="preserveStartEnd" stroke="#94a3b8">
              <Label value={xLabel} position="insideBottom" offset={-6} fill="#cbd5e1" />
            </XAxis>
            <YAxis stroke="#94a3b8">
              <Label value={yLabel} position="insideLeft" angle={-90} offset={8} fill="#cbd5e1" />
            </YAxis>
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', color: '#e2e8f0' }}
              formatter={(value: number) => [value, 'Runs']}
            />
            <Bar dataKey="count" fill={color} radius={[6, 6, 0, 0]} />
            {medianLabel ? (
              <ReferenceLine
                x={medianLabel}
                stroke="#fbbf24"
                strokeDasharray="3 3"
                label={{ value: 'Median', fill: '#fbbf24', position: 'top' }}
              />
            ) : null}
            {p90Label ? (
              <ReferenceLine
                x={p90Label}
                stroke="#22c55e"
                strokeDasharray="3 3"
                label={{ value: 'p90', fill: '#22c55e', position: 'top' }}
              />
            ) : null}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default HistogramPanel;
