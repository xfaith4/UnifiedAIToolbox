import type { SwarmActivityItem } from '../types'
import { summarizeRunMessage } from '@/lib/runs/runFailureSummary'

type ActivityLogProps = {
  items: SwarmActivityItem[]
}

function tone(item: SwarmActivityItem): string {
  const token = `${item.type} ${item.status || ''} ${item.message}`.toLowerCase()
  if (token.includes('fail') || token.includes('error')) return 'border-rose-800/70 bg-rose-950/40 text-rose-200'
  if (token.includes('warn') || token.includes('block')) return 'border-amber-800/70 bg-amber-950/40 text-amber-200'
  if (token.includes('success') || token.includes('complete') || token.includes('passed')) return 'border-emerald-800/70 bg-emerald-950/40 text-emerald-200'
  return 'border-slate-800 bg-slate-950/50 text-slate-300'
}

export default function ActivityLog({ items }: ActivityLogProps) {
  return (
    <section className="flex h-full flex-col rounded-2xl border border-slate-800 bg-slate-900/55">
      <div className="border-b border-slate-800 px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Activity Log</h2>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
        {items.length === 0 && <div className="text-xs text-slate-500">Waiting for run events...</div>}

        {items.map((item) => (
          <article key={item.id} className={`rounded-lg border px-2.5 py-2 text-xs ${tone(item)}`}>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide opacity-75">
              <span>{new Date(item.ts).toLocaleTimeString()}</span>
              {item.phase && <span>{item.phase}</span>}
              {item.agent && <span>{item.agent}</span>}
              {item.status && <span>{item.status}</span>}
            </div>
            <p className="mt-1 break-words">{summarizeRunMessage(item.message)}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
