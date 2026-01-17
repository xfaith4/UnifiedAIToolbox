"""
Unit tests for orchestrator logging functionality.

Tests:
- JSONL append format correctness
- Prompt hash stability (same prompt => same hash)
- Redaction removes typical secrets
- Schema validation pass/fail behavior
- Fail-open logging behavior
"""

import json
import tempfile
from pathlib import Path
import pytest

from orchestrator_logger import (
    OrchestratorLogger,
    redact_secrets,
    compute_prompt_hash,
    compute_file_hash,
    append_jsonl,
    write_json,
    validate_agent_output,
    detect_stacks,
)
from orchestrator_schemas import RunMetadata, StepEvent, Decision


class TestSecretRedaction:
    """Test suite for secret redaction functionality."""
    
    def test_redact_api_key(self):
        """Test API key redaction."""
        text = 'api_key: sk_test_1234567890abcdefghij'
        result = redact_secrets(text)
        assert 'sk_test_1234567890abcdefghij' not in result
        assert '[REDACTED]' in result
    
    def test_redact_bearer_token(self):
        """Test bearer token redaction."""
        text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
        result = redact_secrets(text)
        assert 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' not in result
        assert '[REDACTED]' in result
    
    def test_redact_password(self):
        """Test password redaction."""
        text = 'password: SuperSecret123!'
        result = redact_secrets(text)
        assert 'SuperSecret123!' not in result
        assert '[REDACTED]' in result
    
    def test_redact_multiple_secrets(self):
        """Test multiple secret patterns in same text."""
        text = '''
        api_key: sk_test_1234567890abcdefghij
        password: MyPassword123
        token: ghp_1234567890abcdefghijklmnopqrstuvwxyz
        '''
        result = redact_secrets(text)
        assert 'sk_test_1234567890abcdefghij' not in result
        assert 'MyPassword123' not in result
        assert 'ghp_1234567890abcdefghijklmnopqrstuvwxyz' not in result
        assert result.count('[REDACTED]') >= 3
    
    def test_redact_preserves_safe_content(self):
        """Test that safe content is not modified."""
        text = 'This is safe content with no secrets'
        result = redact_secrets(text)
        assert result == text
    
    def test_redact_empty_string(self):
        """Test redaction of empty string."""
        result = redact_secrets('')
        assert result == ''
    
    def test_redact_none(self):
        """Test redaction of None."""
        result = redact_secrets(None)
        assert result is None


class TestPromptHashing:
    """Test suite for prompt hashing functionality."""
    
    def test_hash_stability(self):
        """Test that same prompt produces same hash."""
        prompt = "This is a test prompt for stability"
        hash1 = compute_prompt_hash(prompt)
        hash2 = compute_prompt_hash(prompt)
        assert hash1 == hash2
    
    def test_hash_uniqueness(self):
        """Test that different prompts produce different hashes."""
        prompt1 = "First prompt"
        prompt2 = "Second prompt"
        hash1 = compute_prompt_hash(prompt1)
        hash2 = compute_prompt_hash(prompt2)
        assert hash1 != hash2
    
    def test_hash_format(self):
        """Test that hash is valid SHA-256 hex string."""
        prompt = "Test prompt"
        hash_value = compute_prompt_hash(prompt)
        assert len(hash_value) == 64  # SHA-256 produces 64 hex chars
        assert all(c in '0123456789abcdef' for c in hash_value)
    
    def test_hash_whitespace_sensitivity(self):
        """Test that whitespace differences produce different hashes."""
        prompt1 = "Test prompt"
        prompt2 = "Test  prompt"  # Extra space
        hash1 = compute_prompt_hash(prompt1)
        hash2 = compute_prompt_hash(prompt2)
        assert hash1 != hash2


class TestJSONLOperations:
    """Test suite for JSONL operations."""
    
    def test_append_jsonl_creates_file(self):
        """Test that append_jsonl creates file if it doesn't exist."""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "test.jsonl"
            data = {"key": "value"}
            append_jsonl(file_path, data)
            assert file_path.exists()
    
    def test_append_jsonl_format(self):
        """Test that each line is valid JSON."""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "test.jsonl"
            data1 = {"id": 1, "name": "first"}
            data2 = {"id": 2, "name": "second"}
            
            append_jsonl(file_path, data1)
            append_jsonl(file_path, data2)
            
            lines = file_path.read_text().strip().split('\n')
            assert len(lines) == 2
            
            # Each line should be valid JSON
            parsed1 = json.loads(lines[0])
            parsed2 = json.loads(lines[1])
            assert parsed1 == data1
            assert parsed2 == data2
    
    def test_append_jsonl_preserves_existing(self):
        """Test that append doesn't overwrite existing content."""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "test.jsonl"
            
            # Write initial data
            append_jsonl(file_path, {"first": 1})
            append_jsonl(file_path, {"second": 2})
            append_jsonl(file_path, {"third": 3})
            
            lines = file_path.read_text().strip().split('\n')
            assert len(lines) == 3


class TestSchemaValidation:
    """Test suite for schema validation."""
    
    def test_validation_pass(self):
        """Test validation passes with valid data."""
        output = {
            "run_id": "test_123",
            "timestamp": "2024-01-01T00:00:00",
            "orchestrator_version": "1.0",
            "prompt_library_hash": "abc123",
            "user_goal": "Test goal",
            "context_payload": {},
            "definition_of_done": [],
        }
        result = validate_agent_output(output, RunMetadata)
        assert result["passed"] is True
        assert len(result["errors"]) == 0
    
    def test_validation_fail_missing_field(self):
        """Test validation fails with missing required field."""
        output = {
            "run_id": "test_123",
            # Missing required fields
        }
        result = validate_agent_output(output, RunMetadata)
        assert result["passed"] is False
        assert len(result["errors"]) > 0
    
    def test_validation_fail_wrong_type(self):
        """Test validation fails with wrong field type."""
        output = {
            "run_id": "test_123",
            "timestamp": "2024-01-01T00:00:00",
            "orchestrator_version": "1.0",
            "prompt_library_hash": "abc123",
            "user_goal": "Test goal",
            "context_payload": {},
            "definition_of_done": "should be list",  # Wrong type
        }
        result = validate_agent_output(output, RunMetadata)
        assert result["passed"] is False
        assert len(result["errors"]) > 0
    
    def test_validation_handles_json_string(self):
        """Test validation can handle JSON string input."""
        output_dict = {
            "run_id": "test_123",
            "timestamp": "2024-01-01T00:00:00",
            "orchestrator_version": "1.0",
            "prompt_library_hash": "abc123",
            "user_goal": "Test goal",
            "context_payload": {},
            "definition_of_done": [],
        }
        output_str = json.dumps(output_dict)
        result = validate_agent_output(output_str, RunMetadata)
        assert result["passed"] is True


class TestOrchestratorLogger:
    """Test suite for OrchestratorLogger."""
    
    def test_logger_initialization(self):
        """Test logger initialization creates necessary directories."""
        with tempfile.TemporaryDirectory() as tmpdir:
            logger = OrchestratorLogger(tmpdir)
            assert logger.run_dir.exists()
            assert logger.run_id
    
    def test_log_run_metadata(self):
        """Test logging run metadata."""
        with tempfile.TemporaryDirectory() as tmpdir:
            logger = OrchestratorLogger(tmpdir)
            success = logger.log_run_metadata(
                orchestrator_version="1.0",
                prompt_library_hash="abc123",
                user_goal="Test goal",
                context_payload={"key": "value"},
                definition_of_done=["Task 1", "Task 2"],
            )
            assert success
            assert logger.run_json_path.exists()
            
            # Verify content
            data = json.loads(logger.run_json_path.read_text())
            assert data["run_id"] == logger.run_id
            assert data["orchestrator_version"] == "1.0"
            assert data["user_goal"] == "Test goal"
    
    def test_log_step(self):
        """Test logging step event."""
        with tempfile.TemporaryDirectory() as tmpdir:
            logger = OrchestratorLogger(tmpdir)
            success = logger.log_step(
                step_id="step_001",
                agent_id="test_agent",
                model="gpt-4",
                prompt_text="Test prompt",
                input_payload={"input": "data"},
                raw_output="Test output",
                parsed_output={"result": "success"},
                timing_ms=123.45,
            )
            assert success
            assert logger.steps_jsonl_path.exists()
            
            # Verify JSONL format
            lines = logger.steps_jsonl_path.read_text().strip().split('\n')
            assert len(lines) == 1
            data = json.loads(lines[0])
            assert data["step_id"] == "step_001"
            assert data["agent_id"] == "test_agent"
    
    def test_log_decision(self):
        """Test logging decision."""
        with tempfile.TemporaryDirectory() as tmpdir:
            logger = OrchestratorLogger(tmpdir)
            success = logger.log_decision(
                decision_id="dec_001",
                decision_type="stack_choice",
                chosen="React",
                rationale="Modern and popular",
                confidence=0.8,
                reversible=True,
                validation_plan="Check compatibility",
                alternatives=["Vue", "Angular"],
            )
            assert success
            assert logger.decisions_jsonl_path.exists()
            
            lines = logger.decisions_jsonl_path.read_text().strip().split('\n')
            data = json.loads(lines[0])
            assert data["decision_id"] == "dec_001"
            assert data["chosen"] == "React"
            assert data["confidence"] == 0.8
    
    def test_log_conflict(self):
        """Test logging conflict."""
        with tempfile.TemporaryDirectory() as tmpdir:
            logger = OrchestratorLogger(tmpdir)
            success = logger.log_conflict(
                conflict_id="conf_001",
                artifacts_involved=["architecture.md", "code.js"],
                conflict_summary="Framework mismatch",
                resolution="Used architecture.md as source of truth",
                reason="Architecture was defined first",
                followup_action="Update code to match",
            )
            assert success
            assert logger.conflicts_jsonl_path.exists()
    
    def test_fail_open_behavior(self):
        """Test that logging failures don't crash the orchestrator."""
        with tempfile.TemporaryDirectory() as tmpdir:
            logger = OrchestratorLogger(tmpdir)
            
            # Try to log with invalid data that would normally fail
            # (confidence out of range)
            try:
                success = logger.log_decision(
                    decision_id="dec_001",
                    decision_type="test",
                    chosen="option",
                    rationale="test",
                    confidence=2.0,  # Invalid: should be 0-1
                    reversible=True,
                    validation_plan="test",
                )
                # Should fail but not raise exception
                assert not success
                assert logger.has_logging_errors()
            except Exception as e:
                pytest.fail(f"Logging should not raise exception: {e}")
    
    def test_redaction_in_step_logging(self):
        """Test that secrets are redacted in step logs."""
        with tempfile.TemporaryDirectory() as tmpdir:
            logger = OrchestratorLogger(tmpdir)
            logger.log_step(
                step_id="step_001",
                agent_id="test_agent",
                model="gpt-4",
                prompt_text="Test prompt",
                input_payload={"api_key": "sk_test_1234567890abcdefghij"},
                raw_output="API key: sk_test_1234567890abcdefghij",
            )
            
            content = logger.steps_jsonl_path.read_text()
            assert 'sk_test_1234567890abcdefghij' not in content
            assert '[REDACTED]' in content


class TestStackDetection:
    """Test suite for stack detection."""
    
    def test_detect_react_frontend(self):
        """Test detection of React frontend."""
        with tempfile.TemporaryDirectory() as tmpdir:
            run_dir = Path(tmpdir)
            package_json = run_dir / "package.json"
            package_json.write_text(json.dumps({
                "dependencies": {"react": "^18.0.0"}
            }))
            
            stacks = detect_stacks(run_dir)
            assert stacks["frontend"] == "React"
    
    def test_detect_python_backend(self):
        """Test detection of Python backend."""
        with tempfile.TemporaryDirectory() as tmpdir:
            run_dir = Path(tmpdir)
            (run_dir / "requirements.txt").write_text("fastapi\nuvicorn")
            
            stacks = detect_stacks(run_dir)
            assert stacks["backend"] == "Python"
    
    def test_detect_empty_dir(self):
        """Test detection with empty directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            run_dir = Path(tmpdir)
            stacks = detect_stacks(run_dir)
            assert stacks["frontend"] is None
            assert stacks["backend"] is None
            assert stacks["db"] is None


class TestFileHashing:
    """Test suite for file hashing."""
    
    def test_file_hash_stability(self):
        """Test that same file produces same hash."""
        with tempfile.TemporaryDirectory() as tmpdir:
            file_path = Path(tmpdir) / "test.txt"
            file_path.write_text("Test content")
            
            hash1 = compute_file_hash(file_path)
            hash2 = compute_file_hash(file_path)
            assert hash1 == hash2
    
    def test_file_hash_uniqueness(self):
        """Test that different files produce different hashes."""
        with tempfile.TemporaryDirectory() as tmpdir:
            file1 = Path(tmpdir) / "test1.txt"
            file2 = Path(tmpdir) / "test2.txt"
            file1.write_text("Content 1")
            file2.write_text("Content 2")
            
            hash1 = compute_file_hash(file1)
            hash2 = compute_file_hash(file2)
            assert hash1 != hash2
