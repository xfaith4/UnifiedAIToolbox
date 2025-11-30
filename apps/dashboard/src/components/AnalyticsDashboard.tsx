/**
 * Analytics Dashboard Component (Sprint 4)
 * Displays prompt usage metrics, performance trends, and insights
 */
import React, { useEffect, useState, useMemo } from 'react'
import { getAnalyticsDashboardData } from '../services/analyticsStore'
import type { AnalyticsDashboardData, AnalyticsTimeSeriesPoint } from '../types/analytics'

interface MetricCardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: 'up' | 'down' | 'neutral'
  icon?: string
}

function MetricCard({ title, value, subtitle, trend, icon }: MetricCardProps) {
  const trendColor =
    trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-rose-400' : 'text-neutral-400'
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'

  return (
    <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-neutral-400">{title}</div>
          <div className="text-2xl font-bold mt-1">{value}</div>
          {subtitle && (
            <div className={`text-xs mt-1 flex items-center gap-1 ${trendColor}`}>
              <span>{trendIcon}</span>
              <span>{subtitle}</span>
            </div>
          )}
        </div>
        {icon && <span className="text-2xl">{icon}</span>}
      </div>
    </div>
  )
}

interface SimpleBarChartProps {
  data: { label: string; value: number }[]
  maxValue?: number
  color?: string
}

function SimpleBarChart({ data, maxValue, color = 'bg-emerald-500' }: SimpleBarChartProps) {
  const max = maxValue || Math.max(...data.map((d) => d.value), 1)

  return (
    <div className="space-y-2">
      {data.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <div className="w-24 text-xs text-neutral-400 truncate" title={item.label}>
            {item.label}
          </div>
          <div className="flex-1 h-4 bg-neutral-800 rounded overflow-hidden">
            <div
              className={`h-full ${color} transition-all duration-300`}
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
          <div className="w-12 text-xs text-neutral-400 text-right">{item.value}</div>
        </div>
      ))}
    </div>
  )
}

interface TimeSeriesChartProps {
  data: AnalyticsTimeSeriesPoint[]
  metricKey: 'executionCount' | 'successRate' | 'avgResponseTimeMs' | 'cost'
  title: string
}

function TimeSeriesChart({ data, metricKey, title }: TimeSeriesChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-32 flex items-center justify-center text-neutral-500 text-sm">
        No data available
      </div>
    )
  }

  const values = data.map((d) => d[metricKey])
  const maxValue = Math.max(...values, 1)
  const minValue = Math.min(...values, 0)
  const range = maxValue - minValue || 1

  return (
    <div>
      <div className="text-sm text-neutral-400 mb-2">{title}</div>
      <div className="h-24 flex items-end gap-1">
        {data.slice(-30).map((point, index) => {
          const height = ((point[metricKey] - minValue) / range) * 100
          return (
            <div
              key={index}
              className="flex-1 bg-emerald-500/70 hover:bg-emerald-400 rounded-t transition-colors cursor-pointer"
              style={{ height: `${Math.max(height, 2)}%` }}
              title={`${new Date(point.timestamp).toLocaleDateString()}: ${
                metricKey === 'successRate'
                  ? `${(point[metricKey] * 100).toFixed(1)}%`
                  : metricKey === 'cost'
                    ? `$${point[metricKey].toFixed(4)}`
                    : point[metricKey].toFixed(0)
              }`}
            />
          )
        })}
      </div>
      <div className="flex justify-between text-[10px] text-neutral-500 mt-1">
        <span>{data.length > 0 ? new Date(data[0].timestamp).toLocaleDateString() : ''}</span>
        <span>
          {data.length > 0 ? new Date(data[data.length - 1].timestamp).toLocaleDateString() : ''}
        </span>
      </div>
    </div>
  )
}

export default function AnalyticsDashboard() {
  const [periodDays, setPeriodDays] = useState(30)
  const [dashboardData, setDashboardData] = useState<AnalyticsDashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)
    // Simulate async loading
    setTimeout(() => {
      const data = getAnalyticsDashboardData(periodDays)
      setDashboardData(data)
      setIsLoading(false)
    }, 100)
  }, [periodDays])

  const topPromptsData = useMemo(() => {
    if (!dashboardData) return []
    return dashboardData.summary.topPrompts.slice(0, 5).map((p) => ({
      label: p.promptTitle.slice(0, 20),
      value: p.executionCount,
    }))
  }, [dashboardData])

  const providerData = useMemo(() => {
    if (!dashboardData) return []
    return dashboardData.byProvider.map((p) => ({
      label: p.provider,
      value: p.executionCount,
    }))
  }, [dashboardData])

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-neutral-800 rounded w-1/3"></div>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-neutral-800 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!dashboardData) {
    return (
      <div className="p-6 text-center text-neutral-500">
        <span className="text-4xl mb-4 block">📊</span>
        <p>No analytics data available yet.</p>
        <p className="text-sm mt-2">
          Start using prompts to generate analytics insights.
        </p>
      </div>
    )
  }

  const { summary, timeSeries, byModel } = dashboardData

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span>📊</span> Prompt Analytics
          </h2>
          <p className="text-sm text-neutral-400 mt-1">
            Track usage, performance, and insights across your prompts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="px-3 py-1.5 rounded bg-neutral-900 border border-neutral-800 text-sm"
            value={periodDays}
            onChange={(e) => setPeriodDays(Number(e.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total Executions"
          value={summary.totalExecutions.toLocaleString()}
          subtitle="prompts run"
          icon="🚀"
        />
        <MetricCard
          title="Success Rate"
          value={`${(summary.successRate * 100).toFixed(1)}%`}
          trend={summary.successRate >= 0.95 ? 'up' : summary.successRate < 0.8 ? 'down' : 'neutral'}
          subtitle={summary.successRate >= 0.95 ? 'Excellent' : 'Needs attention'}
          icon="✅"
        />
        <MetricCard
          title="Avg Response Time"
          value={`${summary.avgResponseTime.toFixed(0)}ms`}
          trend={summary.avgResponseTime < 2000 ? 'up' : 'down'}
          subtitle={summary.avgResponseTime < 2000 ? 'Fast' : 'Slow'}
          icon="⚡"
        />
        <MetricCard
          title="Total Cost"
          value={`$${summary.totalCost.toFixed(2)}`}
          subtitle={`${summary.uniquePromptsUsed} unique prompts`}
          icon="💰"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Time Series Chart */}
        <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950">
          <TimeSeriesChart
            data={timeSeries}
            metricKey="executionCount"
            title="Executions Over Time"
          />
        </div>

        {/* Success Rate Chart */}
        <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950">
          <TimeSeriesChart
            data={timeSeries}
            metricKey="successRate"
            title="Success Rate Trend"
          />
        </div>
      </div>

      {/* Breakdowns Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Prompts */}
        <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <span>📝</span> Top Prompts
            </h3>
            <span className="text-xs text-neutral-500">by execution count</span>
          </div>
          {topPromptsData.length > 0 ? (
            <SimpleBarChart data={topPromptsData} />
          ) : (
            <div className="text-sm text-neutral-500 text-center py-8">
              No prompt usage data yet
            </div>
          )}
        </div>

        {/* By Provider */}
        <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold flex items-center gap-2">
              <span>🔌</span> By Provider
            </h3>
            <span className="text-xs text-neutral-500">usage distribution</span>
          </div>
          {providerData.length > 0 ? (
            <SimpleBarChart data={providerData} color="bg-blue-500" />
          ) : (
            <div className="text-sm text-neutral-500 text-center py-8">
              No provider data yet
            </div>
          )}
        </div>
      </div>

      {/* Cost Analysis */}
      <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-950">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <span>💰</span> Cost Analysis by Model
          </h3>
        </div>
        {byModel.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-400 border-b border-neutral-800">
                  <th className="pb-2">Model</th>
                  <th className="pb-2">Provider</th>
                  <th className="pb-2 text-right">Executions</th>
                  <th className="pb-2 text-right">Avg Tokens</th>
                  <th className="pb-2 text-right">Avg Time (ms)</th>
                  <th className="pb-2 text-right">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {byModel.map((model, index) => (
                  <tr key={index} className="border-b border-neutral-800/50">
                    <td className="py-2 font-medium">{model.model}</td>
                    <td className="py-2 text-neutral-400">{model.provider}</td>
                    <td className="py-2 text-right">{model.executionCount}</td>
                    <td className="py-2 text-right">{model.avgTokensPerRequest.toFixed(0)}</td>
                    <td className="py-2 text-right">{model.avgResponseTime.toFixed(0)}</td>
                    <td className="py-2 text-right">${model.totalCost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-neutral-500 text-center py-8">
            No model usage data yet
          </div>
        )}
      </div>

      {/* Insights Panel */}
      <div className="p-4 rounded-xl border border-blue-900/50 bg-blue-950/20">
        <h3 className="font-semibold flex items-center gap-2 mb-3">
          <span>💡</span> Insights & Recommendations
        </h3>
        <div className="space-y-2 text-sm">
          {summary.totalExecutions === 0 && (
            <div className="flex items-start gap-2">
              <span>📊</span>
              <span>Start using prompts to generate analytics data and insights.</span>
            </div>
          )}
          {summary.successRate < 0.9 && summary.totalExecutions > 0 && (
            <div className="flex items-start gap-2">
              <span>⚠️</span>
              <span>
                Success rate is below 90%. Consider reviewing failing prompts for improvements.
              </span>
            </div>
          )}
          {summary.avgResponseTime > 3000 && (
            <div className="flex items-start gap-2">
              <span>🐌</span>
              <span>
                Average response time is high. Consider using faster models or optimizing prompt
                length.
              </span>
            </div>
          )}
          {summary.totalCost > 10 && (
            <div className="flex items-start gap-2">
              <span>💵</span>
              <span>
                Consider using GPT-4o-mini for non-critical prompts to reduce costs.
              </span>
            </div>
          )}
          {summary.uniquePromptsUsed > 0 && summary.successRate >= 0.95 && (
            <div className="flex items-start gap-2">
              <span>✨</span>
              <span>
                Great performance! Your prompts are running smoothly with high success rates.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
