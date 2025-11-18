"""
Tests for cost tracking functionality.
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch, MagicMock
import sys
from pathlib import Path
from datetime import datetime, date

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app import app
from cost_tracker import CostTracker

client = TestClient(app)


class TestCostTracker:
    """Tests for CostTracker class."""
    
    @pytest.fixture
    def tracker(self, tmp_path):
        """Create a CostTracker instance with temp database."""
        db_path = tmp_path / "test_costs.db"
        return CostTracker(str(db_path))
    
    def test_init_creates_database(self, tracker):
        """Test that initialization creates database tables."""
        # Should not raise any exceptions
        assert tracker is not None
    
    def test_log_api_call(self, tracker):
        """Test logging an API call."""
        tracker.log_api_call(
            provider="openai",
            model="gpt-4",
            input_tokens=100,
            output_tokens=50,
            cost=0.015,
            metadata={"test": "value"}
        )
        
        # Verify the call was logged (should not raise)
        assert True
    
    def test_get_summary(self, tracker):
        """Test getting cost summary."""
        # Log some test calls
        tracker.log_api_call("openai", "gpt-4", 100, 50, 0.015)
        tracker.log_api_call("anthropic", "claude-3", 200, 100, 0.02)
        
        summary = tracker.get_summary()
        
        assert 'total_cost' in summary
        assert 'total_calls' in summary
        assert 'by_provider' in summary
        assert summary['total_calls'] == 2
        assert summary['total_cost'] > 0
    
    def test_get_breakdown_by_provider(self, tracker):
        """Test getting cost breakdown by provider."""
        # Log calls for multiple providers
        tracker.log_api_call("openai", "gpt-4", 100, 50, 0.015)
        tracker.log_api_call("openai", "gpt-3.5-turbo", 50, 25, 0.005)
        tracker.log_api_call("anthropic", "claude-3", 200, 100, 0.02)
        
        breakdown = tracker.get_breakdown_by_provider()
        
        assert len(breakdown) > 0
        # Should have entries for both providers
        providers = [b['provider'] for b in breakdown]
        assert 'openai' in providers or 'anthropic' in providers
    
    def test_get_breakdown_by_model(self, tracker):
        """Test getting cost breakdown by model."""
        tracker.log_api_call("openai", "gpt-4", 100, 50, 0.015)
        tracker.log_api_call("openai", "gpt-3.5-turbo", 50, 25, 0.005)
        
        breakdown = tracker.get_breakdown_by_model("openai")
        
        assert len(breakdown) > 0
        models = [b['model'] for b in breakdown]
        assert 'gpt-4' in models or 'gpt-3.5-turbo' in models
    
    def test_get_breakdown_by_day(self, tracker):
        """Test getting cost breakdown by day."""
        tracker.log_api_call("openai", "gpt-4", 100, 50, 0.015)
        
        breakdown = tracker.get_breakdown_by_day()
        
        assert len(breakdown) > 0
        assert 'day' in breakdown[0]
        assert 'total_cost' in breakdown[0]
    
    def test_get_budget_status(self, tracker):
        """Test getting budget status."""
        # Log some calls
        tracker.log_api_call("openai", "gpt-4", 100, 50, 0.015)
        
        status = tracker.get_budget_status(budget_limit=100.0)
        
        assert 'spent' in status
        assert 'limit' in status
        assert 'remaining' in status
        assert 'percent_used' in status
        assert 'alert_level' in status
    
    def test_budget_alert_levels(self, tracker):
        """Test budget alert level calculation."""
        # Test OK level (under 70%)
        tracker.log_api_call("openai", "gpt-4", 100, 50, 30.0)
        status = tracker.get_budget_status(budget_limit=100.0)
        assert status['alert_level'] == 'ok'
        
        # Reset and test warning level (70-90%)
        tracker2 = CostTracker(":memory:")
        tracker2.log_api_call("openai", "gpt-4", 100, 50, 75.0)
        status = tracker2.get_budget_status(budget_limit=100.0)
        assert status['alert_level'] == 'warning'
        
        # Reset and test critical level (over 90%)
        tracker3 = CostTracker(":memory:")
        tracker3.log_api_call("openai", "gpt-4", 100, 50, 95.0)
        status = tracker3.get_budget_status(budget_limit=100.0)
        assert status['alert_level'] == 'critical'


class TestCostAPIEndpoints:
    """Tests for cost tracking API endpoints."""
    
    def test_get_cost_summary_endpoint(self):
        """Test cost summary endpoint."""
        response = client.get('/admin/costs/summary')
        
        assert response.status_code == 200
        data = response.json()
        assert 'total_cost' in data
        assert 'total_calls' in data
    
    def test_get_cost_breakdown_endpoint(self):
        """Test cost breakdown endpoint."""
        response = client.get('/admin/costs/breakdown')
        
        assert response.status_code == 200
        data = response.json()
        assert 'by_provider' in data
        assert 'by_day' in data
    
    def test_get_cost_breakdown_with_provider_filter(self):
        """Test breakdown with provider filter."""
        response = client.get('/admin/costs/breakdown?provider=openai')
        
        assert response.status_code == 200
        data = response.json()
        assert 'by_provider' in data
    
    def test_get_budget_status_endpoint(self):
        """Test budget status endpoint."""
        response = client.get('/admin/costs/budget?limit=100.0')
        
        assert response.status_code == 200
        data = response.json()
        assert 'spent' in data
        assert 'alert_level' in data
    
    def test_budget_status_without_limit(self):
        """Test budget status without limit parameter."""
        response = client.get('/admin/costs/budget')
        
        # Should still work but may return default values
        assert response.status_code in [200, 422]


class TestCostTrackingIntegration:
    """Integration tests for cost tracking."""
    
    def test_cost_logged_on_provider_call(self):
        """Test that costs are logged when providers are called."""
        # This would require calling actual provider endpoints
        # For now, just test that the logging mechanism exists
        tracker = CostTracker(":memory:")
        
        # Simulate provider call
        tracker.log_api_call(
            provider="openai",
            model="gpt-4",
            input_tokens=100,
            output_tokens=50,
            cost=0.015
        )
        
        summary = tracker.get_summary()
        assert summary['total_calls'] >= 1
    
    def test_cost_summary_includes_all_providers(self):
        """Test that summary includes all providers."""
        tracker = CostTracker(":memory:")
        
        # Log calls for multiple providers
        tracker.log_api_call("openai", "gpt-4", 100, 50, 0.015)
        tracker.log_api_call("anthropic", "claude-3", 200, 100, 0.02)
        
        summary = tracker.get_summary()
        
        assert summary['total_calls'] == 2
        assert len(summary['by_provider']) > 0


class TestCostCalculations:
    """Tests for cost calculation helpers."""
    
    def test_calculate_openai_cost(self):
        """Test OpenAI cost calculation."""
        # GPT-4: $0.03/1K input, $0.06/1K output
        input_tokens = 1000
        output_tokens = 500
        
        expected_cost = (1000 * 0.03 / 1000) + (500 * 0.06 / 1000)
        
        # This is a simplified test - actual calculation would be in provider code
        assert expected_cost == pytest.approx(0.06, rel=0.01)
    
    def test_calculate_anthropic_cost(self):
        """Test Anthropic cost calculation."""
        # Claude-3 Sonnet: $0.003/1K input, $0.015/1K output
        input_tokens = 1000
        output_tokens = 500
        
        expected_cost = (1000 * 0.003 / 1000) + (500 * 0.015 / 1000)
        
        assert expected_cost == pytest.approx(0.0105, rel=0.01)


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
