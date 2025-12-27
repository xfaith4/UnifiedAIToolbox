import { MetricsSummary } from '@/lib/milestones/types';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';

type Delta = number | null;

type Props = {
  metrics: MetricsSummary;
  deltas: {
    avgScore: Delta;
    medianCost: Delta;
    tokensP90: Delta;
    acceptRate: Delta;
  };
};

function DeltaBadge({ delta, format }: { delta: Delta; format: (value: number) => string }) {
  if (delta === null) return <span className="inline-flex items-center text-slate-400 text-sm gap-1"><Minus size={14} /> n/a</span>;
  const Icon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  const tone =
    delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-slate-300';
  return (
    <span className={`inline-flex items-center gap-1 text-sm ${tone}`}>
      <Icon size={14} />
      {format(delta)}
    </span>
  );
}

export function KpiBoard({ metrics, deltas }: Props) {
  const cards = [
    {
      title: 'Avg quality score',
      value: metrics.avgScore.toFixed(1),
      delta: deltas.avgScore,
      format: (value: number) => value.toFixed(1),
      help: 'Commissioner score, 0-10 scale.',
    },
    {
      title: 'Median cost',
      value: `$${metrics.medianCost.toFixed(3)}`,
      delta: deltas.medianCost,
      format: (value: number) => `$${value.toFixed(3)}`,
      help: 'Dollars per run.',
    },
    {
      title: 'p90 tokens',
      value: metrics.tokensP90 ? metrics.tokensP90.toLocaleString() : '0',
      delta: deltas.tokensP90,
      format: (value: number) => value.toLocaleString(),
      help: 'Token discipline high watermark.',
    },
    {
      title: 'Acceptance rate',
      value: `${(metrics.acceptRate * 100).toFixed(1)}%`,
      delta: deltas.acceptRate,
      format: (value: number) => `${(value * 100).toFixed(1)}%`,
      help: 'Accepted / total for the window.',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <div key={card.title} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-400">{card.title}</p>
              <p className="text-2xl font-semibold text-slate-50">{card.value}</p>
            </div>
            <DeltaBadge delta={card.delta} format={card.format} />
          </div>
          <p className="mt-2 text-xs text-slate-500">{card.help}</p>
        </div>
      ))}
    </div>
  );
}

export default KpiBoard;
