/**
 * Run Detail Page - View detailed information about a specific run
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Clock, DollarSign, Zap, Droplet, Users, Download, 
  CheckCircle, XCircle, TrendingUp, Activity, Database 
} from 'lucide-react';
import { runsService } from '../services/runsService';
import type { Run } from '../types/runs';
import QualityRatingForm from '../components/QualityRatingForm';

export default function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadRun(id);
    }
  }, [id]);

  const loadRun = async (runId: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await runsService.getRun(runId);
      setRun(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load run');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading run details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-800 dark:text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <Activity className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Run not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate('/runs')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{run.name}</h1>
              {run.summary && (
                run.summary.success ? (
                  <CheckCircle className="w-6 h-6 text-green-500" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-500" />
                )
              )}
            </div>
            {run.task_description && (
              <p className="text-gray-600 dark:text-gray-400">{run.task_description}</p>
            )}
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Run ID: <span className="font-mono">{run.id}</span>
            </p>
          </div>
        </div>
        <button
          onClick={() => id && runsService.downloadRun(id)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Download JSON
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3 mb-2">
            <Clock className="w-5 h-5 text-blue-500" />
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Duration</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {formatDuration(run.duration_ms)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            {formatDate(run.start_time)}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3 mb-2">
            <DollarSign className="w-5 h-5 text-green-500" />
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Cost</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            ${run.costs.total_usd.toFixed(4)}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            API: ${run.costs.api_cost_usd.toFixed(4)} | Compute: ${run.costs.compute_cost_usd.toFixed(4)}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3 mb-2">
            <Zap className="w-5 h-5 text-yellow-500" />
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Energy</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {run.costs.energy_kwh.toFixed(4)} kWh
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            ~{(run.costs.energy_kwh * 1000 / 10).toFixed(1)} hours of LED bulb
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-3 mb-2">
            <Droplet className="w-5 h-5 text-blue-500" />
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">Water</h3>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">
            {run.costs.water_liters.toFixed(4)} L
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
            ~{(run.costs.water_liters / 9).toFixed(2)} minutes of shower
          </p>
        </div>
      </div>

      {/* Human Equivalent Card */}
      {run.human_equivalent && (
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg border border-purple-200 dark:border-purple-800 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Users className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Human Equivalent</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Estimated Human Time</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {run.human_equivalent.estimated_hours_if_human.toFixed(1)} hours
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Human Cost Equivalent</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                ${run.human_equivalent.estimated_cost_if_human.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Time Saved</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {run.human_equivalent.time_saved_hours.toFixed(1)} hours
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Resources Card */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Database className="w-6 h-6 text-gray-600 dark:text-gray-400" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Resource Usage</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Tokens In</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {run.resources.tokens_in.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Tokens Out</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {run.resources.tokens_out.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">CPU Seconds</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {run.resources.cpu_seconds.toFixed(1)}s
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">API Calls</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {run.resources.api_calls || 0}
            </p>
          </div>
        </div>
      </div>

      {/* Agents Timeline */}
      {run.agents && run.agents.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="w-6 h-6 text-gray-600 dark:text-gray-400" />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Agents</h2>
          </div>
          <div className="space-y-4">
            {run.agents.map((agent, idx) => (
              <div key={idx} className="border-l-4 border-blue-500 pl-4 py-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{agent.name}</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{agent.role}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-gray-600 dark:text-gray-400">
                      {formatDuration(agent.duration_ms)}
                    </p>
                  </div>
                </div>
                {agent.steps && agent.steps.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {agent.steps.map((step, stepIdx) => (
                      <div key={stepIdx} className="bg-gray-50 dark:bg-gray-700/50 rounded p-3 text-sm">
                        <p className="font-medium text-gray-900 dark:text-white">{step.action}</p>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">{step.output_summary}</p>
                        <div className="flex gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                          <span>In: {step.tokens_in}</span>
                          <span>Out: {step.tokens_out}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {run.summary && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Summary</h2>
          <p className="text-gray-700 dark:text-gray-300">{run.summary.outcome}</p>
          {run.summary.errors && run.summary.errors.length > 0 && (
            <div className="mt-4">
              <h3 className="font-semibold text-red-600 dark:text-red-400 mb-2">Errors:</h3>
              <ul className="list-disc list-inside space-y-1">
                {run.summary.errors.map((error, idx) => (
                  <li key={idx} className="text-red-600 dark:text-red-400">{error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Quality Rating */}
      <QualityRatingForm
        runId={run.id}
        apiBaseUrl={import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'}
        onSuccess={() => {
          // Optionally reload the run to show updated quality data
          if (id) loadRun(id);
        }}
      />
    </div>
  );
}
