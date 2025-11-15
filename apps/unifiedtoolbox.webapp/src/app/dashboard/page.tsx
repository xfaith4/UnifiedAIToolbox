'use client'

import { useMemo } from 'react'
import { KpiCard } from '@/components/KpiCard'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

const demoData = [
  { name: 'Mon', value: 120 },
  { name: 'Tue', value: 98 },
  { name: 'Wed', value: 150 },
  { name: 'Thu', value: 80 },
  { name: 'Fri', value: 170 },
  { name: 'Sat', value: 110 },
  { name: 'Sun', value: 140 },
]

export default function DashboardPage() {
  const chartData = useMemo(() => demoData, [])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Conversations" value={128_442} hint="+4.1% WoW" />
        <KpiCard label="WebRTC 480 Disconnects" value={322} hint="-12.7% WoW" />
        <KpiCard label="Avg MOS (Agent Leg)" value={3.82} hint=">= 3.5 is OK" />
        <KpiCard label="Queues at Risk" value={7} hint="Abandon > 5%" />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg">
        <div className="mb-3 font-semibold">Weekly Volume</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
              <YAxis stroke="#94a3b8" fontSize={12} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }} />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
