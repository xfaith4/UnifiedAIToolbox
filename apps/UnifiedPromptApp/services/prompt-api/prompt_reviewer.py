"""
Post-run reviewer for automatic prompt improvement.

Analyzes orchestration run traces and proposes structured patches to:
- Fix schema validation failures
- Reduce stack drift
- Improve output quality
- Address conflicts

Outputs structured PromptPatchPlan.json with evidence-linked proposals.
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class RootCause(BaseModel):
    """Root cause analysis entry."""
    type: str = Field(..., description="Cause type (e.g., schema_mismatch, missing_constraint)")
    evidence: List[str] = Field(..., description="Evidence references (step_ids, conflict_ids)")
    impact: str = Field(..., description="Impact description")


class RunDiagnosis(BaseModel):
    """Diagnosis of run issues."""
    root_causes: List[RootCause] = Field(default_factory=list, description="Identified root causes")
    metrics: Dict[str, Any] = Field(default_factory=dict, description="Run metrics")


class PatchOperation(BaseModel):
    """JSON Patch operation."""
    op: str = Field(..., description="Operation: replace, add, remove")
    path: str = Field(..., description="JSON pointer path")
    value: Optional[Any] = Field(None, description="Value for add/replace")


class PromptPatch(BaseModel):
    """Prompt patch proposal."""
    target: Dict[str, str] = Field(..., description="Target (agent_id, field)")
    change_type: str = Field(..., description="Change type: edit, insert, delete")
    patch: List[PatchOperation] = Field(..., description="JSON Patch operations")
    reason: str = Field(..., description="Reason for change")
    risk: str = Field(..., description="Risk level: low, medium, high")
    tests_required: List[str] = Field(default_factory=list, description="Required tests")


class RoutingChange(BaseModel):
    """Routing rule change proposal."""
    rule: str = Field(..., description="Routing rule change")
    risk: str = Field(..., description="Risk level")


class ValidatorChange(BaseModel):
    """Validator rule change proposal."""
    rule: str = Field(..., description="Validator rule change")
    risk: str = Field(..., description="Risk level")


class PromptPatchPlan(BaseModel):
    """Complete patch plan for a run."""
    run_id: str = Field(..., description="Run ID")
    timestamp: str = Field(..., description="ISO-8601 timestamp")
    run_diagnosis: RunDiagnosis = Field(..., description="Run diagnosis")
    patches: List[PromptPatch] = Field(default_factory=list, description="Prompt patches")
    routing_changes: List[RoutingChange] = Field(default_factory=list, description="Routing changes")
    validator_changes: List[ValidatorChange] = Field(default_factory=list, description="Validator changes")


class PromptReviewer:
    """
    Analyzes orchestration runs and proposes improvements.
    
    Reads run artifacts and generates structured patch plans with:
    - Evidence-based root cause analysis
    - Targeted prompt patches
    - Risk assessment
    - Required validation tests
    """
    
    def __init__(self, run_dir: Path):
        """
        Initialize prompt reviewer.
        
        Args:
            run_dir: Run directory containing trace artifacts
        """
        self.run_dir = Path(run_dir)
        self.run_json_path = self.run_dir / "run.json"
        self.steps_jsonl_path = self.run_dir / "steps.jsonl"
        self.decisions_jsonl_path = self.run_dir / "decisions.jsonl"
        self.conflicts_jsonl_path = self.run_dir / "conflicts.jsonl"
        self.artifacts_json_path = self.run_dir / "artifacts.json"
        self.verification_json_path = self.run_dir / "verification.json"
        self.stack_lock_path = self.run_dir / "stack_lock.json"
    
    def review_run(self) -> PromptPatchPlan:
        """
        Review a run and generate patch plan.
        
        Returns:
            PromptPatchPlan with diagnosis and proposed patches
        """
        run_id = self.run_dir.name
        
        # Load all artifacts
        run_data = self._load_json(self.run_json_path)
        steps = self._load_jsonl(self.steps_jsonl_path)
        decisions = self._load_jsonl(self.decisions_jsonl_path)
        conflicts = self._load_jsonl(self.conflicts_jsonl_path)
        artifacts = self._load_json(self.artifacts_json_path)
        verification = self._load_json(self.verification_json_path)
        stack_lock = self._load_json(self.stack_lock_path)
        
        # Analyze run
        diagnosis = self._diagnose_run(
            run_data, steps, decisions, conflicts, artifacts, verification, stack_lock
        )
        
        # Generate patches
        patches = self._generate_patches(diagnosis, steps, decisions, conflicts)
        
        # Generate routing/validator changes
        routing_changes = self._generate_routing_changes(diagnosis)
        validator_changes = self._generate_validator_changes(diagnosis)
        
        plan = PromptPatchPlan(
            run_id=run_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            run_diagnosis=diagnosis,
            patches=patches,
            routing_changes=routing_changes,
            validator_changes=validator_changes,
        )
        
        return plan
    
    def save_patch_plan(self, plan: PromptPatchPlan, output_path: Path) -> bool:
        """
        Save patch plan to file.
        
        Args:
            plan: Patch plan to save
            output_path: Output file path
            
        Returns:
            True if successful
        """
        try:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            with open(output_path, 'w') as f:
                json.dump(plan.model_dump(), f, indent=2)
            logger.info(f"Saved patch plan to {output_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to save patch plan: {e}")
            return False
    
    def _load_json(self, path: Path) -> Optional[Dict[str, Any]]:
        """Load JSON file."""
        if not path.exists():
            return None
        try:
            with open(path, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load {path}: {e}")
            return None
    
    def _load_jsonl(self, path: Path) -> List[Dict[str, Any]]:
        """Load JSONL file."""
        if not path.exists():
            return []
        try:
            records = []
            with open(path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line:
                        records.append(json.loads(line))
            return records
        except Exception as e:
            logger.error(f"Failed to load {path}: {e}")
            return []
    
    def _diagnose_run(
        self,
        run_data: Optional[Dict],
        steps: List[Dict],
        decisions: List[Dict],
        conflicts: List[Dict],
        artifacts: Optional[Dict],
        verification: Optional[Dict],
        stack_lock: Optional[Dict],
    ) -> RunDiagnosis:
        """
        Diagnose issues in the run.
        
        Returns:
            RunDiagnosis with root causes and metrics
        """
        root_causes = []
        metrics = {}
        
        # Count schema failures
        schema_failures = [s for s in steps if not s.get("schema_validation", {}).get("passed", False)]
        metrics["schema_failures"] = len(schema_failures)
        
        if schema_failures:
            evidence = [s["step_id"] for s in schema_failures]
            root_causes.append(RootCause(
                type="schema_validation_failure",
                evidence=evidence,
                impact=f"{len(schema_failures)} steps failed schema validation"
            ))
        
        # Check verification failures
        verification_failed = False
        if verification:
            for check in ["lint_result", "build_result", "unit_test_result", "smoke_test_result"]:
                result = verification.get(check)
                if result and not result.get("passed", False):
                    verification_failed = True
                    root_causes.append(RootCause(
                        type=f"{check}_failure",
                        evidence=[f"verification.{check}"],
                        impact=f"{check} failed: {result.get('output', 'No details')}"
                    ))
        
        metrics["verification_failed"] = verification_failed
        
        # Check stack drift
        stack_drift = len(conflicts) > 0
        metrics["stack_drift"] = stack_drift
        
        if conflicts:
            evidence = [c["conflict_id"] for c in conflicts]
            root_causes.append(RootCause(
                type="stack_drift",
                evidence=evidence,
                impact=f"{len(conflicts)} conflicts detected indicating stack inconsistencies"
            ))
        
        # Check missing OUTPUT JSON constraint
        for step in steps:
            parsed_output = step.get("parsed_output")
            if parsed_output is None and step.get("raw_output"):
                # Agent has raw output but failed to parse - likely missing JSON constraint
                root_causes.append(RootCause(
                    type="missing_output_json_constraint",
                    evidence=[step["step_id"]],
                    impact=f"Agent {step.get('agent_id')} produced non-JSON output"
                ))
        
        return RunDiagnosis(root_causes=root_causes, metrics=metrics)
    
    def _generate_patches(
        self,
        diagnosis: RunDiagnosis,
        steps: List[Dict],
        decisions: List[Dict],
        conflicts: List[Dict],
    ) -> List[PromptPatch]:
        """
        Generate prompt patches based on diagnosis.
        
        Returns:
            List of PromptPatch objects
        """
        patches = []
        
        # Find agents with schema failures
        schema_failure_agents = {}
        for cause in diagnosis.root_causes:
            if cause.type == "schema_validation_failure":
                for step_id in cause.evidence:
                    step = next((s for s in steps if s["step_id"] == step_id), None)
                    if step:
                        agent_id = step.get("agent_id")
                        if agent_id not in schema_failure_agents:
                            schema_failure_agents[agent_id] = []
                        schema_failure_agents[agent_id].append(step)
        
        # Generate patches for schema failures
        for agent_id, failed_steps in schema_failure_agents.items():
            # Find common error patterns
            error_msgs = []
            for step in failed_steps:
                errors = step.get("schema_validation", {}).get("errors", [])
                error_msgs.extend(errors)
            
            if error_msgs:
                # Propose adding/clarifying output schema constraint
                patches.append(PromptPatch(
                    target={"agent_id": agent_id, "field": "prompt"},
                    change_type="edit",
                    patch=[
                        PatchOperation(
                            op="add",
                            path="/constraints/-",
                            value="OUTPUT JSON ONLY. Your response must be valid JSON matching the output_schema."
                        )
                    ],
                    reason=f"Schema validation failed {len(failed_steps)} times. Errors: {error_msgs[:2]}",
                    risk="low",
                    tests_required=["schema_validation", "output_format"]
                ))
        
        # Find agents with missing OUTPUT JSON constraint
        for cause in diagnosis.root_causes:
            if cause.type == "missing_output_json_constraint":
                for step_id in cause.evidence:
                    step = next((s for s in steps if s["step_id"] == step_id), None)
                    if step:
                        agent_id = step.get("agent_id")
                        patches.append(PromptPatch(
                            target={"agent_id": agent_id, "field": "constraints"},
                            change_type="edit",
                            patch=[
                                PatchOperation(
                                    op="add",
                                    path="/-",
                                    value="OUTPUT JSON ONLY. Do not include markdown code fences, explanations, or prose."
                                )
                            ],
                            reason="Agent produced non-JSON output when JSON was expected",
                            risk="low",
                            tests_required=["output_format"]
                        ))
        
        # Generate patches for stack drift
        stack_drift_causes = [c for c in diagnosis.root_causes if c.type == "stack_drift"]
        if stack_drift_causes:
            for cause in stack_drift_causes:
                # Propose strengthening stack constraints
                patches.append(PromptPatch(
                    target={"agent_id": "Engineer", "field": "constraints"},
                    change_type="edit",
                    patch=[
                        PatchOperation(
                            op="add",
                            path="/-",
                            value="CRITICAL: Respect the locked technology stack. Do not deviate from specified frontend, backend, or database choices."
                        )
                    ],
                    reason=f"Stack drift detected: {cause.impact}",
                    risk="medium",
                    tests_required=["stack_consistency"]
                ))
        
        return patches
    
    def _generate_routing_changes(self, diagnosis: RunDiagnosis) -> List[RoutingChange]:
        """
        Generate routing rule changes.
        
        Returns:
            List of RoutingChange objects
        """
        changes = []
        
        # For now, no automatic routing changes (would require more context)
        # Future: analyze agent call patterns and suggest routing optimizations
        
        return changes
    
    def _generate_validator_changes(self, diagnosis: RunDiagnosis) -> List[ValidatorChange]:
        """
        Generate validator rule changes.
        
        Returns:
            List of ValidatorChange objects
        """
        changes = []
        
        # Suggest stronger validation rules based on failures
        if diagnosis.metrics.get("schema_failures", 0) > 0:
            changes.append(ValidatorChange(
                rule="Enforce JSON output validation for all agents with io_contract",
                risk="low"
            ))
        
        if diagnosis.metrics.get("stack_drift", False):
            changes.append(ValidatorChange(
                rule="Add pre-generation stack lock validation",
                risk="low"
            ))
        
        return changes
