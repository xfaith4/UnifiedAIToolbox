"""
Tests for the sanitize_run_id function which ensures run IDs are safe
for Windows filesystem paths.
"""
import pytest
from app import sanitize_run_id


class TestSanitizeRunId:
    """Test suite for sanitize_run_id function."""
    
    def test_newline_replacement(self):
        """Newlines should be replaced with underscores."""
        assert sanitize_run_id("Will_orchestration_work\n") == "Will_orchestration_work"
        assert sanitize_run_id("multi\nline\ngoal") == "multi_line_goal"
        assert sanitize_run_id("goal\r\nwith\r\nwindows\r\nnewlines") == "goal_with_windows_newlines"
    
    def test_invalid_windows_chars_removed(self):
        """All invalid Windows path characters should be replaced with underscores."""
        # Test each invalid character: <>:"/\|?*
        assert sanitize_run_id("file<name") == "file_name"
        assert sanitize_run_id("file>name") == "file_name"
        assert sanitize_run_id("file:name") == "file_name"
        assert sanitize_run_id('file"name') == "file_name"
        assert sanitize_run_id("file/name") == "file_name"
        assert sanitize_run_id("file\\name") == "file_name"
        assert sanitize_run_id("file|name") == "file_name"
        assert sanitize_run_id("file?name") == "file_name"
        assert sanitize_run_id("file*name") == "file_name"
    
    def test_multiple_invalid_chars(self):
        """Multiple invalid characters in a single string."""
        assert sanitize_run_id("test<>:file?name*") == "test_file_name"
        assert sanitize_run_id('path/to\\some:file?') == "path_to_some_file"
    
    def test_whitespace_collapse(self):
        """Multiple whitespace characters should collapse to single underscore."""
        assert sanitize_run_id("multiple   spaces") == "multiple_spaces"
        assert sanitize_run_id("tab\there") == "tab_here"
        assert sanitize_run_id("mixed  \t  whitespace") == "mixed_whitespace"
        assert sanitize_run_id("trailing  ") == "trailing"
        assert sanitize_run_id("  leading") == "leading"
    
    def test_underscore_collapse(self):
        """Multiple consecutive underscores should collapse to one."""
        assert sanitize_run_id("too___many____underscores") == "too_many_underscores"
        assert sanitize_run_id("bad::chars::make:::underscores") == "bad_chars_make_underscores"
    
    def test_trailing_dots_and_spaces_stripped(self):
        """Trailing dots and spaces should be removed (Windows constraint)."""
        assert sanitize_run_id("filename.") == "filename"
        assert sanitize_run_id("filename...") == "filename"
        assert sanitize_run_id("filename ") == "filename"
        assert sanitize_run_id("filename. . ") == "filename"
    
    def test_empty_or_none_defaults_to_run(self):
        """Empty input or None should return 'run'."""
        assert sanitize_run_id(None) == "run"
        assert sanitize_run_id("") == "run"
        assert sanitize_run_id("   ") == "run"
        assert sanitize_run_id(":::") == "run"  # All invalid chars
        assert sanitize_run_id("...") == "run"  # All trailing chars
    
    def test_max_length_enforcement(self):
        """Result should be truncated to max_length."""
        long_string = "a" * 200
        result = sanitize_run_id(long_string, max_length=120)
        assert len(result) == 120
        
        # Test with custom max_length
        result = sanitize_run_id(long_string, max_length=50)
        assert len(result) == 50
    
    def test_max_length_with_trailing_chars(self):
        """When truncating, trailing dots/spaces/underscores should still be stripped."""
        long_with_dots = "a" * 100 + "..." + "b" * 50
        result = sanitize_run_id(long_with_dots, max_length=120)
        assert len(result) <= 120
        assert not result.endswith(".")
        assert not result.endswith("_")
        assert not result.endswith(" ")
    
    def test_real_world_scenario(self):
        """Test the actual failure case from the bug report."""
        # This was the actual string that caused WinError 123
        problematic = "Will_orchestration_work_under_pressure\n"
        result = sanitize_run_id(problematic)
        assert "\n" not in result
        assert result == "Will_orchestration_work_under_pressure"
    
    def test_combined_goal_with_timestamp(self):
        """Test that goal is sanitized before timestamp is added (integration pattern)."""
        goal = "Test\nGoal"
        safe_goal = sanitize_run_id(goal)
        timestamp = "2025-12-05T06-57-08Z"
        run_id = f"{safe_goal}.{timestamp}"
        
        # Verify no newline in the final run_id
        assert "\n" not in run_id
        assert run_id == "Test_Goal.2025-12-05T06-57-08Z"
    
    def test_normal_strings_unchanged(self):
        """Normal alphanumeric strings should pass through cleanly."""
        assert sanitize_run_id("my_simple_run") == "my_simple_run"
        assert sanitize_run_id("run123") == "run123"
        assert sanitize_run_id("TestRun") == "TestRun"
    
    def test_dots_in_middle_preserved(self):
        """Dots in the middle of the string should be preserved, only trailing ones removed."""
        assert sanitize_run_id("file.v1.2.3") == "file.v1.2.3"
        assert sanitize_run_id("my.prompt.id") == "my.prompt.id"
    
    def test_unicode_characters_preserved(self):
        """Unicode characters should be preserved if they're valid."""
        assert sanitize_run_id("café") == "café"
        assert sanitize_run_id("测试") == "测试"
        # But whitespace should still be handled
        assert sanitize_run_id("café test") == "café_test"
