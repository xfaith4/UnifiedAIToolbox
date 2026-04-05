"""
Orchestrator decision logging utilities.

Provides deterministic, machine-readable tracing for orchestration runs including:
- Run-level metadata tracking
- Step-level event logging (JSONL)
- Decision ledger (JSONL)
- Conflict logging (JSONL)
- Artifact manifest generation
- Secret redaction
- Prompt hashing for deterministic tracking

All logging operations are fail-open: if logging fails, the orchestration continues
and a warning is recorded.
"""

import hashlib
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from pydantic import ValidationError

from orchestrator_schemas import (
    RunMetadata,
    StepEvent,
    Decision,
    Conflict,
    ArtifactManifest,
    ArtifactFile,
    DetectedStacks,
    Verification,
    VerificationResult,
)

logger = logging.getLogger(__name__)


# Common secret patterns to redact
SECRET_PATTERNS = [
    (re.compile(r'(api[_\s-]?key["\s:=]+)([a-zA-Z0-9_\-]{20,})', re.IGNORECASE), r'\1[REDACTED]'),
    (re.compile(r'(token["\s:=]+)([a-zA-Z0-9_\-\.]{20,})', re.IGNORECASE), r'\1[REDACTED]'),
    (re.compile(r'(bearer\s+)([a-zA-Z0-9_\-\.]{20,})', re.IGNORECASE), r'\1[REDACTED]'),
    (re.compile(r'(password["\s:=]+)([^\s"]{8,})', re.IGNORECASE), r'\1[REDACTED]'),
    (re.compile(r'(secret["\s:=]+)([a-zA-Z0-9_\-]{16,})', re.IGNORECASE), r'\1[REDACTED]'),
    (re.compile(r'(Authorization:\s*Bearer\s+)([^\s]+)', re.IGNORECASE), r'\1[REDACTED]'),
    (re.compile(r'(client_secret["\s:=]+)([^\s"]{16,})', re.IGNORECASE), r'\1[REDACTED]'),
    (re.compile(r'(aws_secret_access_key["\s:=]+)([^\s"]{20,})', re.IGNORECASE), r'\1[REDACTED]'),
]


def redact_secrets(text: Optional[str]) -> Optional[str]:
    """
    Redact common secret patterns from text.
    
    Args:
        text: Input text that may contain secrets (or None)
        
    Returns:
        Text with secrets replaced by [REDACTED], or None if input is None
    """
    if not text:
        return text
    
    result = text
    for pattern, replacement in SECRET_PATTERNS:
        result = pattern.sub(replacement, result)
    
    return result


def compute_prompt_hash(prompt: str) -> str:
    """
    Compute stable SHA-256 hash of a prompt.
    
    Args:
        prompt: Prompt text to hash
        
    Returns:
        Hex-encoded SHA-256 hash
    """
    return hashlib.sha256(prompt.encode('utf-8')).hexdigest()


def compute_file_hash(file_path: Path) -> str:
    """
    Compute SHA-256 hash of a file.
    
    Args:
        file_path: Path to file
        
    Returns:
        Hex-encoded SHA-256 hash
    """
    sha256 = hashlib.sha256()
    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(4096), b''):
            sha256.update(chunk)
    return sha256.hexdigest()


def append_jsonl(file_path: Path, data: Dict[str, Any]) -> None:
    """
    Append a JSON object to a JSONL file.
    
    Args:
        file_path: Path to JSONL file
        data: Dictionary to append as JSON line
    """
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with open(file_path, 'a', encoding='utf-8') as f:
        f.write(json.dumps(data, ensure_ascii=False) + '\n')


def write_json(file_path: Path, data: Dict[str, Any]) -> None:
    """
    Write a JSON object to a file (pretty-printed).
    
    Args:
        file_path: Path to JSON file
        data: Dictionary to write as JSON
    """
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


class OrchestratorLogger:
    """
    Main logger for orchestration runs.
    
    Creates a run folder under ./artifacts/runs/<run_id>/ and manages
    all logging artifacts for that run.
    """
    
    def __init__(self, artifacts_root: Path, run_id: Optional[str] = None):
        """
        Initialize orchestrator logger.
        
        Args:
            artifacts_root: Root directory for artifacts (e.g., ./artifacts)
            run_id: Optional run ID. If not provided, generates a new UUID-based ID
        """
        self.artifacts_root = Path(artifacts_root)
        self.run_id = run_id or self._generate_run_id()
        self.run_dir = self.artifacts_root / "runs" / self.run_id
        self.run_dir.mkdir(parents=True, exist_ok=True)
        
        # Paths for various log files
        self.run_json_path = self.run_dir / "run.json"
        self.steps_jsonl_path = self.run_dir / "steps.jsonl"
        self.decisions_jsonl_path = self.run_dir / "decisions.jsonl"
        self.conflicts_jsonl_path = self.run_dir / "conflicts.jsonl"
        self.artifacts_json_path = self.run_dir / "artifacts.json"
        self.verification_json_path = self.run_dir / "verification.json"
        
        self._logging_errors: List[str] = []
        
    def _generate_run_id(self) -> str:
        """Generate a unique run ID."""
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        unique_id = str(uuid.uuid4())[:8]
        return f"{timestamp}_{unique_id}"
    
    def _safe_log(self, operation: str, func, *args, **kwargs) -> bool:
        """
        Execute a logging operation with fail-open semantics.
        
        Args:
            operation: Description of the operation (for error logging)
            func: Function to execute
            *args, **kwargs: Arguments to pass to func
            
        Returns:
            True if operation succeeded, False otherwise
        """
        try:
            func(*args, **kwargs)
            return True
        except Exception as e:
            error_msg = f"Logging error in {operation}: {e}"
            logger.warning(error_msg)
            self._logging_errors.append(error_msg)
            return False
    
    def log_run_metadata(
        self,
        orchestrator_version: str,
        prompt_library_hash: str,
        user_goal: str,
        context_payload: Optional[Dict[str, Any]] = None,
        definition_of_done: Optional[List[str]] = None,
    ) -> bool:
        """
        Log run-level metadata.
        
        Args:
            orchestrator_version: Version of orchestrator
            prompt_library_hash: Hash of prompt library
            user_goal: User's goal (2-3 sentences)
            context_payload: Additional context
            definition_of_done: Completion criteria
            
        Returns:
            True if logging succeeded, False otherwise
        """
        def _log():
            # Redact secrets from context and goal
            safe_context = json.loads(redact_secrets(json.dumps(context_payload or {})))
            safe_goal = redact_secrets(user_goal)
            
            metadata = RunMetadata(
                run_id=self.run_id,
                timestamp=datetime.now(timezone.utc).isoformat(),
                orchestrator_version=orchestrator_version,
                prompt_library_hash=prompt_library_hash,
                user_goal=safe_goal,
                context_payload=safe_context,
                definition_of_done=definition_of_done or [],
            )
            write_json(self.run_json_path, metadata.model_dump())
        
        return self._safe_log("log_run_metadata", _log)
    
    def log_step(
        self,
        step_id: str,
        agent_id: str,
        model: str,
        prompt_text: str,
        input_payload: Dict[str, Any],
        raw_output: str,
        parsed_output: Optional[Dict[str, Any]] = None,
        schema_validation: Optional[Dict[str, Any]] = None,
        timing_ms: Optional[float] = None,
        token_usage: Optional[Dict[str, int]] = None,
        prompt_id: Optional[str] = None,
    ) -> bool:
        """
        Log a step-level event.
        
        Args:
            step_id: Unique step identifier
            agent_id: Agent identifier
            model: Model used
            prompt_text: Full prompt text for hashing
            input_payload: Input data passed to agent
            raw_output: Raw output from agent
            parsed_output: Parsed JSON output (if applicable)
            schema_validation: Validation results
            timing_ms: Execution time in milliseconds
            token_usage: Token usage statistics
            prompt_id: Optional prompt identifier
            
        Returns:
            True if logging succeeded, False otherwise
        """
        def _log():
            # Redact secrets
            safe_input = json.loads(redact_secrets(json.dumps(input_payload)))
            safe_output = redact_secrets(raw_output)
            safe_parsed = None
            if parsed_output is not None:
                safe_parsed = json.loads(redact_secrets(json.dumps(parsed_output)))
            
            event = StepEvent(
                step_id=step_id,
                run_id=self.run_id,
                agent_id=agent_id,
                model=model,
                prompt_id=prompt_id,
                prompt_hash=compute_prompt_hash(prompt_text),
                input_payload=safe_input,
                raw_output=safe_output,
                parsed_output=safe_parsed,
                schema_validation=schema_validation or {"passed": False, "errors": []},
                timing_ms=timing_ms,
                token_usage=token_usage,
            )
            append_jsonl(self.steps_jsonl_path, event.model_dump())
        
        return self._safe_log("log_step", _log)
    
    def log_decision(
        self,
        decision_id: str,
        decision_type: str,
        chosen: str,
        rationale: str,
        confidence: float,
        reversible: bool,
        validation_plan: str,
        step_id: Optional[str] = None,
        alternatives: Optional[List[str]] = None,
        assumptions: Optional[List[str]] = None,
        constraints_referenced: Optional[List[str]] = None,
    ) -> bool:
        """
        Log a decision.
        
        Args:
            decision_id: Unique decision identifier
            decision_type: Type of decision (e.g., "stack_choice")
            chosen: Chosen option
            rationale: Reasoning
            confidence: Confidence level (0-1)
            reversible: Whether decision can be reversed
            validation_plan: Plan for validating decision
            step_id: Associated step ID
            alternatives: Alternative options considered
            assumptions: Assumptions made
            constraints_referenced: Constraints considered
            
        Returns:
            True if logging succeeded, False otherwise
        """
        def _log():
            decision = Decision(
                decision_id=decision_id,
                run_id=self.run_id,
                step_id=step_id,
                type=decision_type,
                chosen=chosen,
                alternatives=alternatives or [],
                rationale=rationale,
                assumptions=assumptions or [],
                constraints_referenced=constraints_referenced or [],
                confidence=confidence,
                reversible=reversible,
                validation_plan=validation_plan,
            )
            append_jsonl(self.decisions_jsonl_path, decision.model_dump())
        
        return self._safe_log("log_decision", _log)
    
    def log_conflict(
        self,
        conflict_id: str,
        artifacts_involved: List[str],
        conflict_summary: str,
        resolution: str,
        reason: str,
        followup_action: str,
    ) -> bool:
        """
        Log a conflict between artifacts.
        
        Args:
            conflict_id: Unique conflict identifier
            artifacts_involved: List of conflicting artifacts
            conflict_summary: Description of conflict
            resolution: How it was resolved
            reason: Reason for resolution approach
            followup_action: Required follow-up
            
        Returns:
            True if logging succeeded, False otherwise
        """
        def _log():
            conflict = Conflict(
                conflict_id=conflict_id,
                run_id=self.run_id,
                artifacts_involved=artifacts_involved,
                conflict_summary=conflict_summary,
                resolution=resolution,
                reason=reason,
                followup_action=followup_action,
            )
            append_jsonl(self.conflicts_jsonl_path, conflict.model_dump())
        
        return self._safe_log("log_conflict", _log)
    
    def log_artifact_manifest(
        self,
        files: List[Dict[str, Any]],
        detected_stacks: Optional[Dict[str, Optional[str]]] = None,
        entrypoints_found: Optional[List[str]] = None,
        warnings: Optional[List[str]] = None,
    ) -> bool:
        """
        Log artifact manifest after generation.
        
        Args:
            files: List of file dicts with path, sha256, size_bytes
            detected_stacks: Detected technology stacks
            entrypoints_found: Discovered entry points
            warnings: Warnings during generation
            
        Returns:
            True if logging succeeded, False otherwise
        """
        def _log():
            artifact_files = [ArtifactFile(**f) for f in files]
            stacks = DetectedStacks(**(detected_stacks or {}))
            
            manifest = ArtifactManifest(
                run_id=self.run_id,
                timestamp=datetime.now(timezone.utc).isoformat(),
                files=artifact_files,
                detected_stacks=stacks,
                entrypoints_found=entrypoints_found or [],
                warnings=warnings or [],
            )
            write_json(self.artifacts_json_path, manifest.model_dump())
        
        return self._safe_log("log_artifact_manifest", _log)
    
    def log_verification(
        self,
        normalization_result: Optional[Dict[str, Any]] = None,
        install_result: Optional[Dict[str, Any]] = None,
        lint_result: Optional[Dict[str, Any]] = None,
        build_result: Optional[Dict[str, Any]] = None,
        unit_test_result: Optional[Dict[str, Any]] = None,
        smoke_test_result: Optional[Dict[str, Any]] = None,
        dev_server_result: Optional[Dict[str, Any]] = None,
        docker_compose_valid: Optional[bool] = None,
        paths_to_full_logs: Optional[List[str]] = None,
    ) -> bool:
        """
        Log verification results.
        
        Args:
            normalization_result: Artifact normalization result dict
            install_result: Dependency installation result dict
            lint_result: Linting result dict with passed, output, log_path
            build_result: Build result dict
            unit_test_result: Unit test result dict
            smoke_test_result: Smoke test result dict
            dev_server_result: Dev server startup result dict
            docker_compose_valid: Docker Compose validation result
            paths_to_full_logs: Paths to detailed log files
            
        Returns:
            True if logging succeeded, False otherwise
        """
        def _log():
            verification = Verification(
                run_id=self.run_id,
                timestamp=datetime.now(timezone.utc).isoformat(),
                normalization_result=normalization_result,
                install_result=VerificationResult(**install_result) if install_result else None,
                lint_result=VerificationResult(**lint_result) if lint_result else None,
                build_result=VerificationResult(**build_result) if build_result else None,
                unit_test_result=VerificationResult(**unit_test_result) if unit_test_result else None,
                smoke_test_result=VerificationResult(**smoke_test_result) if smoke_test_result else None,
                dev_server_result=VerificationResult(**dev_server_result) if dev_server_result else None,
                docker_compose_valid=docker_compose_valid,
                paths_to_full_logs=paths_to_full_logs or [],
            )
            write_json(self.verification_json_path, verification.model_dump())
        
        return self._safe_log("log_verification", _log)
    
    def get_logging_errors(self) -> List[str]:
        """Get list of logging errors that occurred."""
        return self._logging_errors.copy()
    
    def has_logging_errors(self) -> bool:
        """Check if any logging errors occurred."""
        return len(self._logging_errors) > 0


def validate_agent_output(output: Any, expected_schema: type) -> Dict[str, Any]:
    """
    Validate agent output against a Pydantic schema.
    
    Args:
        output: Output to validate (dict or JSON string)
        expected_schema: Pydantic model class
        
    Returns:
        Dict with 'passed' (bool) and 'errors' (list of str)
    """
    try:
        if isinstance(output, str):
            output = json.loads(output)
        
        expected_schema(**output)
        return {"passed": True, "errors": []}
    except ValidationError as e:
        errors = [f"{err['loc']}: {err['msg']}" for err in e.errors()]
        return {"passed": False, "errors": errors}
    except json.JSONDecodeError as e:
        return {"passed": False, "errors": [f"JSON decode error: {e}"]}
    except Exception as e:
        return {"passed": False, "errors": [f"Validation error: {e}"]}


def detect_stacks(run_dir: Path) -> Dict[str, Optional[str]]:
    """
    Best-effort detection of technology stacks in generated files.
    
    Args:
        run_dir: Directory containing generated files
        
    Returns:
        Dict with frontend, backend, db keys
    """
    stacks = {"frontend": None, "backend": None, "db": None}
    
    if not run_dir.exists():
        return stacks
    
    # Check for common frontend indicators
    if (run_dir / "package.json").exists():
        try:
            with open(run_dir / "package.json") as f:
                pkg = json.load(f)
                deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
                
                if "react" in deps:
                    stacks["frontend"] = "React"
                elif "vue" in deps:
                    stacks["frontend"] = "Vue"
                elif "next" in deps:
                    stacks["frontend"] = "Next.js"
                elif "@angular/core" in deps:
                    stacks["frontend"] = "Angular"
        except Exception:
            pass
    
    # Check for common backend indicators
    if (run_dir / "requirements.txt").exists() or (run_dir / "pyproject.toml").exists():
        stacks["backend"] = "Python"
    elif (run_dir / "go.mod").exists():
        stacks["backend"] = "Go"
    elif (run_dir / "Cargo.toml").exists():
        stacks["backend"] = "Rust"
    elif (run_dir / "pom.xml").exists():
        stacks["backend"] = "Java/Maven"
    
    # Check for database indicators
    if (run_dir / "docker-compose.yml").exists() or (run_dir / "docker-compose.yaml").exists():
        try:
            compose_file = run_dir / "docker-compose.yml"
            if not compose_file.exists():
                compose_file = run_dir / "docker-compose.yaml"
            
            content = compose_file.read_text()
            if "postgres" in content.lower():
                stacks["db"] = "PostgreSQL"
            elif "mysql" in content.lower():
                stacks["db"] = "MySQL"
            elif "mongo" in content.lower():
                stacks["db"] = "MongoDB"
            elif "redis" in content.lower():
                stacks["db"] = "Redis"
        except Exception:
            pass
    
    return stacks
