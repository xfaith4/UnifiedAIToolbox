"""
Tests for safe JSON loading functionality that helps diagnose
"Expecting value..." errors in orchestration.
"""
import json
import pathlib
import pytest
import tempfile
from fastapi.testclient import TestClient

import app


client = TestClient(app.app)


class TestSafeJsonLoad:
    """Test suite for safe_json_load helper function."""
    
    def test_load_valid_json(self):
        """Test loading valid JSON file."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump({"test": "data", "count": 42}, f)
            temp_path = pathlib.Path(f.name)
        
        try:
            result = app.safe_json_load(temp_path)
            assert result == {"test": "data", "count": 42}
        finally:
            temp_path.unlink()
    
    def test_load_empty_json_file(self):
        """Test loading empty (0 byte) JSON file raises ValueError."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            temp_path = pathlib.Path(f.name)
        
        try:
            with pytest.raises(ValueError) as exc_info:
                app.safe_json_load(temp_path)
            
            # Should have descriptive error message
            assert "Empty JSON file (0 bytes)" in str(exc_info.value)
            assert str(temp_path) in str(exc_info.value)
        finally:
            temp_path.unlink()
    
    def test_load_empty_json_with_default(self):
        """Test loading empty JSON file returns default when provided."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            temp_path = pathlib.Path(f.name)
        
        try:
            result = app.safe_json_load(temp_path, default={"empty": True})
            assert result == {"empty": True}
        finally:
            temp_path.unlink()
    
    def test_load_whitespace_only_json(self):
        """Test loading JSON file with only whitespace raises ValueError."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            f.write("   \n  \t  \n")
            temp_path = pathlib.Path(f.name)
        
        try:
            with pytest.raises(ValueError) as exc_info:
                app.safe_json_load(temp_path)
            
            assert "contains only whitespace" in str(exc_info.value)
        finally:
            temp_path.unlink()
    
    def test_load_invalid_json(self):
        """Test loading invalid JSON raises ValueError with details."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            f.write('{"incomplete": ')
            temp_path = pathlib.Path(f.name)
        
        try:
            with pytest.raises(ValueError) as exc_info:
                app.safe_json_load(temp_path)
            
            error_msg = str(exc_info.value)
            # Should include file path and error details
            assert str(temp_path) in error_msg
            assert "Invalid JSON" in error_msg
            # Should include content preview
            assert "Content preview" in error_msg
        finally:
            temp_path.unlink()
    
    def test_load_invalid_json_with_default(self):
        """Test loading invalid JSON returns default when provided."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            f.write('{"bad json')
            temp_path = pathlib.Path(f.name)
        
        try:
            result = app.safe_json_load(temp_path, default={"fallback": True})
            assert result == {"fallback": True}
        finally:
            temp_path.unlink()
    
    def test_load_nonexistent_file(self):
        """Test loading non-existent file raises appropriate error."""
        temp_path = pathlib.Path("/tmp/nonexistent_test_file_12345.json")
        
        with pytest.raises((FileNotFoundError, ValueError)):
            app.safe_json_load(temp_path)
    
    def test_load_with_context(self):
        """Test that context is included in error messages."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            temp_path = pathlib.Path(f.name)
        
        try:
            with pytest.raises(ValueError) as exc_info:
                app.safe_json_load(temp_path, context="test_context")
            
            assert "[test_context]" in str(exc_info.value)
        finally:
            temp_path.unlink()


class TestGetOrchestrationRunErrorHandling:
    """Test that get_orchestration_run properly handles JSON errors."""
    
    def test_get_run_with_empty_json(self):
        """Test getting a run with an empty JSON manifest."""
        # Create an empty JSON file
        run_id = "test_empty_json_run"
        manifest_path = app.BRIDGE_RUN_DIR / f"{run_id}.json"
        manifest_path.write_text("", encoding="utf-8")
        
        try:
            response = client.get(f"/orchestrate/run/{run_id}")
            
            # Should return 500 with descriptive error
            assert response.status_code == 500
            error = response.json()
            assert "detail" in error
            # Should mention it's empty
            assert "Empty JSON file (0 bytes)" in error["detail"] or "0 bytes" in error["detail"]
        finally:
            manifest_path.unlink(missing_ok=True)
    
    def test_get_run_with_invalid_json(self):
        """Test getting a run with invalid JSON manifest."""
        run_id = "test_invalid_json_run"
        manifest_path = app.BRIDGE_RUN_DIR / f"{run_id}.json"
        manifest_path.write_text('{"incomplete":', encoding="utf-8")
        
        try:
            response = client.get(f"/orchestrate/run/{run_id}")
            
            # Should return 500 with descriptive error
            assert response.status_code == 500
            error = response.json()
            assert "detail" in error
            # Should mention JSON is invalid
            assert "Invalid JSON" in error["detail"] or "JSON" in error["detail"]
        finally:
            manifest_path.unlink(missing_ok=True)
    
    def test_get_run_with_valid_json(self):
        """Test getting a run with valid JSON works normally."""
        run_id = "test_valid_json_run"
        manifest_path = app.BRIDGE_RUN_DIR / f"{run_id}.json"
        valid_manifest = {
            "run_id": run_id,
            "status": "completed",
            "goal": "Test goal"
        }
        manifest_path.write_text(json.dumps(valid_manifest, indent=2), encoding="utf-8")
        
        try:
            response = client.get(f"/orchestrate/run/{run_id}")
            
            # Should succeed
            assert response.status_code == 200
            result = response.json()
            assert result["run_id"] == run_id
            assert result["status"] == "completed"
        finally:
            manifest_path.unlink(missing_ok=True)
