// API utility functions for Prompt Hub
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

export const api = {
  // Prompts
  async getPrompts() {
    const response = await fetch(`${API_BASE}/prompts`);
    if (!response.ok) throw new Error('Failed to fetch prompts');
    return response.json();
  },

  async getPrompt(id) {
    const response = await fetch(`${API_BASE}/prompts/${id}`);
    if (!response.ok) throw new Error('Failed to fetch prompt');
    return response.json();
  },

  async createPrompt(prompt) {
    const response = await fetch(`${API_BASE}/prompts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prompt)
    });
    if (!response.ok) throw new Error('Failed to create prompt');
    return response.json();
  },

  async updatePrompt(id, prompt) {
    const response = await fetch(`${API_BASE}/prompts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prompt)
    });
    if (!response.ok) throw new Error('Failed to update prompt');
    return response.json();
  },

  async deletePrompt(id) {
    const response = await fetch(`${API_BASE}/prompts/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete prompt');
    return response.ok;
  },

  // Refiner
  async refinePrompt(id) {
    const response = await fetch(`${API_BASE}/prompts/${id}/refine`, {
      method: 'POST'
    });
    if (!response.ok) throw new Error('Failed to refine prompt');
    return response.json();
  },

  async refineBulk(ids) {
    const response = await fetch(`${API_BASE}/prompts/refine-bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt_ids: ids })
    });
    if (!response.ok) throw new Error('Failed to refine prompts');
    return response.json();
  },

  // Agents
  async getAgents() {
    const response = await fetch(`${API_BASE}/agents`);
    if (!response.ok) throw new Error('Failed to fetch agents');
    return response.json();
  },

  async getAgent(id) {
    const response = await fetch(`${API_BASE}/agents/${id}`);
    if (!response.ok) throw new Error('Failed to fetch agent');
    return response.json();
  },

  // Health check
  async getHealth() {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) throw new Error('API health check failed');
    return response.json();
  },

  // Reviews
  async getPromptReviews(id) {
    const response = await fetch(`${API_BASE}/prompts/${id}/reviews`);
    if (!response.ok) throw new Error('Failed to fetch reviews');
    return response.json();
  }
};

export default api;
