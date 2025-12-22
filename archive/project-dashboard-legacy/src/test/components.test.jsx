import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SummaryCards from '../components/SummaryCards';
import TrendChart from '../components/TrendChart';
import RunTable from '../components/RunTable';

describe('Component Edge Cases', () => {
  describe('SummaryCards', () => {
    it('should handle undefined/null values gracefully', () => {
      render(<SummaryCards avgScore={undefined} totalCost={null} avgDuration={0} />);
      
      // Component should render without crashing
      expect(screen.getByText(/Avg Score/i)).toBeInTheDocument();
      expect(screen.getByText(/Total Cost/i)).toBeInTheDocument();
      expect(screen.getByText(/Avg Duration/i)).toBeInTheDocument();
    });

    it('should handle negative values', () => {
      render(<SummaryCards avgScore={-5} totalCost={-100} avgDuration={-10} />);
      
      // Component should render even with negative values
      expect(screen.getByText(/Avg Score/i)).toBeInTheDocument();
      expect(screen.getByText(/-5/)).toBeInTheDocument();
      expect(screen.getByText(/-100/)).toBeInTheDocument();
    });

    it('should handle very large numbers', () => {
      render(<SummaryCards avgScore={999999} totalCost={1000000.50} avgDuration={10000} />);
      
      expect(screen.getByText(/999999/)).toBeInTheDocument();
      expect(screen.getByText(/1000000.5/)).toBeInTheDocument();
    });
  });

  describe('TrendChart', () => {
    it('should handle empty runs array', () => {
      const { container } = render(<TrendChart runs={[]} />);
      
      // Component should render without crashing
      expect(screen.getByText(/Performance Trend/i)).toBeInTheDocument();
      // Chart container should exist
      expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument();
    });

    it('should handle runs with missing Score or Cost fields', () => {
      const runs = [
        { Timestamp: '2024-01-01' }, // Missing Score and Cost
        { Timestamp: '2024-01-02', Score: 8 }, // Missing Cost
        { Timestamp: '2024-01-03', Cost: 5.5 }, // Missing Score
      ];

      const { container } = render(<TrendChart runs={runs} />);
      
      // Should render without crashing
      expect(screen.getByText(/Performance Trend/i)).toBeInTheDocument();
      expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument();
    });

    it('should handle non-numeric Score and Cost values', () => {
      const runs = [
        { Timestamp: '2024-01-01', Score: 'invalid', Cost: 'not-a-number' },
        { Timestamp: '2024-01-02', Score: NaN, Cost: Infinity },
        { Timestamp: '2024-01-03', Score: null, Cost: undefined },
      ];

      const { container } = render(<TrendChart runs={runs} />);
      
      // Should not crash with invalid data
      expect(screen.getByText(/Performance Trend/i)).toBeInTheDocument();
    });
  });

  describe('RunTable', () => {
    it('should handle empty runs array', () => {
      render(<RunTable runs={[]} />);
      
      // Table headers should still render
      expect(screen.getByText(/Run History/i)).toBeInTheDocument();
      expect(screen.getByText(/Timestamp/i)).toBeInTheDocument();
      expect(screen.getByText(/Score/i)).toBeInTheDocument();
    });

    it('should handle runs with missing fields', () => {
      const runs = [
        { Timestamp: '2024-01-01' }, // Missing all other fields
        { Score: 5 }, // Missing Timestamp and others
        {}, // Completely empty
      ];

      render(<RunTable runs={runs} />);
      
      // Should render without crashing
      expect(screen.getByText(/Run History/i)).toBeInTheDocument();
    });

    it('should apply correct styling based on Score threshold', () => {
      const runs = [
        { Timestamp: '2024-01-01', Score: 8, Cost: 1.5, Duration: 5, Outcome: 'Pass', Synthesis: '#' },
        { Timestamp: '2024-01-02', Score: 5, Cost: 2.0, Duration: 6, Outcome: 'Fail', Synthesis: '#' },
      ];

      const { container } = render(<RunTable runs={runs} />);
      
      // Check that scores have appropriate color classes
      const cells = container.querySelectorAll('td');
      const scoreCell1 = Array.from(cells).find(cell => cell.textContent === '8');
      const scoreCell2 = Array.from(cells).find(cell => cell.textContent === '5');
      
      expect(scoreCell1).toHaveClass('text-teal-400');
      expect(scoreCell2).toHaveClass('text-red-400');
    });
  });
});
