#!/usr/bin/env python3
"""
Post-deployment smoke tests for Unified AI Toolbox.

Tests critical service functionality after deployment:
- API health and availability
- Authentication system
- Core endpoints (prompts, search, costs)
- Performance benchmarks
- Security headers
"""

import os
import time
import requests
import pytest
from typing import Dict, Any


# Configuration
API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000")
DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "http://localhost:5173")
TIMEOUT = 10


class TestAPIHealth:
    """Test API health and availability."""
    
    def test_api_root_accessible(self):
        """API root endpoint should be accessible."""
        response = requests.get(f"{API_BASE_URL}/", timeout=TIMEOUT)
        assert response.status_code == 200
    
    def test_health_endpoint(self):
        """Health endpoint should return valid status."""
        response = requests.get(f"{API_BASE_URL}/health", timeout=TIMEOUT)
        assert response.status_code == 200
        
        data = response.json()
        assert "status" in data
        assert data["status"] in ["healthy", "ok"]
    
    def test_api_docs_accessible(self):
        """API documentation should be accessible."""
        response = requests.get(f"{API_BASE_URL}/docs", timeout=TIMEOUT)
        assert response.status_code == 200
    
    def test_openapi_schema_available(self):
        """OpenAPI schema should be available."""
        response = requests.get(f"{API_BASE_URL}/openapi.json", timeout=TIMEOUT)
        assert response.status_code == 200
        
        schema = response.json()
        assert "openapi" in schema
        assert "info" in schema


class TestAuthentication:
    """Test authentication system."""
    
    def test_auth_status_endpoint(self):
        """Auth status endpoint should be accessible."""
        response = requests.get(f"{API_BASE_URL}/auth/status", timeout=TIMEOUT)
        assert response.status_code == 200
    
    def test_login_endpoint_exists(self):
        """Login endpoint should exist (even if credentials invalid)."""
        response = requests.post(
            f"{API_BASE_URL}/auth/login",
            json={"username": "test", "password": "test"},
            timeout=TIMEOUT
        )
        # Should return 401 for invalid credentials, not 404
        assert response.status_code in [200, 401]


class TestPromptManagement:
    """Test prompt management APIs."""
    
    def test_list_prompts_endpoint(self):
        """List prompts endpoint should be accessible."""
        response = requests.get(f"{API_BASE_URL}/prompts", timeout=TIMEOUT)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, dict)
    
    def test_search_prompts_endpoint(self):
        """Search prompts endpoint should work."""
        response = requests.get(
            f"{API_BASE_URL}/prompts/search",
            params={"q": "test"},
            timeout=TIMEOUT
        )
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, dict)
        assert "results" in data or "prompts" in data


class TestCostTracking:
    """Test cost tracking and analytics."""
    
    def test_cost_summary_endpoint(self):
        """Cost summary endpoint should be accessible."""
        response = requests.get(f"{API_BASE_URL}/admin/costs/summary", timeout=TIMEOUT)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, dict)
    
    def test_budget_status_endpoint(self):
        """Budget status endpoint should work."""
        response = requests.get(f"{API_BASE_URL}/admin/costs/budget", timeout=TIMEOUT)
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, dict)


class TestGitHubIntegration:
    """Test GitHub integration."""
    
    def test_github_search_endpoint_exists(self):
        """GitHub search endpoint should exist."""
        response = requests.get(
            f"{API_BASE_URL}/github/search",
            params={"q": "test", "per_page": 1},
            timeout=TIMEOUT
        )
        # 401 is acceptable if GITHUB_TOKEN not set
        assert response.status_code in [200, 401]
    
    def test_codex_runs_endpoint(self):
        """Codex runs endpoint should be accessible."""
        response = requests.get(f"{API_BASE_URL}/github/codex/runs", timeout=TIMEOUT)
        assert response.status_code == 200


class TestDashboard:
    """Test dashboard frontend."""
    
    def test_dashboard_accessible(self):
        """Dashboard should be accessible."""
        response = requests.get(DASHBOARD_URL, timeout=TIMEOUT)
        assert response.status_code == 200
    
    def test_dashboard_contains_app_root(self):
        """Dashboard should contain app root element."""
        response = requests.get(DASHBOARD_URL, timeout=TIMEOUT)
        assert 'id="root"' in response.text or 'id="app"' in response.text
    
    def test_dashboard_loads_javascript(self):
        """Dashboard should load JavaScript files."""
        response = requests.get(DASHBOARD_URL, timeout=TIMEOUT)
        assert ".js" in response.text


class TestPerformance:
    """Test performance benchmarks."""
    
    def test_api_response_time(self):
        """API response time should be under 500ms."""
        start = time.time()
        response = requests.get(f"{API_BASE_URL}/health", timeout=TIMEOUT)
        elapsed = (time.time() - start) * 1000  # Convert to ms
        
        assert response.status_code == 200
        assert elapsed < 500, f"Response time {elapsed:.0f}ms exceeds 500ms threshold"
    
    def test_search_response_time(self):
        """Search response time should be under 200ms."""
        start = time.time()
        response = requests.get(
            f"{API_BASE_URL}/prompts/search",
            params={"q": "test"},
            timeout=TIMEOUT
        )
        elapsed = (time.time() - start) * 1000  # Convert to ms
        
        assert response.status_code == 200
        assert elapsed < 200, f"Search time {elapsed:.0f}ms exceeds 200ms threshold"
    
    def test_response_compression(self):
        """Response compression should be enabled."""
        response = requests.get(
            f"{API_BASE_URL}/prompts",
            headers={"Accept-Encoding": "gzip"},
            timeout=TIMEOUT
        )
        
        assert response.status_code == 200
        # Check if response is compressed (gzip)
        # Note: requests automatically decompresses, so check the raw response
        assert response.headers.get("Content-Encoding") == "gzip"


class TestSecurityHeaders:
    """Test security headers."""
    
    def test_content_type_options_header(self):
        """X-Content-Type-Options header should be present."""
        response = requests.get(f"{API_BASE_URL}/", timeout=TIMEOUT)
        assert "X-Content-Type-Options" in response.headers
        assert response.headers["X-Content-Type-Options"] == "nosniff"
    
    def test_frame_options_header(self):
        """X-Frame-Options header should be present."""
        response = requests.get(f"{API_BASE_URL}/", timeout=TIMEOUT)
        assert "X-Frame-Options" in response.headers
    
    def test_xss_protection_header(self):
        """X-XSS-Protection header should be present."""
        response = requests.get(f"{API_BASE_URL}/", timeout=TIMEOUT)
        assert "X-XSS-Protection" in response.headers
    
    @pytest.mark.skip(reason="HSTS only in production with HTTPS")
    def test_hsts_header(self):
        """Strict-Transport-Security header should be present (production only)."""
        response = requests.get(f"{API_BASE_URL}/", timeout=TIMEOUT)
        assert "Strict-Transport-Security" in response.headers


class TestEndToEnd:
    """End-to-end workflow tests."""
    
    def test_search_and_retrieve_workflow(self):
        """Complete workflow: search for prompt and retrieve details."""
        # Search for prompts
        search_response = requests.get(
            f"{API_BASE_URL}/prompts/search",
            params={"q": "test", "limit": 5},
            timeout=TIMEOUT
        )
        assert search_response.status_code == 200
        
        # List all prompts
        list_response = requests.get(f"{API_BASE_URL}/prompts", timeout=TIMEOUT)
        assert list_response.status_code == 200
        
        data = list_response.json()
        # Verify we can process the response
        assert isinstance(data, dict)


if __name__ == "__main__":
    # Run tests with pytest
    pytest.main([__file__, "-v", "--tb=short"])
