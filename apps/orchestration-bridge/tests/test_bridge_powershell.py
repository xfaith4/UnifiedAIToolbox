"""
Unit tests for PowerShell detection and run manifest execution in bridge.py.
"""

import json
import pytest
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock
import sys

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from bridge import _find_powershell, _execute_run_manifest


class TestFindPowerShell:
    """Tests for _find_powershell function."""

    @patch('bridge.shutil.which')
    def test_finds_pwsh_when_available(self, mock_which):
        """Test that pwsh is found and returned when available."""
        mock_which.return_value = "/usr/bin/pwsh"
        
        result, detection_log = _find_powershell()
        
        assert result == "pwsh"
        assert any("pwsh: found" in log for log in detection_log)

    @patch('bridge.shutil.which')
    @patch('bridge.os.name', 'nt')
    def test_falls_back_to_powershell_on_windows(self, mock_which):
        """Test fallback to powershell on Windows when pwsh is not available."""
        # First call (pwsh) returns None, second call (powershell) returns path
        mock_which.side_effect = [None, "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe"]
        
        result, detection_log = _find_powershell()
        
        assert result == "powershell"
        assert any("pwsh: not found" in log for log in detection_log)
        assert any("powershell: found" in log for log in detection_log)

    @patch('bridge.shutil.which')
    @patch('bridge.os.name', 'posix')
    def test_returns_none_when_no_powershell_on_linux(self, mock_which):
        """Test that None is returned on Linux when pwsh is not available."""
        mock_which.return_value = None
        
        result, detection_log = _find_powershell()
        
        assert result is None
        assert any("No PowerShell executable found" in log for log in detection_log)

    @patch('bridge.shutil.which')
    @patch('bridge.os.name', 'nt')
    def test_returns_none_when_no_powershell_on_windows(self, mock_which):
        """Test that None is returned on Windows when no PowerShell is available."""
        mock_which.return_value = None
        
        result, detection_log = _find_powershell()
        
        assert result is None
        assert any("No PowerShell executable found" in log for log in detection_log)

    @patch('bridge.shutil.which')
    def test_returns_detection_log_with_os_info(self, mock_which):
        """Test that detection log includes OS information."""
        mock_which.return_value = "/usr/bin/pwsh"
        
        result, detection_log = _find_powershell()
        
        assert any("os.name=" in log for log in detection_log)
        assert any("candidates=" in log for log in detection_log)


class TestExecuteRunManifest:
    """Tests for _execute_run_manifest function."""

    def test_logs_debug_event_for_detection(self):
        """Test that detection debug info is logged to manifest events."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manifest_path = Path(tmpdir) / "test_manifest.json"
            manifest_path.write_text(json.dumps({
                "prompt_id": "test.prompt",
                "version": "1.0",
                "status": "queued"
            }), encoding="utf-8")
            
            with patch('bridge._find_powershell', return_value=(None, ["test log entry"])):
                with patch('bridge.REPO_ROOT', Path(tmpdir)):
                    _execute_run_manifest(manifest_path)
            
            # Read the resulting manifest
            result = json.loads(manifest_path.read_text(encoding="utf-8"))
            
            # Check for debug event with detection info
            debug_events = [e for e in result.get("events", []) if e.get("type") == "debug"]
            assert len(debug_events) >= 1
            assert "Detection:" in debug_events[0]["message"]
            assert "orch_script=" in debug_events[0]["message"]
            assert "exists=" in debug_events[0]["message"]
            assert "ps_exe=" in debug_events[0]["message"]
            assert "ps_log=" in debug_events[0]["message"]

    def test_simulated_mode_when_no_powershell(self):
        """Test that simulated mode is used when no PowerShell is available."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manifest_path = Path(tmpdir) / "test_manifest.json"
            manifest_path.write_text(json.dumps({
                "prompt_id": "test.prompt",
                "version": "1.0",
                "status": "queued"
            }), encoding="utf-8")
            
            with patch('bridge._find_powershell', return_value=(None, ["No PowerShell found"])):
                with patch('bridge.REPO_ROOT', Path(tmpdir)):
                    _execute_run_manifest(manifest_path)
            
            result = json.loads(manifest_path.read_text(encoding="utf-8"))
            
            assert result["mode"] == "simulated"
            warn_events = [e for e in result.get("events", []) if e.get("type") == "warn"]
            assert len(warn_events) >= 1
            assert "Simulated run" in warn_events[0]["message"]
            assert "PowerShell" in warn_events[0]["message"]

    def test_simulated_mode_when_script_missing(self):
        """Test that simulated mode is used when script is missing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            manifest_path = Path(tmpdir) / "test_manifest.json"
            manifest_path.write_text(json.dumps({
                "prompt_id": "test.prompt",
                "version": "1.0",
                "status": "queued"
            }), encoding="utf-8")
            
            # Script path won't exist in tmpdir
            with patch('bridge._find_powershell', return_value=("pwsh", ["pwsh: found"])):
                with patch('bridge.REPO_ROOT', Path(tmpdir)):
                    _execute_run_manifest(manifest_path)
            
            result = json.loads(manifest_path.read_text(encoding="utf-8"))
            
            assert result["mode"] == "simulated"
            warn_events = [e for e in result.get("events", []) if e.get("type") == "warn"]
            assert len(warn_events) >= 1
            assert "script not found" in warn_events[0]["message"]

    def test_executed_mode_info_includes_powershell_exe(self):
        """Test that executed mode logs which PowerShell was used."""
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create the script path structure
            script_dir = Path(tmpdir) / "Orchestration" / "scripts"
            script_dir.mkdir(parents=True)
            script_path = script_dir / "POF.ps1"
            script_path.write_text("# dummy script", encoding="utf-8")
            
            manifest_path = Path(tmpdir) / "test_manifest.json"
            manifest_path.write_text(json.dumps({
                "prompt_id": "test.prompt",
                "version": "1.0",
                "status": "queued"
            }), encoding="utf-8")
            
            with patch('bridge._find_powershell', return_value=("pwsh", ["pwsh: found at /usr/bin/pwsh"])):
                with patch('bridge.REPO_ROOT', Path(tmpdir)):
                    with patch('bridge.subprocess.run') as mock_run:
                        mock_run.return_value = MagicMock(returncode=0)
                        _execute_run_manifest(manifest_path)
            
            result = json.loads(manifest_path.read_text(encoding="utf-8"))
            
            assert result["mode"] == "executed"
            info_events = [e for e in result.get("events", []) if e.get("type") == "info"]
            assert len(info_events) >= 1
            # Should mention which PowerShell executable was used
            assert "via pwsh" in info_events[0]["message"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
