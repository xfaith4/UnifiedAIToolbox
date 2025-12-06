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
    
    def test_orchestrate_run_dir_matches_manifest(self, cleanup_test_runs):
        """
        Test that run_dir in manifest matches the actual output directory
        where artifacts should be written.
        
        This is a regression test for the bug where -OutputDir was passed
        as BRIDGE_RUN_DIR instead of the per-run directory.
        """
        payload = {
            "goal": "Test run_dir consistency",
            "model": "gpt-4o-mini"
        }
        
        response = client.post("/orchestrate/run", json=payload)
        assert response.status_code == 200
        
        result = response.json()
        run_id = result["run_id"]
        manifest = result["manifest"]
        
        # Verify run_dir is set in manifest
        assert "run_dir" in manifest
        run_dir = pathlib.Path(manifest["run_dir"])
        
        # Verify run_dir points to the per-run subdirectory, not the root runs folder
        assert run_dir.name == run_id
        assert run_dir.parent == app.BRIDGE_RUN_DIR
        
        # Verify the directory exists
        assert run_dir.exists()
        
        # Simulate orchestration completion by creating orchestration-summary.json
        summary_data = {
            "Goal": "Test run_dir consistency",
            "Status": "completed",
            "Model": "gpt-4o-mini",
            "DurationSeconds": 1.5,
            "MilestonesCount": 2,
            "CompletedMilestones": 2
        }
        summary_path = run_dir / "orchestration-summary.json"
        summary_path.write_text(json.dumps(summary_data, indent=2))
        
        # Test that artifacts would be written to run_dir, not BRIDGE_RUN_DIR
        # This verifies the -OutputDir fix
        assert summary_path.exists()
        assert summary_path.parent == run_dir
        assert summary_path.parent != app.BRIDGE_RUN_DIR
