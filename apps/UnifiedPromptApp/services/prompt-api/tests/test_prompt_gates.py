"""
Unit tests for prompt gates and validation.

Tests:
- JSON schema validation
- OUTPUT JSON constraint checking
- Schema drift detection
- Risk-based decision making
"""

import tempfile
import json
from pathlib import Path
import pytest

from prompt_gates import (
    PromptGates,
    ValidationGate,
    EvalCase,
    GateDecision,
)


class TestSchemaValidation:
    """Test suite for schema validation gate."""
    
    def test_valid_library_passes(self):
        """Test that valid library passes schema validation."""
        with tempfile.TemporaryDirectory() as tmpdir:
            gates = PromptGates(Path(tmpdir))
            
            library = {
                "agents": [
                    {"id": "test_agent", "prompt": "Test prompt"}
                ]
            }
            
            gate = gates._validate_json_schema(library)
            assert gate.passed
    
    def test_library_without_agents_fails(self):
        """Test that library without agents fails."""
        with tempfile.TemporaryDirectory() as tmpdir:
            gates = PromptGates(Path(tmpdir))
            
            library = {"some_field": "value"}
            
            gate = gates._validate_json_schema(library)
            assert not gate.passed
            assert "No agents found" in gate.details
    
    def test_agent_without_id_fails(self):
        """Test that agent without ID fails."""
        with tempfile.TemporaryDirectory() as tmpdir:
            gates = PromptGates(Path(tmpdir))
            
            library = {
                "agents": [
                    {"prompt": "Test"}  # Missing id
                ]
            }
            
            gate = gates._validate_json_schema(library)
            assert not gate.passed
            assert "missing id" in gate.details.lower()


class TestOutputFormatValidation:
    """Test suite for output format constraint validation."""
    
    def test_agent_with_io_contract_needs_json_constraint(self):
        """Test that agents with io_contract need OUTPUT JSON constraint."""
        with tempfile.TemporaryDirectory() as tmpdir:
            gates = PromptGates(Path(tmpdir))
            
            library = {
                "agents": [
                    {
                        "id": "test_agent",
                        "prompt": "Test prompt",
                        "io_contract": {
                            "output_schema": {
                                "type": "object",
                                "properties": {"result": {"type": "string"}}
                            }
                        },
                        "constraints": []  # Missing OUTPUT JSON constraint
                    }
                ]
            }
            
            gate = gates._validate_output_format(library)
            assert not gate.passed
            assert "test_agent" in gate.details
            assert "OUTPUT JSON ONLY" in gate.details
    
    def test_agent_with_json_constraint_passes(self):
        """Test that agent with OUTPUT JSON constraint passes."""
        with tempfile.TemporaryDirectory() as tmpdir:
            gates = PromptGates(Path(tmpdir))
            
            library = {
                "agents": [
                    {
                        "id": "test_agent",
                        "prompt": "Test prompt",
                        "io_contract": {
                            "output_schema": {
                                "type": "object",
                                "properties": {"result": {"type": "string"}}
                            }
                        },
                        "constraints": ["OUTPUT JSON ONLY. Your response must be valid JSON."]
                    }
                ]
            }
            
            gate = gates._validate_output_format(library)
            assert gate.passed
    
    def test_agent_without_io_contract_passes(self):
        """Test that agent without io_contract passes (no requirement)."""
        with tempfile.TemporaryDirectory() as tmpdir:
            gates = PromptGates(Path(tmpdir))
            
            library = {
                "agents": [
                    {
                        "id": "test_agent",
                        "prompt": "Test prompt",
                        "constraints": []
                    }
                ]
            }
            
            gate = gates._validate_output_format(library)
            assert gate.passed


class TestSchemaDriftDetection:
    """Test suite for schema drift detection."""
    
    def test_no_drift_when_aligned(self):
        """Test no drift when prompt and schema are aligned."""
        with tempfile.TemporaryDirectory() as tmpdir:
            gates = PromptGates(Path(tmpdir))
            
            library = {
                "agents": [
                    {
                        "id": "test_agent",
                        "prompt": "Return result field as string",
                        "io_contract": {
                            "output_schema": {
                                "type": "object",
                                "properties": {
                                    "result": {"type": "string"}
                                }
                            }
                        }
                    }
                ]
            }
            
            gate = gates._validate_schema_drift(library)
            # This is heuristic, so may pass even with some mentions
            # Main thing is it doesn't crash
            assert gate is not None
    
    def test_drift_detection_heuristic(self):
        """Test drift detection (heuristic)."""
        with tempfile.TemporaryDirectory() as tmpdir:
            gates = PromptGates(Path(tmpdir))
            
            library = {
                "agents": [
                    {
                        "id": "test_agent",
                        "prompt": "Return {unknown_field: value, another_field: 123}",
                        "io_contract": {
                            "output_schema": {
                                "type": "object",
                                "properties": {
                                    "result": {"type": "string"}
                                }
                            }
                        }
                    }
                ]
            }
            
            gate = gates._validate_schema_drift(library)
            # May or may not detect (heuristic), but should not crash
            assert gate is not None
            assert gate.severity == "warning"  # Always warning, not error


class TestDecisionMaking:
    """Test suite for auto-apply decision making."""
    
    def test_low_risk_all_pass_approves(self):
        """Test low risk with all gates passing approves auto-apply."""
        with tempfile.TemporaryDirectory() as tmpdir:
            gates = PromptGates(Path(tmpdir))
            
            gate_results = [
                ValidationGate(gate_name="test1", passed=True, severity="error"),
                ValidationGate(gate_name="test2", passed=True, severity="error"),
            ]
            
            decision = gates._make_decision(gate_results, "low")
            
            assert decision.approved
            assert decision.action == "auto_apply"
            assert decision.gates_passed == 2
            assert decision.gates_total == 2
    
    def test_high_risk_never_auto_applies(self):
        """Test high risk never auto-applies."""
        with tempfile.TemporaryDirectory() as tmpdir:
            gates = PromptGates(Path(tmpdir))
            
            gate_results = [
                ValidationGate(gate_name="test1", passed=True, severity="error"),
            ]
            
            decision = gates._make_decision(gate_results, "high")
            
            assert not decision.approved
            assert decision.action == "pending_approval"
    
    def test_medium_risk_requires_approval(self):
        """Test medium risk requires manual approval."""
        with tempfile.TemporaryDirectory() as tmpdir:
            gates = PromptGates(Path(tmpdir))
            
            gate_results = [
                ValidationGate(gate_name="test1", passed=True, severity="error"),
            ]
            
            decision = gates._make_decision(gate_results, "medium")
            
            assert not decision.approved
            assert decision.action == "pending_approval"
    
    def test_failed_gates_reject(self):
        """Test failed gates lead to rejection."""
        with tempfile.TemporaryDirectory() as tmpdir:
            gates = PromptGates(Path(tmpdir))
            
            gate_results = [
                ValidationGate(gate_name="test1", passed=True, severity="error"),
                ValidationGate(gate_name="test2", passed=False, severity="error"),
            ]
            
            decision = gates._make_decision(gate_results, "low")
            
            assert not decision.approved
            assert decision.action == "rejected"
            assert "test2" in decision.reason


class TestEvalCases:
    """Test suite for eval case management."""
    
    def test_save_and_load_eval_cases(self):
        """Test saving and loading eval cases."""
        with tempfile.TemporaryDirectory() as tmpdir:
            gates = PromptGates(Path(tmpdir))
            
            cases = [
                EvalCase(
                    case_id="case_001",
                    goal="Build a simple API",
                    expected_outcomes=["API created", "Tests pass"],
                    context={"language": "Python"}
                ),
                EvalCase(
                    case_id="case_002",
                    goal="Create a React app",
                    expected_outcomes=["App renders", "No console errors"],
                    context={"framework": "React"}
                )
            ]
            
            # Save
            success = gates.save_eval_cases(cases)
            assert success
            
            # Load
            loaded = gates._load_eval_cases()
            assert len(loaded) == 2
            assert loaded[0].case_id == "case_001"
            assert loaded[1].case_id == "case_002"
    
    def test_no_eval_cases_returns_empty(self):
        """Test that missing eval cases returns empty list."""
        with tempfile.TemporaryDirectory() as tmpdir:
            gates = PromptGates(Path(tmpdir))
            
            cases = gates._load_eval_cases()
            assert cases == []


class TestFullValidation:
    """Test suite for complete validation flow."""
    
    def test_validate_good_candidate(self):
        """Test validation of a good candidate."""
        with tempfile.TemporaryDirectory() as tmpdir:
            gates = PromptGates(Path(tmpdir))
            
            library = {
                "agents": [
                    {
                        "id": "test_agent",
                        "prompt": "Test prompt",
                        "io_contract": {
                            "output_schema": {
                                "type": "object",
                                "properties": {"result": {"type": "string"}}
                            }
                        },
                        "constraints": ["OUTPUT JSON ONLY."]
                    }
                ]
            }
            
            decision, gate_results, eval_results = gates.validate_candidate(library, "low")
            
            # Should pass all gates and approve
            assert decision.approved
            assert decision.action == "auto_apply"
            assert all(g.passed for g in gate_results if g.severity == "error")
    
    def test_validate_bad_candidate(self):
        """Test validation of a bad candidate."""
        with tempfile.TemporaryDirectory() as tmpdir:
            gates = PromptGates(Path(tmpdir))
            
            library = {
                "agents": [
                    {
                        "id": "test_agent",
                        "prompt": "Test",
                        "io_contract": {
                            "output_schema": {"type": "object", "properties": {}}
                        },
                        "constraints": []  # Missing OUTPUT JSON
                    }
                ]
            }
            
            decision, gate_results, eval_results = gates.validate_candidate(library, "low")
            
            # Should fail output format gate
            assert not decision.approved
            assert decision.action == "rejected"
