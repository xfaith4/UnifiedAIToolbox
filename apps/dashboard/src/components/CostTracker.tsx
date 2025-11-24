/**
 * Cost tracking component for displaying AI API usage costs
 */
import React, { useEffect, useState } from 'react';

interface CostSummary {
  total_cost: number;
  start_date?: string;
  end_date?: string;
  provider?: string;
}

interface ProviderCost {
  provider: string;
  call_count: number;
  total_tokens: number;
  total_cost: number;
  avg_cost_per_call: number;
  last_call_utc: string;
}

interface ModelCost {
  provider: string;
  model: string;
  call_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_tokens: number;
  total_cost: number;
  avg_cost_per_call: number;
  last_call_utc: string;
}

interface DailyCost {
  date: string;
  provider: string;
  call_count: number;
  total_tokens: number;
  total_cost: number;
}

interface BudgetStatus {
  budget_amount: number;
  period_days: number;
  current_cost: number;
  remaining: number;
  percentage_used: number;
  status: 'ok' | 'warning' | 'critical';
  provider?: string;
}

interface CostTrackerProps {
  apiBaseUrl?: string;
  adminToken?: string;
}

const CostTracker: React.FC<CostTrackerProps> = ({ 
  apiBaseUrl = 'http://localhost:8000',
  adminToken 
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [byProvider, setByProvider] = useState<ProviderCost[]>([]);
  const [byModel, setByModel] = useState<ModelCost[]>([]);
  const [daily, setDaily] = useState<DailyCost[]>([]);
  const [budget, setBudget] = useState<BudgetStatus | null>(null);
  const [budgetAmount, setBudgetAmount] = useState(100);
  const [budgetDays, setBudgetDays] = useState(30);

  const fetchCosts = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const headers: HeadersInit = {};
      if (adminToken) {
        headers['X-Admin-Token'] = adminToken;
      }

      // Fetch summary
      const summaryRes = await fetch(`${apiBaseUrl}/admin/costs/summary`, { headers });
      if (summaryRes.ok) {
        const summaryData = await summaryRes.json();
        setSummary(summaryData);
      }

      // Fetch breakdown
      const breakdownRes = await fetch(`${apiBaseUrl}/admin/costs/breakdown`, { headers });
      if (breakdownRes.ok) {
        const breakdownData = await breakdownRes.json();
        setByProvider(breakdownData.by_provider || []);
        setByModel(breakdownData.by_model || []);
        setDaily(breakdownData.daily || []);
      }

      // Fetch budget status
      const budgetRes = await fetch(
        `${apiBaseUrl}/admin/costs/budget?budget_amount=${budgetAmount}&period_days=${budgetDays}`,
        { headers }
      );
      if (budgetRes.ok) {
        const budgetData = await budgetRes.json();
        setBudget(budgetData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch cost data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCosts();
    // Refresh every 5 minutes
    const interval = setInterval(fetchCosts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [budgetAmount, budgetDays]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const getBudgetStatusColor = (status: string) => {
    switch (status) {
      case 'ok':
        return 'text-green-600 dark:text-green-400';
      case 'warning':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'critical':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white"></div>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Loading cost data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded">
        <p className="text-red-800 dark:text-red-200">Error: {error}</p>
        <button
          onClick={fetchCosts}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Cost Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Total Cost (All Time)</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">
              {summary ? formatCurrency(summary.total_cost) : '$0.00'}
            </p>
          </div>
          {budget && (
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Budget Status ({budgetDays} days)
              </p>
              <p className={`text-3xl font-bold ${getBudgetStatusColor(budget.status)}`}>
                {budget.percentage_used.toFixed(1)}%
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {formatCurrency(budget.current_cost)} / {formatCurrency(budget.budget_amount)}
              </p>
            </div>
          )}
        </div>

        {/* Budget Configuration */}
        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Budget Settings
          </h3>
          <div className="flex gap-4">
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400">Budget Amount ($)</label>
              <input
                type="number"
                value={budgetAmount}
                onChange={(e) => setBudgetAmount(parseFloat(e.target.value) || 0)}
                className="block w-32 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                step="10"
                min="0"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 dark:text-gray-400">Period (days)</label>
              <input
                type="number"
                value={budgetDays}
                onChange={(e) => setBudgetDays(parseInt(e.target.value) || 30)}
                className="block w-32 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                step="1"
                min="1"
              />
            </div>
            <button
              onClick={fetchCosts}
              className="self-end px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* By Provider */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Cost by Provider</h3>
        {byProvider.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">No cost data available yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 px-4 text-gray-700 dark:text-gray-300">Provider</th>
                  <th className="text-right py-2 px-4 text-gray-700 dark:text-gray-300">Calls</th>
                  <th className="text-right py-2 px-4 text-gray-700 dark:text-gray-300">Tokens</th>
                  <th className="text-right py-2 px-4 text-gray-700 dark:text-gray-300">Total Cost</th>
                  <th className="text-right py-2 px-4 text-gray-700 dark:text-gray-300">Avg/Call</th>
                </tr>
              </thead>
              <tbody>
                {byProvider.map((p) => (
                  <tr key={p.provider} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2 px-4 font-medium text-gray-900 dark:text-white capitalize">
                      {p.provider}
                    </td>
                    <td className="text-right py-2 px-4 text-gray-600 dark:text-gray-400">
                      {formatNumber(p.call_count)}
                    </td>
                    <td className="text-right py-2 px-4 text-gray-600 dark:text-gray-400">
                      {formatNumber(p.total_tokens)}
                    </td>
                    <td className="text-right py-2 px-4 font-medium text-gray-900 dark:text-white">
                      {formatCurrency(p.total_cost)}
                    </td>
                    <td className="text-right py-2 px-4 text-gray-600 dark:text-gray-400">
                      {formatCurrency(p.avg_cost_per_call)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* By Model */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Cost by Model</h3>
        {byModel.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">No model cost data available yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 px-4 text-gray-700 dark:text-gray-300">Provider</th>
                  <th className="text-left py-2 px-4 text-gray-700 dark:text-gray-300">Model</th>
                  <th className="text-right py-2 px-4 text-gray-700 dark:text-gray-300">Calls</th>
                  <th className="text-right py-2 px-4 text-gray-700 dark:text-gray-300">In/Out Tokens</th>
                  <th className="text-right py-2 px-4 text-gray-700 dark:text-gray-300">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {byModel.map((m, i) => (
                  <tr key={`${m.provider}-${m.model}-${i}`} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2 px-4 text-gray-900 dark:text-white capitalize">
                      {m.provider}
                    </td>
                    <td className="py-2 px-4 text-gray-600 dark:text-gray-400 font-mono text-xs">
                      {m.model}
                    </td>
                    <td className="text-right py-2 px-4 text-gray-600 dark:text-gray-400">
                      {formatNumber(m.call_count)}
                    </td>
                    <td className="text-right py-2 px-4 text-gray-600 dark:text-gray-400">
                      {formatNumber(m.total_input_tokens)} / {formatNumber(m.total_output_tokens)}
                    </td>
                    <td className="text-right py-2 px-4 font-medium text-gray-900 dark:text-white">
                      {formatCurrency(m.total_cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Daily Costs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Daily Costs (Last 30 Days)</h3>
        {daily.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">No daily cost data available yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 px-4 text-gray-700 dark:text-gray-300">Date</th>
                  <th className="text-left py-2 px-4 text-gray-700 dark:text-gray-300">Provider</th>
                  <th className="text-right py-2 px-4 text-gray-700 dark:text-gray-300">Calls</th>
                  <th className="text-right py-2 px-4 text-gray-700 dark:text-gray-300">Tokens</th>
                  <th className="text-right py-2 px-4 text-gray-700 dark:text-gray-300">Cost</th>
                </tr>
              </thead>
              <tbody>
                {daily.slice(0, 10).map((d, i) => (
                  <tr key={`${d.date}-${d.provider}-${i}`} className="border-b border-gray-100 dark:border-gray-700">
                    <td className="py-2 px-4 text-gray-900 dark:text-white">
                      {d.date}
                    </td>
                    <td className="py-2 px-4 text-gray-600 dark:text-gray-400 capitalize">
                      {d.provider}
                    </td>
                    <td className="text-right py-2 px-4 text-gray-600 dark:text-gray-400">
                      {formatNumber(d.call_count)}
                    </td>
                    <td className="text-right py-2 px-4 text-gray-600 dark:text-gray-400">
                      {formatNumber(d.total_tokens)}
                    </td>
                    <td className="text-right py-2 px-4 font-medium text-gray-900 dark:text-white">
                      {formatCurrency(d.total_cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CostTracker;
