import { MilestoneEvaluation } from '@/lib/milestones/types';
import { CheckCircle2, Clock3, AlertTriangle, CircleSlash } from 'lucide-react';

type Props = {
  milestones: MilestoneEvaluation[];
};

function statusIcon(status: MilestoneEvaluation['status']) {
  switch (status) {
    case 'achieved':
      return <CheckCircle2 className="text-emerald-400" size={18} />;
    case 'on_track':
      return <Clock3 className="text-amber-300" size={18} />;
    case 'at_risk':
      return <AlertTriangle className="text-rose-400" size={18} />;
    default:
      return <CircleSlash className="text-slate-500" size={18} />;
  }
}

function statusLabel(status: MilestoneEvaluation['status']) {
  if (status === 'achieved') return 'Achieved';
  if (status === 'on_track') return 'On track';
  if (status === 'at_risk') return 'At risk';
  return 'Not started';
}

export function MilestoneProgress({ milestones }: Props) {
  const achieved = milestones.filter((m) => m.status === 'achieved').length;
  const total = milestones.length || 1;
  const percent = Math.round((achieved / total) * 100);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">Milestones achieved</p>
          <p className="text-2xl font-semibold text-slate-50">
            {achieved}/{total} <span className="text-base text-slate-400">({percent}%)</span>
          </p>
        </div>
        <div className="h-3 flex-1 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${percent}%` }}
            aria-label={`Progress ${percent}%`}
          />
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {milestones.map((milestone) => (
          <div key={milestone.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-50">{milestone.title}</p>
                <p className="text-xs text-slate-400">{milestone.detail}</p>
              </div>
              <div className="flex items-center gap-1 text-sm">
                {statusIcon(milestone.status)}
                <span className="text-slate-200">{statusLabel(milestone.status)}</span>
              </div>
            </div>
            <div className="mt-2">
              <p className="text-xs font-semibold text-slate-400">Thresholds</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-slate-300">
                {milestone.thresholds.map((threshold) => (
                  <li key={`${milestone.id}-${threshold.metric}-${threshold.target}`}>
                    {threshold.label}
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-2 text-xs text-amber-200">{milestone.nextAction}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default MilestoneProgress;
