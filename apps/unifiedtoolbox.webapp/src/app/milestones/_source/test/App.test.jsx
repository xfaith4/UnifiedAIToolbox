import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from '../App';

// Mock fetch globally
global.fetch = vi.fn();

describe('App Component - Edge Cases', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  it('should handle empty data gracefully', async () => {
    global.fetch.mockImplementation((url) => {
      if (url.includes('CurrentGoal.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            Goal: '',
            Objective: '',
            SuccessCriteria: []
          })
        });
      }
      if (url.includes('Milestone_Log.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([])
        });
      }
      return Promise.reject(new Error('Not found'));
    });

    render(<App />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.queryByText(/Loading Milestone Dashboard/i)).not.toBeInTheDocument();
    });

    // Check that the page renders without crashing with empty data
    expect(screen.getByText(/AI-Orchestration Milestone Dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/Current Goal/i)).toBeInTheDocument();
  });

  it('should handle malformed data without crashing', async () => {
    // Mock fetch to return data with missing required fields
    global.fetch.mockImplementation((url) => {
      if (url.includes('CurrentGoal.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            // Missing goal and objective fields
            SuccessCriteria: null
          })
        });
      }
      if (url.includes('Milestone_Log.json')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            // Missing required fields
            { timestamp: '2024-01-01' },
            { message: 'Test message' },
            {} // completely empty object
          ])
        });
      }
      return Promise.reject(new Error('Not found'));
    });

    render(<App />);

    // Wait for data to load
    await waitFor(() => {
      expect(screen.queryByText(/Loading Milestone Dashboard/i)).not.toBeInTheDocument();
    });

    // Check that the page still renders despite malformed data
    expect(screen.getByText(/AI-Orchestration Milestone Dashboard/i)).toBeInTheDocument();
  });

  it('should show loading state when data is not available', () => {
    // Don't mock fetch - component should handle initial loading state
    global.fetch.mockImplementation(() => 
      new Promise(() => {}) // Never resolves
    );

    render(<App />);

    // Should show loading message
    expect(screen.getByText(/Loading Milestone Dashboard/i)).toBeInTheDocument();
    expect(screen.getByText(/Please wait while data initializes/i)).toBeInTheDocument();
  });
});
