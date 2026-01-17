"""
Unit tests for stack validation module.

Tests:
- Stack lock creation and loading
- Violation detection for frontend/backend/package manager mismatches
- Retry logic and constraint messages
"""

import tempfile
import json
from pathlib import Path
import pytest

from stack_validator import (
    StackValidator,
    StackLock,
    StackViolation,
)


class TestStackValidator:
    """Test suite for stack validator."""
    
    def test_create_and_load_stack_lock(self):
        """Test creating and loading a stack lock."""
        with tempfile.TemporaryDirectory() as tmpdir:
            run_dir = Path(tmpdir)
            validator = StackValidator(run_dir)
            
            # Create lock
            lock = validator.create_stack_lock(
                run_id="test_001",
                frontend="React",
                backend="Python/FastAPI",
                db="PostgreSQL",
                package_manager="npm",
            )
            
            assert lock.run_id == "test_001"
            assert lock.frontend == "React"
            assert lock.backend == "Python/FastAPI"
            assert lock.locked is True
            
            # Load lock
            loaded = validator.load_stack_lock()
            assert loaded is not None
            assert loaded.frontend == "React"
            assert loaded.backend == "Python/FastAPI"
    
    def test_validate_vue_when_react_locked(self):
        """Test that Vue files are rejected when React is locked."""
        with tempfile.TemporaryDirectory() as tmpdir:
            run_dir = Path(tmpdir)
            validator = StackValidator(run_dir)
            
            # Lock to React
            validator.create_stack_lock(
                run_id="test_002",
                frontend="React",
                backend="Node.js/Express",
            )
            
            # Create a .vue file
            vue_file = run_dir / "component.vue"
            vue_file.write_text("<template><div>Test</div></template>")
            
            # Validate - should find violation
            is_valid, violations = validator.validate_artifact(vue_file)
            
            assert not is_valid
            assert len(violations) > 0
            assert violations[0].violation_type == "frontend_mismatch"
            assert violations[0].severity == "critical"
    
    def test_validate_react_when_vue_locked(self):
        """Test that React files are rejected when Vue is locked."""
        with tempfile.TemporaryDirectory() as tmpdir:
            run_dir = Path(tmpdir)
            validator = StackValidator(run_dir)
            
            # Lock to Vue
            validator.create_stack_lock(
                run_id="test_003",
                frontend="Vue",
                backend="Node.js/Express",
            )
            
            # Create a React JSX file
            react_file = run_dir / "Component.jsx"
            react_file.write_text('import React from "react";\nexport default function Component() {}')
            
            # Validate - should find violation
            is_valid, violations = validator.validate_artifact(react_file)
            
            assert not is_valid
            assert len(violations) > 0
            assert violations[0].violation_type == "frontend_mismatch"
    
    def test_validate_flask_when_nodejs_locked(self):
        """Test that Flask is rejected when Node.js is locked."""
        with tempfile.TemporaryDirectory() as tmpdir:
            run_dir = Path(tmpdir)
            validator = StackValidator(run_dir)
            
            # Lock to Node.js
            validator.create_stack_lock(
                run_id="test_004",
                backend="Node.js/Express",
            )
            
            # Create Flask app
            flask_file = run_dir / "app.py"
            flask_file.write_text('from flask import Flask\napp = Flask(__name__)')
            
            # Validate - should find violation
            is_valid, violations = validator.validate_artifact(flask_file)
            
            assert not is_valid
            assert len(violations) > 0
            assert violations[0].violation_type == "backend_mismatch"
            assert violations[0].severity == "critical"
    
    def test_validate_nodejs_when_python_locked(self):
        """Test that Node.js is rejected when Python is locked."""
        with tempfile.TemporaryDirectory() as tmpdir:
            run_dir = Path(tmpdir)
            validator = StackValidator(run_dir)
            
            # Lock to Python
            validator.create_stack_lock(
                run_id="test_005",
                backend="Python/FastAPI",
            )
            
            # Create Express app
            express_file = run_dir / "server.js"
            express_file.write_text('const express = require("express");\nconst app = express();')
            
            # Validate - should find violation
            is_valid, violations = validator.validate_artifact(express_file)
            
            assert not is_valid
            assert len(violations) > 0
            assert violations[0].violation_type == "backend_mismatch"
    
    def test_validate_package_manager_mismatch(self):
        """Test package manager mismatch detection."""
        with tempfile.TemporaryDirectory() as tmpdir:
            run_dir = Path(tmpdir)
            validator = StackValidator(run_dir)
            
            # Lock to npm
            validator.create_stack_lock(
                run_id="test_006",
                package_manager="npm",
            )
            
            # Create yarn.lock
            yarn_lock = run_dir / "yarn.lock"
            yarn_lock.write_text("# Yarn lock file")
            
            # Validate - should find warning (not critical)
            is_valid, violations = validator.validate_artifact(yarn_lock)
            
            assert not is_valid
            assert len(violations) > 0
            assert violations[0].violation_type == "package_manager_mismatch"
            assert violations[0].severity == "warning"
    
    def test_validate_no_lock_allows_all(self):
        """Test that artifacts are valid when no lock exists."""
        with tempfile.TemporaryDirectory() as tmpdir:
            run_dir = Path(tmpdir)
            validator = StackValidator(run_dir)
            
            # No lock created
            
            # Create any file
            test_file = run_dir / "test.vue"
            test_file.write_text("<template>Test</template>")
            
            # Validate - should pass (no lock)
            is_valid, violations = validator.validate_artifact(test_file)
            
            assert is_valid
            assert len(violations) == 0
    
    def test_should_retry_on_critical_violation(self):
        """Test retry logic for critical violations."""
        with tempfile.TemporaryDirectory() as tmpdir:
            run_dir = Path(tmpdir)
            validator = StackValidator(run_dir)
            
            critical_violation = StackViolation(
                artifact_path="test.vue",
                violation_type="frontend_mismatch",
                expected="React",
                actual="Vue",
                severity="critical"
            )
            
            warning_violation = StackViolation(
                artifact_path="yarn.lock",
                violation_type="package_manager_mismatch",
                expected="npm",
                actual="yarn",
                severity="warning"
            )
            
            # Critical violation should trigger retry
            assert validator.should_retry([critical_violation]) is True
            
            # Warning only should not trigger retry
            assert validator.should_retry([warning_violation]) is False
            
            # Mixed should trigger retry
            assert validator.should_retry([critical_violation, warning_violation]) is True
    
    def test_get_retry_constraint_message(self):
        """Test retry constraint message generation."""
        with tempfile.TemporaryDirectory() as tmpdir:
            run_dir = Path(tmpdir)
            validator = StackValidator(run_dir)
            
            validator.create_stack_lock(
                run_id="test_007",
                frontend="React",
                backend="Python/FastAPI",
            )
            
            violation = StackViolation(
                artifact_path="component.vue",
                violation_type="frontend_mismatch",
                expected="React",
                actual="Vue",
                severity="critical"
            )
            
            message = validator.get_retry_constraint_message([violation])
            
            assert "STACK CONSTRAINT VIOLATION" in message
            assert "React" in message
            assert "Python/FastAPI" in message
            assert "component.vue" in message
    
    def test_violation_summary(self):
        """Test violation summary generation."""
        with tempfile.TemporaryDirectory() as tmpdir:
            run_dir = Path(tmpdir)
            validator = StackValidator(run_dir)
            
            violations = [
                StackViolation(
                    artifact_path="test1.vue",
                    violation_type="frontend_mismatch",
                    expected="React",
                    actual="Vue",
                    severity="critical"
                ),
                StackViolation(
                    artifact_path="yarn.lock",
                    violation_type="package_manager_mismatch",
                    expected="npm",
                    actual="yarn",
                    severity="warning"
                ),
            ]
            
            summary = validator.get_violation_summary(violations)
            
            assert "CRITICAL VIOLATIONS (1)" in summary
            assert "WARNINGS (1)" in summary
            assert "test1.vue" in summary
            assert "yarn.lock" in summary
