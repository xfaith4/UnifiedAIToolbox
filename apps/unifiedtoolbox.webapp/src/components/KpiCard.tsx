interface Props {
  label: string
  value: string | number
  hint?: string
}

export function KpiCard({ label, value, hint }: Props) {
  return (
    <div className="rounded-2xl bg-slate-900/80 p-4 shadow-lg border border-slate-800/80 backdrop-blur-sm">
      <div className="text-sm tracking-wide text-slate-300">{label}</div>
      <div className="mt-1 text-3xl font-semibold text-white">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  )
}
