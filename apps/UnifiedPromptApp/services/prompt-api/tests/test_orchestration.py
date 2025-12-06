"""
Integration tests for orchestration endpoints, particularly testing
filesystem-safe path creation with various goal/title inputs.
"""
import json
import pathlib
import shutil
from fastapi.testclient import TestClient
import pytest

import app


client = TestClient(app.app)


@pytest.fixture
def cleanup_test_runs():
    """Cleanup any test run directories after tests."""
    yield
    # Clean up any test run directories created during tests
    if app.BRIDGE_RUN_DIR.exists():
        for item in app.BRIDGE_RUN_DIR.glob("test_*"):
            if item.is_dir():
                shutil.rmtree(item, ignore_errors=True)
            elif item.is_file():
                item.unlink(missing_ok=True)


class TestOrchestrateRun:
    """Test suite for /orchestrate/run endpoint."""
    
    def test_orchestrate_run_with_newline_in_goal(self, cleanup_test_runs):
        """
        Test that orchestration runs can be created even when the goal contains
        newlines, which previously caused WinError 123 on Windows.
        
        This is a regression test for the bug where:
        OSError: [WinError 123] The filename, directory name, or volume label 
        syntax is incorrect: 'G:\\...\\runs\\Will_orchestration_work_under_pressure\\n...'
        """
        # This is the exact scenario that caused the original bug
        payload = {
            "goal": "Will orchestration work under pressure\n",
            "model": "gpt-4o-mini",
            "run_mode": "default"
        }
        
        response = client.post("/orchestrate/run", json=payload)
        
        # Should succeed (status 200)
        assert response.status_code == 200
        
        # Check the response contains the expected fields
        result = response.json()
        assert "run_id" in result
        assert "manifest" in result
        assert "status" in result["manifest"]
        
        # Verify the run_id doesn't contain a newline
        run_id = result["run_id"]
        assert "\n" not in run_id
        assert "\r" not in run_id
        
        # Verify the directory was actually created without error
        # The run_id should be safe for filesystem use
        expected_dir = app.BRIDGE_RUN_DIR / run_id
        assert expected_dir.exists(), f"Run directory should exist: {expected_dir}"
    
    def test_orchestrate_run_with_multiline_goal(self, cleanup_test_runs):
        """Test with multiple newlines in the goal."""
        payload = {
            "goal": "Test\nmulti\nline\ngoal",
            "model": "gpt-4o-mini"
        }
        
        response = client.post("/orchestrate/run", json=payload)
        assert response.status_code == 200
        
        result = response.json()
        run_id = result["run_id"]
        
        # Should have replaced newlines with underscores
        assert "\n" not in run_id
        assert "Test_multi_line_goal" in run_id
        
        # Directory should exist
        expected_dir = app.BRIDGE_RUN_DIR / run_id
        assert expected_dir.exists()
    
    def test_orchestrate_run_with_invalid_windows_chars(self, cleanup_test_runs):
        """Test with various invalid Windows path characters in goal."""
        # Test with characters that are invalid in Windows paths
        payload = {
            "goal": "test<goal>with:invalid*chars?",
            "model": "gpt-4o-mini"
        }
        
        response = client.post("/orchestrate/run", json=payload)
        assert response.status_code == 200
        
        result = response.json()
        run_id = result["run_id"]
        
        # Should have sanitized all invalid characters
        for invalid_char in '<>:"/\\|?*':
            assert invalid_char not in run_id
        
        # Directory should exist without error
        expected_dir = app.BRIDGE_RUN_DIR / run_id
        assert expected_dir.exists()
    
    def test_orchestrate_run_with_windows_newlines(self, cleanup_test_runs):
        """Test with Windows-style CRLF newlines."""
        payload = {
            "goal": "Test\r\nWindows\r\nNewlines",
            "model": "gpt-4o-mini"
        }
        
        response = client.post("/orchestrate/run", json=payload)
        assert response.status_code == 200
        
        result = response.json()
        run_id = result["run_id"]
        
        # Should have cleaned CRLF
        assert "\r\n" not in run_id
        assert "\n" not in run_id
        assert "\r" not in run_id
        
        expected_dir = app.BRIDGE_RUN_DIR / run_id
        assert expected_dir.exists()
    
    def test_orchestrate_run_normal_goal(self, cleanup_test_runs):
        """Test that normal goals still work correctly."""
        payload = {
            "goal": "Normal test goal",
            "model": "gpt-4o-mini"
        }
        
        response = client.post("/orchestrate/run", json=payload)
        assert response.status_code == 200
        
        result = response.json()
        run_id = result["run_id"]
        
        # Should have a clean run_id with underscores for spaces
        assert "Normal_test_goal" in run_id
        
        expected_dir = app.BRIDGE_RUN_DIR / run_id
        assert expected_dir.exists()
    
    def test_orchestrate_run_with_prompt_id(self, cleanup_test_runs):
        """Test using prompt_id instead of goal."""
        payload = {
            "prompt_id": "test.prompt.id",
            "model": "gpt-4o-mini"
        }
        
        response = client.post("/orchestrate/run", json=payload)
        assert response.status_code == 200
        
        result = response.json()
        run_id = result["run_id"]
        
        # prompt_id should be used and sanitized
        assert "test.prompt.id" in run_id
        
        expected_dir = app.BRIDGE_RUN_DIR / run_id
        assert expected_dir.exists()
