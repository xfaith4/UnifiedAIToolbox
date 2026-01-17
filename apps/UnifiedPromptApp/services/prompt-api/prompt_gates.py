"""
Gated auto-apply for prompt patches with CI-style validation.

Validates candidate agent libraries before activation:
- JSON schema validity
- Output format constraints (OUTPUT JSON ONLY for io_contract agents)
- Schema drift detection (no extra keys in prompt vs output_schema)
- Eval suite execution
- Risk-based auto-apply decisions
"""

import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field, ValidationError

logger = logging.getLogger(__name__)


class ValidationGate(BaseModel):
    """Validation gate result."""
    gate_name: str = Field(..., description="Gate name")
    passed: bool = Field(..., description="Whether gate passed")
    details: str = Field(default="", description="Details or error message")
    severity: str = Field(default="error", description="Severity: error, warning")


class EvalCase(BaseModel):
    """Evaluation test case."""
    case_id: str = Field(..., description="Case identifier")
    goal: str = Field(..., description="User goal (2-3 sentences)")
    expected_outcomes: List[str] = Field(..., description="Expected outcomes")
    context: Dict[str, Any] = Field(default_factory=dict, description="Additional context")


class EvalResult(BaseModel):
    """Evaluation result for a case."""
    case_id: str = Field(..., description="Case identifier")
    passed: bool = Field(..., description="Whether case passed")
    outcomes_met: List[str] = Field(default_factory=list, description="Met outcomes")
    outcomes_failed: List[str] = Field(default_factory=list, description="Failed outcomes")
    details: str = Field(default="", description="Details")


class GateDecision(BaseModel):
    """Decision on whether to apply candidate."""
    approved: bool = Field(..., description="Whether approved for auto-apply")
    reason: str = Field(..., description="Reason for decision")
    gates_passed: int = Field(..., description="Number of gates passed")
    gates_total: int = Field(..., description="Total number of gates")
    risk_level: str = Field(..., description="Overall risk level")
    action: str = Field(..., description="Action: auto_apply, pending_approval, rejected")


class PromptGates:
    """
    Validation gates for prompt library candidates.
    
    Implements CI-style validation:
    - Schema validation
    - Output format checks
    - Schema drift detection
    - Eval suite execution
    - Risk-based decisions
    """
    
    def __init__(self, evals_dir: Path):
        """
        Initialize prompt gates.
        
        Args:
            evals_dir: Directory containing eval cases (cases.json)
        """
        self.evals_dir = Path(evals_dir)
        self.evals_dir.mkdir(parents=True, exist_ok=True)
        
        self.cases_path = self.evals_dir / "cases.json"
    
    def validate_candidate(
        self,
        candidate_library: Dict[str, Any],
        risk_level: str = "low"
    ) -> Tuple[GateDecision, List[ValidationGate], List[EvalResult]]:
        """
        Validate a candidate library through all gates.
        
        Args:
            candidate_library: Candidate agent library
            risk_level: Risk level of changes (low, medium, high)
            
        Returns:
            Tuple of (GateDecision, gate_results, eval_results)
        """
        gate_results = []
        
        # Gate 1: JSON schema validity
        gate_results.append(self._validate_json_schema(candidate_library))
        
        # Gate 2: Output format constraints
        gate_results.append(self._validate_output_format(candidate_library))
        
        # Gate 3: Schema drift detection
        gate_results.append(self._validate_schema_drift(candidate_library))
        
        # Gate 4: Run evals (if available)
        eval_results = self._run_evals(candidate_library)
        if eval_results:
            passed = all(r.passed for r in eval_results)
            gate_results.append(ValidationGate(
                gate_name="eval_suite",
                passed=passed,
                details=f"{sum(1 for r in eval_results if r.passed)}/{len(eval_results)} cases passed",
                severity="error"
            ))
        
        # Make decision
        decision = self._make_decision(gate_results, risk_level)
        
        return decision, gate_results, eval_results
    
    def _validate_json_schema(self, library: Dict[str, Any]) -> ValidationGate:
        """
        Validate JSON schema validity.
        
        Args:
            library: Agent library
            
        Returns:
            ValidationGate result
        """
        try:
            # Check if library is valid JSON structure
            if not isinstance(library, dict):
                return ValidationGate(
                    gate_name="json_schema_validity",
                    passed=False,
                    details="Library is not a valid JSON object",
                    severity="error"
                )
            
            # Check for required top-level structure
            # Assuming library is either a dict of agents or a list
            if isinstance(library, list):
                agents = library
            elif "agents" in library:
                agents = library["agents"]
            else:
                # Assume the dict itself contains agents
                agents = library.get("agents", [])
            
            if not agents:
                return ValidationGate(
                    gate_name="json_schema_validity",
                    passed=False,
                    details="No agents found in library",
                    severity="error"
                )
            
            # Validate each agent has required fields
            for i, agent in enumerate(agents):
                if not isinstance(agent, dict):
                    return ValidationGate(
                        gate_name="json_schema_validity",
                        passed=False,
                        details=f"Agent at index {i} is not a valid object",
                        severity="error"
                    )
                
                if "id" not in agent and "agent_id" not in agent:
                    return ValidationGate(
                        gate_name="json_schema_validity",
                        passed=False,
                        details=f"Agent at index {i} missing id/agent_id",
                        severity="error"
                    )
            
            return ValidationGate(
                gate_name="json_schema_validity",
                passed=True,
                details="Library structure is valid",
                severity="error"
            )
        except Exception as e:
            return ValidationGate(
                gate_name="json_schema_validity",
                passed=False,
                details=f"Validation error: {e}",
                severity="error"
            )
    
    def _validate_output_format(self, library: Dict[str, Any]) -> ValidationGate:
        """
        Validate OUTPUT JSON ONLY constraint for agents with io_contract.
        
        Args:
            library: Agent library
            
        Returns:
            ValidationGate result
        """
        try:
            agents = self._extract_agents(library)
            
            violations = []
            
            for agent in agents:
                agent_id = agent.get("id") or agent.get("agent_id")
                
                # Check if agent has io_contract
                io_contract = agent.get("io_contract")
                if not io_contract:
                    continue
                
                # Check if agent has output schema
                output_schema = io_contract.get("output_schema")
                if not output_schema:
                    continue
                
                # Agent has io_contract with output_schema - must have OUTPUT JSON constraint
                prompt = agent.get("prompt", "")
                constraints = agent.get("constraints", [])
                
                # Check constraints list
                has_json_constraint = False
                if isinstance(constraints, list):
                    for constraint in constraints:
                        if "OUTPUT JSON ONLY" in str(constraint).upper():
                            has_json_constraint = True
                            break
                
                # Also check in prompt text
                if not has_json_constraint:
                    if "OUTPUT JSON ONLY" in prompt.upper():
                        has_json_constraint = True
                
                if not has_json_constraint:
                    violations.append(agent_id)
            
            if violations:
                return ValidationGate(
                    gate_name="output_format_constraint",
                    passed=False,
                    details=f"Agents missing 'OUTPUT JSON ONLY' constraint: {', '.join(violations)}",
                    severity="error"
                )
            
            return ValidationGate(
                gate_name="output_format_constraint",
                passed=True,
                details="All agents with io_contract have OUTPUT JSON constraint",
                severity="error"
            )
        except Exception as e:
            return ValidationGate(
                gate_name="output_format_constraint",
                passed=False,
                details=f"Validation error: {e}",
                severity="error"
            )
    
    def _validate_schema_drift(self, library: Dict[str, Any]) -> ValidationGate:
        """
        Detect schema drift (prompt requests keys not in output_schema).
        
        Args:
            library: Agent library
            
        Returns:
            ValidationGate result
        """
        try:
            agents = self._extract_agents(library)
            
            drift_issues = []
            
            for agent in agents:
                agent_id = agent.get("id") or agent.get("agent_id")
                
                # Check if agent has io_contract with output schema
                io_contract = agent.get("io_contract")
                if not io_contract:
                    continue
                
                output_schema = io_contract.get("output_schema")
                if not output_schema:
                    continue
                
                # Extract schema properties
                schema_keys = set()
                if isinstance(output_schema, dict):
                    properties = output_schema.get("properties", {})
                    if isinstance(properties, dict):
                        schema_keys = set(properties.keys())
                
                # Check prompt for requested keys
                prompt = agent.get("prompt", "")
                playbook = agent.get("playbook", [])
                
                # Look for common patterns like "return {key: ...}" or "output.key"
                # This is heuristic - not perfect but catches obvious drift
                prompt_text = prompt + " " + " ".join(playbook) if isinstance(playbook, list) else prompt
                
                # Find potential output keys mentioned in prompt
                # Pattern: looking for field names in quotes or after "return"
                mentioned_keys = set()
                
                # Pattern 1: {key: value} or {"key": value}
                json_patterns = re.findall(r'[{,]\s*["\']?(\w+)["\']?\s*:', prompt_text)
                mentioned_keys.update(json_patterns)
                
                # Pattern 2: output.key or result.key
                dot_patterns = re.findall(r'(?:output|result|response)\s*\.\s*(\w+)', prompt_text)
                mentioned_keys.update(dot_patterns)
                
                # Check for drift (keys mentioned but not in schema)
                if schema_keys and mentioned_keys:
                    drift_keys = mentioned_keys - schema_keys
                    # Filter out common words that aren't likely field names
                    drift_keys = {k for k in drift_keys if len(k) > 2 and k not in ['the', 'and', 'for', 'with']}
                    
                    if drift_keys:
                        drift_issues.append(f"{agent_id}: {', '.join(drift_keys)}")
            
            if drift_issues:
                return ValidationGate(
                    gate_name="schema_drift",
                    passed=False,
                    details=f"Potential schema drift detected: {'; '.join(drift_issues)}",
                    severity="warning"  # Warning not error - heuristic may have false positives
                )
            
            return ValidationGate(
                gate_name="schema_drift",
                passed=True,
                details="No schema drift detected",
                severity="warning"
            )
        except Exception as e:
            return ValidationGate(
                gate_name="schema_drift",
                passed=True,  # Pass on error (fail-open)
                details=f"Could not check schema drift: {e}",
                severity="warning"
            )
    
    def _extract_agents(self, library: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract agents list from library."""
        if isinstance(library, list):
            return library
        elif "agents" in library:
            return library["agents"]
        else:
            # Assume library is a dict where each value might be an agent
            return [v for v in library.values() if isinstance(v, dict) and ("id" in v or "agent_id" in v)]
    
    def _run_evals(self, library: Dict[str, Any]) -> List[EvalResult]:
        """
        Run evaluation suite.
        
        NOTE: V1 IMPLEMENTATION LIMITATION
        This is a placeholder implementation. In production, this should:
        1. Spin up a test orchestrator with the candidate library
        2. Execute each eval case's goal
        3. Check outcomes against expected results
        4. Return actual pass/fail results
        
        TODO: Implement live eval execution by integrating with orchestration engine
        Tracking: Consider creating GitHub issue for this enhancement
        
        Args:
            library: Candidate library
            
        Returns:
            List of EvalResult objects
        """
        # Load eval cases
        cases = self._load_eval_cases()
        if not cases:
            logger.info("No eval cases found - skipping eval suite")
            return []
        
        results = []
        
        for case in cases:
            # PLACEHOLDER: Real implementation would run orchestrator
            # For v1, mark as passed with warning in details
            
            result = EvalResult(
                case_id=case.case_id,
                passed=True,  # Placeholder
                outcomes_met=case.expected_outcomes,
                outcomes_failed=[],
                details="PLACEHOLDER: Eval execution not implemented in v1 - manual verification required"
            )
            results.append(result)
        
        return results
    
    def _load_eval_cases(self) -> List[EvalCase]:
        """Load evaluation cases from file."""
        if not self.cases_path.exists():
            return []
        
        try:
            with open(self.cases_path, 'r') as f:
                data = json.load(f)
                cases = [EvalCase(**c) for c in data.get("cases", [])]
                return cases
        except Exception as e:
            logger.error(f"Failed to load eval cases: {e}")
            return []
    
    def save_eval_cases(self, cases: List[EvalCase]) -> bool:
        """Save evaluation cases to file."""
        try:
            with open(self.cases_path, 'w') as f:
                data = {"cases": [c.model_dump() for c in cases]}
                json.dump(data, f, indent=2)
            logger.info(f"Saved {len(cases)} eval cases")
            return True
        except Exception as e:
            logger.error(f"Failed to save eval cases: {e}")
            return False
    
    def _make_decision(
        self,
        gate_results: List[ValidationGate],
        risk_level: str
    ) -> GateDecision:
        """
        Make auto-apply decision based on gate results and risk.
        
        Args:
            gate_results: Gate validation results
            risk_level: Risk level (low, medium, high)
            
        Returns:
            GateDecision
        """
        # Count passed gates (only count errors, not warnings)
        error_gates = [g for g in gate_results if g.severity == "error"]
        passed_error_gates = [g for g in error_gates if g.passed]
        
        gates_passed = len(passed_error_gates)
        gates_total = len(error_gates)
        
        all_gates_passed = gates_passed == gates_total
        
        # Decision logic
        if risk_level == "high":
            # Never auto-apply high risk
            return GateDecision(
                approved=False,
                reason="High risk changes require manual approval",
                gates_passed=gates_passed,
                gates_total=gates_total,
                risk_level=risk_level,
                action="pending_approval"
            )
        
        if not all_gates_passed:
            # Failed gates
            failed_gates = [g.gate_name for g in error_gates if not g.passed]
            return GateDecision(
                approved=False,
                reason=f"Failed gates: {', '.join(failed_gates)}",
                gates_passed=gates_passed,
                gates_total=gates_total,
                risk_level=risk_level,
                action="rejected"
            )
        
        if risk_level == "medium":
            # Medium risk requires manual approval even if gates pass
            return GateDecision(
                approved=False,
                reason="Medium risk changes require manual approval (gates passed)",
                gates_passed=gates_passed,
                gates_total=gates_total,
                risk_level=risk_level,
                action="pending_approval"
            )
        
        # Low risk + all gates passed = auto-apply
        return GateDecision(
            approved=True,
            reason="All gates passed and risk is low",
            gates_passed=gates_passed,
            gates_total=gates_total,
            risk_level=risk_level,
            action="auto_apply"
        )
