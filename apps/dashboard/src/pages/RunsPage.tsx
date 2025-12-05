/**
 * Runs Page - List and view orchestration runs
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Clock, DollarSign, Droplet, Zap, Download, Filter } from 'lucide-react';
import { runsService } from '../services/runsService';
import type { RunListItem } from '../types/runs';

export default function RunsPage() {
  const [runs, setRuns] = useState<RunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    loadRuns();
  }, [statusFilter]);

  const loadRuns = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await runsService.listRuns({
        status: statusFilter || undefined,
        limit: 100
      });
      setRuns(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load runs');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const formatCost = (usd: number) => {
    return `$${usd.toFixed(4)}`;
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'failed': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Orchestration Runs</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Track and analyze AI orchestration executions
          </p>
        </div>
        <button
          onClick={loadRuns}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          Refresh
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-center gap-4">
          <Filter className="w-5 h-5 text-gray-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
          >
            <option value="">All Status</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
            <option value="unknown">Unknown</option>
          </select>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            {runs.length} run{runs.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading runs...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* Runs List */}
      {!loading && !error && runs.length === 0 && (
        <div className="text-center py-12">
          <Activity className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">No runs found</p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
            Start an orchestration to see runs here
          </p>
        </div>
      )}

      {!loading && !error && runs.length > 0 && (
        <div className="grid gap-4">
          {runs.map((run) => (
            <div
              key={run.id}
              onClick={() => navigate(`/runs/${run.id}`)}
              className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:border-blue-500 dark:hover:border-blue-400 transition cursor-pointer"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {run.name}
                    </h3>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(run.status)}`}>
                      {run.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {formatDate(run.start_time)}
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    runsService.downloadRun(run.id);
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
                  title="Download JSON"
                >
                  <Download className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                </button>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Duration</div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {formatDuration(run.duration_ms)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-green-500" />
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Cost</div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {formatCost(run.total_cost_usd)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-500" />
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Energy</div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {run.energy_kwh.toFixed(4)} kWh
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Droplet className="w-4 h-4 text-blue-500" />
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Water</div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {run.water_liters.toFixed(4)} L
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-purple-500" />
                  <div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Run ID</div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white font-mono">
                      {run.id.split('-')[0]}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
