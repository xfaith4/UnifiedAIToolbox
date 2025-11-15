interface Props {
  label: string
  value: string | number
  hint?: string
}

export function KpiCard({ label, value, hint }: Props) {
  return (
    <div className="rounded-2xl bg-slate-900/80 shadow-soft p-4 border border-slate-800/80 backdrop-blur">
      <div className="text-slate-300 text-sm tracking-wide">{label}</div>
      <div className="text-3xl font-semibold mt-1 text-white">{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
    </div>
  )
}
