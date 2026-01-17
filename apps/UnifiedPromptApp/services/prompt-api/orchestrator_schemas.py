"""
Pydantic schemas for orchestrator decision logging and verification.

These schemas define the structure for:
- Run-level metadata
- Step-level events
- Decision ledger entries
- Conflict logs
- Artifact manifests
- Verification results
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


class RunMetadata(BaseModel):
    """Run-level metadata for orchestration runs."""
    run_id: str = Field(..., description="Unique run identifier")
    timestamp: str = Field(..., description="ISO-8601 timestamp")
    orchestrator_version: str = Field(..., description="Version of orchestrator")
    prompt_library_hash: str = Field(..., description="Hash of prompt library at run time")
    user_goal: str = Field(..., description="Original 2-3 sentence goal")
    context_payload: Dict[str, Any] = Field(default_factory=dict, description="Context passed to orchestrator")
    definition_of_done: List[str] = Field(default_factory=list, description="Completion criteria")


class StepEvent(BaseModel):
    """Step-level event for agent calls."""
    step_id: str = Field(..., description="Unique step identifier")
    run_id: str = Field(..., description="Associated run ID")
    agent_id: str = Field(..., description="Agent identifier")
    model: str = Field(..., description="Model used")
    prompt_id: Optional[str] = Field(None, description="Prompt identifier if applicable")
    prompt_hash: str = Field(..., description="Hash of the prompt content")
    input_payload: Dict[str, Any] = Field(..., description="Exact JSON passed to agent")
    raw_output: str = Field(..., description="Exact text returned by agent")
    parsed_output: Optional[Dict[str, Any]] = Field(None, description="Parsed JSON output or null if parse failed")
    schema_validation: Dict[str, Any] = Field(
        default_factory=lambda: {"passed": False, "errors": []},
        description="Schema validation result"
    )
    timing_ms: Optional[float] = Field(None, description="Execution time in milliseconds")
    token_usage: Optional[Dict[str, int]] = Field(None, description="Token usage stats if available")


class Decision(BaseModel):
    """Decision ledger entry."""
    decision_id: str = Field(..., description="Unique decision identifier")
    run_id: str = Field(..., description="Associated run ID")
    step_id: Optional[str] = Field(None, description="Associated step ID if applicable")
    type: str = Field(..., description="Decision type (e.g., stack_choice, auth_strategy)")
    chosen: str = Field(..., description="Chosen option")
    alternatives: List[str] = Field(default_factory=list, description="Alternative options considered")
    rationale: str = Field(..., description="Reasoning for the decision")
    assumptions: List[str] = Field(default_factory=list, description="Assumptions made")
    constraints_referenced: List[str] = Field(default_factory=list, description="Constraints considered")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence level (0-1)")
    reversible: bool = Field(..., description="Whether decision can be reversed")
    validation_plan: str = Field(..., description="Plan for validating this decision")


class Conflict(BaseModel):
    """Conflict log entry."""
    conflict_id: str = Field(..., description="Unique conflict identifier")
    run_id: str = Field(..., description="Associated run ID")
    artifacts_involved: List[str] = Field(..., description="Artifacts that disagree")
    conflict_summary: str = Field(..., description="Description of the conflict")
    resolution: str = Field(..., description="How the conflict was resolved")
    reason: str = Field(..., description="Reason for the resolution approach")
    followup_action: str = Field(..., description="Follow-up action required")


class ArtifactFile(BaseModel):
    """Individual file in artifact manifest."""
    path: str = Field(..., description="Relative path to file")
    sha256: str = Field(..., description="SHA-256 hash of file content")
    size_bytes: int = Field(..., description="File size in bytes")


class DetectedStacks(BaseModel):
    """Detected technology stacks."""
    frontend: Optional[str] = Field(None, description="Detected frontend stack")
    backend: Optional[str] = Field(None, description="Detected backend stack")
    db: Optional[str] = Field(None, description="Detected database")


class ArtifactManifest(BaseModel):
    """Manifest of generated artifacts."""
    run_id: str = Field(..., description="Associated run ID")
    timestamp: str = Field(..., description="ISO-8601 timestamp")
    files: List[ArtifactFile] = Field(default_factory=list, description="List of files generated")
    detected_stacks: DetectedStacks = Field(default_factory=DetectedStacks, description="Best-effort stack detection")
    entrypoints_found: List[str] = Field(default_factory=list, description="Entry points discovered")
    warnings: List[str] = Field(default_factory=list, description="Warnings during generation")


class VerificationResult(BaseModel):
    """Result of a verification check."""
    passed: bool = Field(..., description="Whether check passed")
    output: str = Field(default="", description="Short output or error message")
    log_path: Optional[str] = Field(None, description="Path to full log file")


class Verification(BaseModel):
    """Verification results for a run."""
    run_id: str = Field(..., description="Associated run ID")
    timestamp: str = Field(..., description="ISO-8601 timestamp")
    lint_result: Optional[VerificationResult] = Field(None, description="Linting result")
    build_result: Optional[VerificationResult] = Field(None, description="Build result")
    unit_test_result: Optional[VerificationResult] = Field(None, description="Unit test result")
    smoke_test_result: Optional[VerificationResult] = Field(None, description="Smoke test result")
    docker_compose_valid: Optional[bool] = Field(None, description="Docker Compose validation")
    paths_to_full_logs: List[str] = Field(default_factory=list, description="Paths to detailed logs")
