/**
 * Quality Metrics Component
 * Displays outcome and quality tracking for AI orchestration runs
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';
import { CheckCircle, XCircle, AlertTriangle, TrendingUp, Target, DollarSign } from 'lucide-react';

interface QualitySummary {
  total_runs: number;
  successful_runs: number;
  success_rate: number;
  avg_quality_score: number | null;
  runs_needing_manual_fix: number;
  avg_time_to_result_ms: number | null;
  by_strategy: Array<{
    strategy: string;
    total_runs: number;
    successful_runs: number;
    success_rate: number;
    avg_quality_score: number | null;
    runs_needing_manual_fix: number;
  }>;
  by_model: Array<{
    model: string;
    total_runs: number;
    successful_runs: number;
    success_rate: number;
    avg_quality_score: number | null;
  }>;
}

interface CostQualityEfficiency {
  total_cost_usd: number;
  total_runs: number;
  successful_runs: number;
  high_quality_runs: number;
  quality_threshold: number;
  cost_per_run: number | null;
  cost_per_successful_run: number | null;
  cost_per_high_quality_run: number | null;
  quality_adjusted_cost_index: number | null;
  avg_quality_score: number | null;
}

interface RunWithQuality {
  run_id: string;
  run_goal: string | null;
  strategy: string | null;
  success: boolean | null;
  quality_score: number | null;
  needs_manual_fix: boolean | null;
  total_cost_usd: number;
  cost_efficiency: number | null;
  created_at: string;
}

interface QualityMetricsProps {
  apiBaseUrl?: string;
  adminToken?: string;
}

const COLORS = {
  success: '#10b981',
  failed: '#ef4444',
  warning: '#f59e0b',
  primary: '#3b82f6',
  secondary: '#8b5cf6'
};

const QualityMetrics: React.FC<QualityMetricsProps> = ({
  apiBaseUrl = 'http://localhost:8000',
  adminToken
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<QualitySummary | null>(null);
  const [efficiency, setEfficiency] = useState<CostQualityEfficiency | null>(null);
  const [runs, setRuns] = useState<RunWithQuality[]>([]);
  const [qualityThreshold, setQualityThreshold] = useState(0.7);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const headers: HeadersInit = {};
      if (adminToken) {
        headers['X-Admin-Token'] = adminToken;
      }

      // Fetch quality summary
      const summaryRes = await fetch(`${apiBaseUrl}/metrics/quality/summary`, { headers });
      if (!summaryRes.ok) throw new Error('Failed to fetch quality summary');
      const summaryData = await summaryRes.json();
      setSummary(summaryData);

      // Fetch cost-quality efficiency
      const efficiencyRes = await fetch(
        `${apiBaseUrl}/metrics/quality/efficiency?quality_threshold=${qualityThreshold}`,
        { headers }
      );
      if (!efficiencyRes.ok) throw new Error('Failed to fetch efficiency metrics');
      const efficiencyData = await efficiencyRes.json();
      setEfficiency(efficiencyData);

      // Fetch recent runs with quality data
      const runsRes = await fetch(
        `${apiBaseUrl}/metrics/quality/runs?page=1&per_page=20`,
        { headers }
      );
      if (!runsRes.ok) throw new Error('Failed to fetch runs');
      const runsData = await runsRes.json();
      setRuns(runsData.runs || []);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quality metrics');
      console.error('Error fetching quality metrics:', err);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, adminToken, qualityThreshold]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;
  const formatCost = (value: number | null) => value !== null ? `$${value.toFixed(4)}` : 'N/A';
  const formatTime = (ms: number | null) => {
    if (ms === null) return 'N/A';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500 dark:text-gray-400">Loading quality metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-800 dark:text-red-300">{error}</p>
      </div>
    );
  }

  if (!summary || !efficiency) {
    return (
      <div className="text-gray-500 dark:text-gray-400">No quality data available</div>
    );
  }

  // Prepare data for cost vs quality scatter plot
  const costQualityData = runs
    .filter(r => r.quality_score !== null && r.total_cost_usd > 0)
    .map(r => ({
      quality: r.quality_score,
      cost: r.total_cost_usd,
      strategy: r.strategy || 'unknown',
      run_id: r.run_id
    }));

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Success Rate</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatPercent(summary.success_rate)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {summary.successful_runs} of {summary.total_runs} runs
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-5 h-5 text-blue-500" />
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Avg Quality</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {summary.avg_quality_score !== null 
              ? (summary.avg_quality_score * 100).toFixed(1) 
              : 'N/A'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Out of 100
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Manual Fixes</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {summary.runs_needing_manual_fix}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {formatPercent(summary.total_runs > 0 ? summary.runs_needing_manual_fix / summary.total_runs : 0)} of runs
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-5 h-5 text-purple-500" />
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Avg Time</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatTime(summary.avg_time_to_result_ms)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Time to result
          </p>
        </div>
      </div>

      {/* Cost Efficiency Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg border border-blue-200 dark:border-blue-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-medium text-blue-900 dark:text-blue-300">Cost per Success</h3>
          </div>
          <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
            {formatCost(efficiency.cost_per_successful_run)}
          </p>
          <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
            {efficiency.successful_runs} successful runs
          </p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg border border-green-200 dark:border-green-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
            <h3 className="text-sm font-medium text-green-900 dark:text-green-300">Cost per High Quality</h3>
          </div>
          <p className="text-2xl font-bold text-green-900 dark:text-green-100">
            {formatCost(efficiency.cost_per_high_quality_run)}
          </p>
          <p className="text-xs text-green-700 dark:text-green-400 mt-1">
            {efficiency.high_quality_runs} runs ≥ {(efficiency.quality_threshold * 100).toFixed(0)}%
          </p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-lg border border-purple-200 dark:border-purple-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h3 className="text-sm font-medium text-purple-900 dark:text-purple-300">Quality-Cost Index</h3>
          </div>
          <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
            {efficiency.quality_adjusted_cost_index !== null 
              ? efficiency.quality_adjusted_cost_index.toFixed(2)
              : 'N/A'}
          </p>
          <p className="text-xs text-purple-700 dark:text-purple-400 mt-1">
            Lower is better
          </p>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Success Rate by Strategy */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Success Rate by Strategy
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={summary.by_strategy}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="strategy" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
              <Tooltip 
                formatter={(value: number) => formatPercent(value)}
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
              />
              <Legend />
              <Bar dataKey="success_rate" fill={COLORS.success} name="Success Rate" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Average Quality by Strategy */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Quality Score by Strategy
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={summary.by_strategy.filter(s => s.avg_quality_score !== null)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="strategy" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
              <Tooltip 
                formatter={(value: number) => `${(value * 100).toFixed(1)}%`}
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
              />
              <Legend />
              <Bar dataKey="avg_quality_score" fill={COLORS.primary} name="Avg Quality" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Cost vs Quality Scatter */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Cost vs Quality (Recent Runs)
          </h3>
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                type="number" 
                dataKey="quality" 
                name="Quality Score" 
                stroke="#9ca3af"
                domain={[0, 1]}
                tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              />
              <YAxis 
                type="number" 
                dataKey="cost" 
                name="Cost" 
                stroke="#9ca3af"
                tickFormatter={(v) => `$${v.toFixed(4)}`}
              />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }}
                formatter={(value: any, name: string) => {
                  if (name === 'quality') return `${(value * 100).toFixed(1)}%`;
                  if (name === 'cost') return `$${value.toFixed(4)}`;
                  return value;
                }}
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
              />
              <Legend />
              <Scatter name="Runs" data={costQualityData} fill={COLORS.primary} />
            </ScatterChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
            Lower left is ideal: low cost with high quality
          </p>
        </div>

        {/* Quality by Model */}
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 lg:col-span-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Success Rate by Model
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={summary.by_model}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="model" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
              <Tooltip 
                formatter={(value: number, name: string) => {
                  if (name === 'success_rate' || name === 'avg_quality_score') {
                    return formatPercent(value);
                  }
                  return value;
                }}
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
              />
              <Legend />
              <Bar dataKey="success_rate" fill={COLORS.success} name="Success Rate" />
              <Bar dataKey="avg_quality_score" fill={COLORS.primary} name="Avg Quality" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Runs Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Runs</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Run ID
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Strategy
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Quality
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Cost
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Efficiency
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {runs.slice(0, 10).map((run) => (
                <tr key={run.run_id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-mono">
                    {run.run_id.substring(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                    {run.strategy || 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {run.success === true ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                        <CheckCircle className="w-3 h-3" />
                        Success
                      </span>
                    ) : run.success === false ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300">
                        <XCircle className="w-3 h-3" />
                        Failed
                      </span>
                    ) : (
                      <span className="text-gray-400">N/A</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                    {run.quality_score !== null 
                      ? `${(run.quality_score * 100).toFixed(1)}%`
                      : 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                    {formatCost(run.total_cost_usd)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                    {run.cost_efficiency !== null 
                      ? formatCost(run.cost_efficiency)
                      : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default QualityMetrics;
