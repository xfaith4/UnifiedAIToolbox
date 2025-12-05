/**
 * Type definitions for orchestration runs
 */

export interface RunAgent {
  agent_id: string;
  name: string;
  role: string;
  start_time: string;
  end_time: string;
  duration_ms: number;
  steps: RunAgentStep[];
}

export interface RunAgentStep {
  step_id: string;
  action: string;
  input_summary: string;
  output_summary: string;
  tokens_in: number;
  tokens_out: number;
  api_call_metadata?: Record<string, any>;
}

export interface RunRefinement {
  id: string;
  timestamp: string;
  prompt: string;
  tokens_in: number;
  tokens_out: number;
  notes: string;
}

export interface RunResources {
  tokens_in: number;
  tokens_out: number;
  cpu_seconds: number;
  gpu_seconds: number;
  memory_peak_mb?: number;
  api_calls?: number;
  storage_gb?: number;
}

export interface RunCosts {
  api_cost_usd: number;
  compute_cost_usd: number;
  storage_cost_usd: number;
  total_usd: number;
  energy_kwh: number;
  water_liters: number;
}

export interface RunHumanEquivalent {
  estimated_hours_if_human: number;
  estimated_cost_if_human: number;
  professionals_count_equivalent: number;
  time_saved_hours: number;
}

export interface RunSummary {
  success: boolean;
  outcome: string;
  errors?: string[];
}

export interface Run {
  id: string;
  name: string;
  task_description?: string;
  start_time: string;
  end_time: string;
  duration_ms: number;
  orchestrator_version?: string;
  agents: RunAgent[];
  refinements?: RunRefinement[];
  resources: RunResources;
  costs: RunCosts;
  human_equivalent?: RunHumanEquivalent;
  summary?: RunSummary;
  tags?: string[];
  artifacts?: string[];
}

export interface RunListItem {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  duration_ms: number;
  total_cost_usd: number;
  energy_kwh: number;
  water_liters: number;
  status: 'success' | 'failed' | 'unknown';
  file: string;
}

export interface CostConfig {
  api_cost_per_1k_tokens_usd: number;
  cpu_cost_per_hour_usd: number;
  gpu_cost_per_hour_usd: number;
  avg_cpu_power_watts: number;
  avg_gpu_power_watts: number;
  water_intensity_l_per_kwh: number;
  human_hourly_rate_usd: number;
  baseline_hours_per_unit: number;
  storage_cost_per_gb_month_usd: number;
}
