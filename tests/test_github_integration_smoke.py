"""
Smoke test for GitHub integration.

This test verifies the basic functionality of the GitHub integration
without requiring actual GitHub credentials or making real API calls.
"""

import sys
from pathlib import Path

# Add the prompt-api directory to the path
api_dir = Path(__file__).parent.parent / "Orchestration" / "UnifiedPromptApp" / "services" / "prompt-api"
sys.path.insert(0, str(api_dir))

from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

# Mock the GitHub services before importing app
sys.modules['github_integration'] = MagicMock()
sys.modules['github_integration.clone_service'] = MagicMock()
sys.modules['github_integration.pr_service'] = MagicMock()
sys.modules['shared'] = MagicMock()
sys.modules['shared.github_core'] = MagicMock()

# Import github_api module
import github_api

# Create test app
from fastapi import FastAPI
app = FastAPI()
app.include_router(github_api.router)

client = TestClient(app)


def test_github_status_endpoint():
    """Test that the status endpoint returns expected structure."""
    response = client.get("/github/status")
    assert response.status_code == 200
    
    data = response.json()
    assert "available" in data
    assert "authenticated" in data
    assert "message" in data
    
    print("✓ GitHub status endpoint working")


def test_endpoints_registered():
    """Test that all expected endpoints are registered."""
    routes = [route.path for route in github_api.router.routes]
    
    expected_endpoints = [
        "/github/status",
        "/github/auth/verify",
        "/github/repos/{owner}/{repo}",
        "/github/repos/clone",
        "/github/repos/{owner}/{repo}/pulls",
        "/github/repos/{owner}/{repo}/issues",
        "/github/repos/{owner}/{repo}/branches",
        "/github/orchestration/run",
        "/github/orchestration/upload-results"
    ]
    
    for endpoint in expected_endpoints:
        # Check if endpoint is in routes (accounting for FastAPI path formatting)
        found = any(endpoint in route for route in routes)
        assert found, f"Endpoint {endpoint} not found in routes"
    
    print(f"✓ All {len(expected_endpoints)} expected endpoints registered")


def test_github_api_models():
    """Test that all request/response models are properly defined."""
    models = [
        github_api.GitHubAuthRequest,
        github_api.GitHubAuthResponse,
        github_api.RepositoryMetadataResponse,
        github_api.CloneRepositoryRequest,
        github_api.CloneRepositoryResponse,
        github_api.PullRequestInfo,
        github_api.IssueInfo,
        github_api.CreatePRRequest,
        github_api.CreatePRResponse,
        github_api.OrchestrationRunRequest,
        github_api.OrchestrationRunResponse,
        github_api.UploadResultsRequest,
    ]
    
    for model in models:
        assert hasattr(model, '__fields__'), f"Model {model.__name__} missing __fields__"
    
    print(f"✓ All {len(models)} Pydantic models properly defined")


def test_github_integration_imports():
    """Test that GitHub integration can be imported conditionally."""
    # This tests that the module handles missing dependencies gracefully
    assert hasattr(github_api, 'GITHUB_AVAILABLE')
    assert isinstance(github_api.GITHUB_AVAILABLE, bool)
    
    print(f"✓ GitHub integration availability: {github_api.GITHUB_AVAILABLE}")


def test_helper_functions():
    """Test helper functions exist and work."""
    # Test get_github_token
    token = github_api.get_github_token("Bearer test_token")
    assert token == "test_token"
    
    # Test validate_github_available (this will raise if not available)
    # We'll catch the exception to verify it works
    try:
        with patch('github_api.GITHUB_AVAILABLE', False):
            github_api.validate_github_available()
        assert False, "Should have raised HTTPException"
    except Exception as e:
        assert "GitHub integration not available" in str(e)
    
    print("✓ Helper functions working correctly")


if __name__ == "__main__":
    print("\n" + "="*60)
    print("GitHub Integration Smoke Tests")
    print("="*60 + "\n")
    
    try:
        test_github_status_endpoint()
        test_endpoints_registered()
        test_github_api_models()
        test_github_integration_imports()
        test_helper_functions()
        
        print("\n" + "="*60)
        print("✅ All smoke tests passed!")
        print("="*60 + "\n")
        sys.exit(0)
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}\n")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}\n")
        sys.exit(1)
