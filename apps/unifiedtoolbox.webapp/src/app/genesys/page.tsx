'use client'

import { KpiCard } from '@/components/KpiCard'

export default function GenesysPage() {
  return (
    <main className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Genesys Cloud Dashboard</h1>
        <p className="text-sm text-slate-400">
          Real-time metrics for your Genesys Cloud organization.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Active Queues" value={42} />
        <KpiCard label="Agents On-Queue" value={138} />
        <KpiCard label="Interactions Waiting" value={12} hint="Max wait: 3m 42s" />
        <KpiCard label="Service Level" value="92.7%" hint="Target: 90%" />
      </div>
    </main>
  )
}
