'use client'

import { useEffect, useState } from 'react'
import { KpiCard } from '@/components/KpiCard'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { type DashboardTelemetry } from '@/lib/services/telemetryService'

// Color palette for charts (currently colors are defined inline in each chart)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4']

/**
 * Categorize agent roles into high-level groups for better visualization
 * This helps reduce overlap and provides actionable insights into agent distribution
 */
function categorizeAgentRole(roleName: string): string {
  const role = roleName.toLowerCase()
  
  // Engineering roles - code production, performance, and mentorship
  if (role.includes('code') || role.includes('engineer') || role.includes('coach') || 
      role.includes('integration') || role.includes('artifact')) {
    return 'Engineering'
  }
  
  // Design & UX roles - visual, interaction, and accessibility
  if (role.includes('design') || role.includes('ux') || role.includes('ui') || 
      role.includes('visual') || role.includes('accessibility') || role.includes('experience') ||
      role.includes('navigation') || role.includes('interaction')) {
    return 'Design & UX'
  }
  
  // Review & Quality roles - criticism, security, quality assessment
  if (role.includes('review') || role.includes('critic') || role.includes('security') ||
      role.includes('quality') || role.includes('supervisor') || role.includes('defect') ||
      role.includes('risk')) {
    return 'Review & Quality'
  }
  
  // Research & Strategy roles - data gathering, planning, content strategy
  if (role.includes('research') || role.includes('strategy') || role.includes('strategist') ||
      role.includes('content') || role.includes('rollout') || role.includes('gather')) {
    return 'Research & Strategy'
  }
  
  // Synthesis roles - merging, assessment, decision-making
  if (role.includes('synth') || role.includes('merge') || role.includes('assess') ||
      role.includes('commissioner') || role.includes('consolidate')) {
    return 'Synthesis & Assessment'
  }
  
  // Default category for specialized or unique roles
  return 'Specialized'
}

export default function DashboardPage() {
  const [telemetry, setTelemetry] = useState<DashboardTelemetry | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadTelemetry() {
      try {
        const response = await fetch('/api/telemetry?timeWindow=7d')
        if (!response.ok) {
          throw new Error('Failed to fetch telemetry')
        }
        const data = await response.json()
        setTelemetry(data)
      } catch (error) {
        console.error('Failed to load telemetry:', error)
      } finally {
        setLoading(false)
      }
    }

    loadTelemetry()
    // Refresh every minute
    const interval = setInterval(loadTelemetry, 60000)
    return () => clearInterval(interval)
  }, [])

  if (loading || !telemetry) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-slate-400">Loading telemetry data...</div>
      </div>
    )
  }

  const { promptLibrary, agentLibrary, orchestrationCost, refinementMetrics } = telemetry

  // Prepare chart data
  const promptCategoryData = Object.entries(promptLibrary.byCategory).map(([name, value]) => ({
    name,
    value,
  }))

  const promptQualityData = [
    { name: 'Experimental', value: promptLibrary.byQuality.experimental, color: '#f59e0b' },
    { name: 'Validated', value: promptLibrary.byQuality.validated, color: '#3b82f6' },
    { name: 'Production', value: promptLibrary.byQuality.production, color: '#10b981' },
  ]

  // Group agents by categorized roles for better visualization
  const categorizedRoles: Record<string, number> = {}
  Object.entries(agentLibrary.byRole).forEach(([roleName, count]) => {
    const category = categorizeAgentRole(roleName)
    categorizedRoles[category] = (categorizedRoles[category] || 0) + count
  })
  
  const agentRoleData = Object.entries(categorizedRoles)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  const modelBreakdownData = Object.entries(orchestrationCost.byModel).map(([name, data]) => ({
    name,
    tokens: data.tokens,
    cost: data.cost,
    runs: data.runs,
  }))

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold">Home</h1>
        <p className="text-sm text-slate-400 mt-1">
          Real-time metrics for your AI orchestration platform
        </p>
      </div>

      {/* Section 1: Prompt Library Health */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Prompt Library Health</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Total Prompts" value={promptLibrary.totalPrompts} />
          <KpiCard
            label="Validated"
            value={promptLibrary.byQuality.validated}
            hint={`${Math.round(promptLibrary.byQuality.validated / promptLibrary.totalPrompts * 100)}%`}
          />
          <KpiCard
            label="Production Ready"
            value={promptLibrary.byQuality.production}
            hint={`${Math.round(promptLibrary.byQuality.production / promptLibrary.totalPrompts * 100)}%`}
          />
          <KpiCard
            label="Coverage"
            value={`${promptLibrary.coverage.percentWithDocs}%`}
            hint="With documentation"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Prompts by Category */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg">
            <div className="mb-3 font-semibold">Prompts by Category</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={promptCategoryData}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                  />
                  <Bar dataKey="value" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Quality Distribution */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg">
            <div className="mb-3 font-semibold">Quality Distribution</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={promptQualityData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {promptQualityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Agent Library Health */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Agent Library Health</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard label="Total Agents" value={agentLibrary.totalAgents} />
          <KpiCard label="Active (7d)" value={agentLibrary.activeAgents7d} />
          <KpiCard
            label="Avg Agents/Run"
            value={agentLibrary.avgAgentsPerRun.toFixed(1)}
            hint="Per orchestration"
          />
          <KpiCard
            label="Avg Tokens/Call"
            value={agentLibrary.avgTokensPerCall.toLocaleString()}
          />
          <KpiCard
            label="Avg Quality"
            value={agentLibrary.avgQualityScore.toFixed(1)}
            hint="Out of 10"
          />
        </div>

        {/* Agent Usage Table */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg overflow-x-auto">
          <div className="mb-3 font-semibold">Agent Usage (Last 7 Days)</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-2 px-3">Agent</th>
                <th className="text-left py-2 px-3">Role</th>
                <th className="text-right py-2 px-3">Calls</th>
                <th className="text-right py-2 px-3">Avg Tokens</th>
                <th className="text-right py-2 px-3">Avg Score</th>
                <th className="text-left py-2 px-3">Last Used</th>
              </tr>
            </thead>
            <tbody>
              {agentLibrary.usage.map((agent) => (
                <tr key={agent.agentId} className="border-b border-slate-800 hover:bg-slate-800/50">
                  <td className="py-2 px-3">{agent.name}</td>
                  <td className="py-2 px-3">
                    <span className="px-2 py-1 rounded-md bg-slate-800 text-xs">
                      {agent.role}
                    </span>
                  </td>
                  <td className="text-right py-2 px-3">{agent.calls7d}</td>
                  <td className="text-right py-2 px-3">{agent.avgTokens.toLocaleString()}</td>
                  <td className="text-right py-2 px-3">
                    <span className={agent.avgScore >= 8 ? 'text-green-400' : 'text-yellow-400'}>
                      {agent.avgScore.toFixed(1)}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-slate-400 text-xs">
                    {new Date(agent.lastUsed).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Agent Distribution by Role */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg">
          <div className="mb-1 font-semibold">Agent Distribution by Role</div>
          <div className="mb-3 text-xs text-slate-400">Agents grouped by functional categories for clarity</div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agentRoleData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                <XAxis type="number" stroke="#94a3b8" fontSize={12} />
                <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={12} width={150} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                />
                <Bar dataKey="value" fill="#8b5cf6" name="Count" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Section 3: Orchestration Cost & Impact */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Orchestration Cost & Impact (Last 7 Days)</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard
            label="Total Tokens"
            value={orchestrationCost.totalTokens.toLocaleString()}
          />
          <KpiCard
            label="Total Cost"
            value={`$${orchestrationCost.totalCostUSD.toFixed(2)}`}
          />
          <KpiCard
            label="Avg Cost/Run"
            value={`$${orchestrationCost.avgCostPerRun.toFixed(3)}`}
            hint={`${orchestrationCost.totalRuns} runs`}
          />
          <KpiCard
            label="CO₂e Impact"
            value={`${orchestrationCost.sustainability.gCO2e}g`}
            hint={`${orchestrationCost.sustainability.energyKWh.toFixed(3)} kWh`}
          />
          <KpiCard
            label="Water Usage"
            value={`${orchestrationCost.sustainability.waterLiters.toFixed(2)}L`}
            hint="Est. for cooling"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Cost Trend */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg">
            <div className="mb-3 font-semibold">Cost Trend</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={orchestrationCost.trend}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                  />
                  <Line type="monotone" dataKey="cost" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Model Breakdown */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg">
            <div className="mb-3 font-semibold">Usage by Model</div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={modelBreakdownData}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                  />
                  <Legend />
                  <Bar dataKey="tokens" fill="#3b82f6" name="Tokens" />
                  <Bar dataKey="runs" fill="#8b5cf6" name="Runs" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Refinement & Effectiveness */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Refinement & Effectiveness</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Avg Iterations"
            value={refinementMetrics.avgIterations.toFixed(1)}
            hint={`p90: ${refinementMetrics.distributionPercentiles.p90Iterations}`}
          />
          <KpiCard
            label="Score Improvement"
            value={`+${refinementMetrics.avgScoreImprovement.toFixed(1)}`}
            hint="Per iteration"
          />
          <KpiCard
            label="Success Rate"
            value={`${refinementMetrics.successRate.toFixed(1)}%`}
            hint={`${refinementMetrics.successfulRuns}/${refinementMetrics.totalRuns} runs`}
          />
          <KpiCard
            label="Avg Time"
            value={`${Math.floor(refinementMetrics.avgTimeToCompletion / 60)}m ${refinementMetrics.avgTimeToCompletion % 60}s`}
            hint="To completion"
          />
        </div>

        {/* Refinement Funnel */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 shadow-lg">
          <div className="mb-3 font-semibold">Run Outcomes</div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-4 rounded-lg bg-slate-800/50">
              <div className="text-3xl font-bold text-blue-400">{refinementMetrics.totalRuns}</div>
              <div className="text-sm text-slate-400 mt-1">Total Runs</div>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/50">
              <div className="text-3xl font-bold text-green-400">{refinementMetrics.successfulRuns}</div>
              <div className="text-sm text-slate-400 mt-1">Successful</div>
            </div>
            <div className="p-4 rounded-lg bg-slate-800/50">
              <div className="text-3xl font-bold text-red-400">{refinementMetrics.failedRuns}</div>
              <div className="text-sm text-slate-400 mt-1">Failed</div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <div className="text-xs text-slate-500 text-center py-4">
        Last refreshed: {new Date(telemetry.lastRefreshed).toLocaleString()}
      </div>
    </div>
  )
}
