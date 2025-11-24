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
    // Mock API health check
    global.fetch.mockImplementation((url) => {
      if (url.includes('/health')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, time: Date.now() })
        });
      }
      return Promise.reject(new Error('Not found'));
    });

    render(<App />);

    // Wait for component to render
    await waitFor(() => {
      const toolboxElements = screen.getAllByText(/AI Toolbox/i);
      expect(toolboxElements.length).toBeGreaterThan(0);
    });

    // Check that the page renders without crashing
    expect(screen.getByText(/Unified Prompt Hub/i)).toBeInTheDocument();
  });

  it('should handle API errors without crashing', async () => {
    // Mock fetch to return errors
    global.fetch.mockImplementation(() => {
      return Promise.reject(new Error('API error'));
    });

    render(<App />);

    // Wait for component to render
    await waitFor(() => {
      const toolboxElements = screen.getAllByText(/AI Toolbox/i);
      expect(toolboxElements.length).toBeGreaterThan(0);
    });

    // Check that the page still renders despite API errors
    expect(screen.getByText(/Unified Prompt Hub/i)).toBeInTheDocument();
  });

  it('should render main navigation and layout', () => {
    // Mock successful API response
    global.fetch.mockImplementation(() => 
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ok: true, time: Date.now() })
      })
    );

    render(<App />);

    // Should show main layout elements (text appears in multiple places)
    const toolboxElements = screen.getAllByText(/AI Toolbox/i);
    expect(toolboxElements.length).toBeGreaterThan(0);
    expect(screen.getByText(/Unified Prompt Hub/i)).toBeInTheDocument();
  });
});
