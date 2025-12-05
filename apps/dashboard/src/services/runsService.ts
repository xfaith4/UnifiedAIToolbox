/**
 * Service for interacting with orchestration runs API
 */

import type { Run, RunListItem, CostConfig } from '../types/runs';

const API_BASE = import.meta.env.VITE_RUNS_API_URL || 'http://localhost:8001';

export const runsService = {
  /**
   * List all runs
   */
  async listRuns(options?: { status?: string; limit?: number }): Promise<RunListItem[]> {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.limit) params.append('limit', options.limit.toString());
    
    const url = `${API_BASE}/api/runs${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to list runs: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.runs || [];
  },

  /**
   * Get run details by ID
   */
  async getRun(id: string): Promise<Run> {
    const response = await fetch(`${API_BASE}/api/runs/${id}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get run: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.run;
  },

  /**
   * Create or update a run
   */
  async saveRun(run: Partial<Run>): Promise<{ success: boolean; id: string; file: string; run: Run }> {
    const response = await fetch(`${API_BASE}/api/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(run),
    });
    
    if (!response.ok) {
      throw new Error(`Failed to save run: ${response.statusText}`);
    }
    
    return await response.json();
  },

  /**
   * Download run as JSON
   */
  async downloadRun(id: string): Promise<void> {
    window.open(`${API_BASE}/api/runs/${id}/download`, '_blank');
  },

  /**
   * Get cost configuration
   */
  async getCostConfig(): Promise<CostConfig> {
    const response = await fetch(`${API_BASE}/api/config/costs`);
    
    if (!response.ok) {
      throw new Error(`Failed to get cost config: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.config;
  },
};
