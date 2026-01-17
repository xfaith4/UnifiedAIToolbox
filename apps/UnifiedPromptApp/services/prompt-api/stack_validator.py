"""
Stack lock and validation module for orchestration runs.

Prevents incoherent technology stack combinations by:
- Creating a stack lock early in the run
- Enforcing consistency across all generated artifacts
- Detecting violations and recording conflicts
- Supporting bounded retries for stack compliance
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class StackLock(BaseModel):
    """Stack lock definition for a run."""
    run_id: str = Field(..., description="Associated run ID")
    timestamp: str = Field(..., description="ISO-8601 timestamp")
    frontend: Optional[str] = Field(None, description="Locked frontend stack")
    backend: Optional[str] = Field(None, description="Locked backend stack")
    db: Optional[str] = Field(None, description="Locked database")
    package_manager: Optional[str] = Field(None, description="Locked package manager")
    entrypoints: Dict[str, str] = Field(default_factory=dict, description="Expected entrypoints")
    constraints: List[str] = Field(default_factory=list, description="Additional constraints")
    locked: bool = Field(default=False, description="Whether stack is locked")


class StackViolation(BaseModel):
    """Stack violation details."""
    artifact_path: str = Field(..., description="Path to violating artifact")
    violation_type: str = Field(..., description="Type of violation")
    expected: str = Field(..., description="Expected value from lock")
    actual: str = Field(..., description="Actual value found")
    severity: str = Field(..., description="Severity: critical, warning")


class StackValidator:
    """
    Validates artifacts against a locked technology stack.
    
    Creates a stack lock early in the run and enforces compliance
    for all downstream artifacts. Records conflicts when violations occur.
    """
    
    def __init__(self, run_dir: Path):
        """
        Initialize stack validator.
        
        Args:
            run_dir: Run directory containing stack_lock.json
        """
        self.run_dir = Path(run_dir)
        self.stack_lock_path = self.run_dir / "stack_lock.json"
        self._lock: Optional[StackLock] = None
    
    def create_stack_lock(
        self,
        run_id: str,
        frontend: Optional[str] = None,
        backend: Optional[str] = None,
        db: Optional[str] = None,
        package_manager: Optional[str] = None,
        entrypoints: Optional[Dict[str, str]] = None,
        constraints: Optional[List[str]] = None,
    ) -> StackLock:
        """
        Create and save a stack lock.
        
        Args:
            run_id: Run identifier
            frontend: Frontend framework (e.g., "React", "Next.js")
            backend: Backend framework/language (e.g., "Python/FastAPI", "Node.js/Express")
            db: Database (e.g., "PostgreSQL", "MongoDB")
            package_manager: Package manager (e.g., "npm", "pip")
            entrypoints: Expected entrypoint files
            constraints: Additional constraints
            
        Returns:
            Created StackLock object
        """
        self._lock = StackLock(
            run_id=run_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            frontend=frontend,
            backend=backend,
            db=db,
            package_manager=package_manager,
            entrypoints=entrypoints or {},
            constraints=constraints or [],
            locked=True,
        )
        
        self._save_lock()
        logger.info(f"Created stack lock for run {run_id}: frontend={frontend}, backend={backend}, db={db}")
        return self._lock
    
    def load_stack_lock(self) -> Optional[StackLock]:
        """
        Load existing stack lock from file.
        
        Returns:
            StackLock object if exists, None otherwise
        """
        if self._lock is not None:
            return self._lock
        
        if not self.stack_lock_path.exists():
            return None
        
        try:
            with open(self.stack_lock_path, 'r') as f:
                data = json.load(f)
                self._lock = StackLock(**data)
                return self._lock
        except Exception as e:
            logger.error(f"Failed to load stack lock: {e}")
            return None
    
    def _save_lock(self) -> None:
        """Save stack lock to file."""
        if self._lock is None:
            return
        
        self.run_dir.mkdir(parents=True, exist_ok=True)
        with open(self.stack_lock_path, 'w') as f:
            json.dump(self._lock.model_dump(), f, indent=2)
    
    def validate_artifact(
        self,
        artifact_path: Path,
        artifact_content: Optional[str] = None
    ) -> Tuple[bool, List[StackViolation]]:
        """
        Validate an artifact against the stack lock.
        
        Args:
            artifact_path: Path to artifact (relative or absolute)
            artifact_content: Optional content to validate (if not provided, reads from file)
            
        Returns:
            Tuple of (is_valid, list of violations)
        """
        lock = self.load_stack_lock()
        if lock is None or not lock.locked:
            # No lock or not locked yet - all artifacts are valid
            return True, []
        
        violations: List[StackViolation] = []
        
        # Read content if not provided
        if artifact_content is None:
            if not artifact_path.exists():
                logger.warning(f"Artifact does not exist: {artifact_path}")
                return True, []
            try:
                artifact_content = artifact_path.read_text()
            except Exception as e:
                logger.error(f"Failed to read artifact {artifact_path}: {e}")
                return True, []
        
        artifact_name = artifact_path.name.lower()
        
        # Check frontend stack violations
        if lock.frontend:
            violations.extend(self._check_frontend_violations(
                artifact_path, artifact_name, artifact_content, lock.frontend
            ))
        
        # Check backend stack violations
        if lock.backend:
            violations.extend(self._check_backend_violations(
                artifact_path, artifact_name, artifact_content, lock.backend
            ))
        
        # Check package manager violations
        if lock.package_manager:
            violations.extend(self._check_package_manager_violations(
                artifact_path, artifact_name, lock.package_manager
            ))
        
        # Check entrypoint violations
        if lock.entrypoints:
            violations.extend(self._check_entrypoint_violations(
                artifact_path, artifact_name, lock.entrypoints
            ))
        
        is_valid = len(violations) == 0
        if not is_valid:
            logger.warning(f"Stack violations found in {artifact_path}: {len(violations)} violations")
        
        return is_valid, violations
    
    def _check_frontend_violations(
        self,
        artifact_path: Path,
        artifact_name: str,
        content: str,
        expected_frontend: str
    ) -> List[StackViolation]:
        """Check for frontend stack violations."""
        violations = []
        
        # Vue files when React/Next.js is locked
        if expected_frontend.lower() in ["react", "next.js"] and artifact_name.endswith(".vue"):
            violations.append(StackViolation(
                artifact_path=str(artifact_path),
                violation_type="frontend_mismatch",
                expected=expected_frontend,
                actual="Vue (detected .vue file)",
                severity="critical"
            ))
        
        # React/JSX files when Vue is locked
        if expected_frontend.lower() == "vue" and (artifact_name.endswith(".jsx") or artifact_name.endswith(".tsx")):
            if "from 'react'" in content or 'from "react"' in content:
                violations.append(StackViolation(
                    artifact_path=str(artifact_path),
                    violation_type="frontend_mismatch",
                    expected=expected_frontend,
                    actual="React (detected React imports)",
                    severity="critical"
                ))
        
        # Angular files when React/Vue is locked
        if expected_frontend.lower() in ["react", "vue"] and artifact_name.endswith(".component.ts"):
            violations.append(StackViolation(
                artifact_path=str(artifact_path),
                violation_type="frontend_mismatch",
                expected=expected_frontend,
                actual="Angular (detected .component.ts file)",
                severity="critical"
            ))
        
        return violations
    
    def _check_backend_violations(
        self,
        artifact_path: Path,
        artifact_name: str,
        content: str,
        expected_backend: str
    ) -> List[StackViolation]:
        """Check for backend stack violations."""
        violations = []
        
        # Flask/Django when Node.js is locked
        if "node" in expected_backend.lower() or "express" in expected_backend.lower():
            if artifact_name in ["app.py", "wsgi.py", "asgi.py"]:
                if "flask" in content.lower() or "django" in content.lower() or "fastapi" in content.lower():
                    violations.append(StackViolation(
                        artifact_path=str(artifact_path),
                        violation_type="backend_mismatch",
                        expected=expected_backend,
                        actual="Python web framework (detected Flask/Django/FastAPI)",
                        severity="critical"
                    ))
        
        # Node.js when Python is locked
        if "python" in expected_backend.lower():
            if artifact_name in ["server.js", "index.js", "app.js"]:
                if "express" in content.lower() or "require(" in content or 'from "express"' in content:
                    violations.append(StackViolation(
                        artifact_path=str(artifact_path),
                        violation_type="backend_mismatch",
                        expected=expected_backend,
                        actual="Node.js (detected Node.js/Express)",
                        severity="critical"
                    ))
        
        return violations
    
    def _check_package_manager_violations(
        self,
        artifact_path: Path,
        artifact_name: str,
        expected_pm: str
    ) -> List[StackViolation]:
        """Check for package manager violations."""
        violations = []
        
        # npm locked but found yarn/pnpm
        if expected_pm.lower() == "npm":
            if artifact_name in ["yarn.lock", "pnpm-lock.yaml"]:
                violations.append(StackViolation(
                    artifact_path=str(artifact_path),
                    violation_type="package_manager_mismatch",
                    expected=expected_pm,
                    actual="yarn" if "yarn" in artifact_name else "pnpm",
                    severity="warning"
                ))
        
        # pip locked but found poetry/pipenv
        if expected_pm.lower() == "pip":
            if artifact_name in ["poetry.lock", "Pipfile.lock"]:
                violations.append(StackViolation(
                    artifact_path=str(artifact_path),
                    violation_type="package_manager_mismatch",
                    expected=expected_pm,
                    actual="poetry" if "poetry" in artifact_name else "pipenv",
                    severity="warning"
                ))
        
        return violations
    
    def _check_entrypoint_violations(
        self,
        artifact_path: Path,
        artifact_name: str,
        expected_entrypoints: Dict[str, str]
    ) -> List[StackViolation]:
        """Check for entrypoint violations."""
        violations = []
        
        # Check if file claims to be an entrypoint but differs from lock
        for entry_name, expected_path in expected_entrypoints.items():
            if artifact_name == Path(expected_path).name:
                # Found a file matching entrypoint name - validate it's in right location
                if str(artifact_path) != expected_path and artifact_path.name == Path(expected_path).name:
                    violations.append(StackViolation(
                        artifact_path=str(artifact_path),
                        violation_type="entrypoint_location_mismatch",
                        expected=expected_path,
                        actual=str(artifact_path),
                        severity="warning"
                    ))
        
        return violations
    
    def get_violation_summary(self, violations: List[StackViolation]) -> str:
        """
        Generate human-readable violation summary.
        
        Args:
            violations: List of violations
            
        Returns:
            Summary string
        """
        if not violations:
            return "No violations found"
        
        critical = [v for v in violations if v.severity == "critical"]
        warnings = [v for v in violations if v.severity == "warning"]
        
        lines = []
        if critical:
            lines.append(f"CRITICAL VIOLATIONS ({len(critical)}):")
            for v in critical:
                lines.append(f"  - {v.artifact_path}: {v.violation_type}")
                lines.append(f"    Expected: {v.expected}")
                lines.append(f"    Actual: {v.actual}")
        
        if warnings:
            lines.append(f"WARNINGS ({len(warnings)}):")
            for v in warnings:
                lines.append(f"  - {v.artifact_path}: {v.violation_type}")
                lines.append(f"    Expected: {v.expected}")
                lines.append(f"    Actual: {v.actual}")
        
        return "\n".join(lines)
    
    def should_retry(self, violations: List[StackViolation]) -> bool:
        """
        Determine if violations warrant a retry.
        
        Args:
            violations: List of violations
            
        Returns:
            True if should retry, False otherwise
        """
        # Retry on any critical violation
        return any(v.severity == "critical" for v in violations)
    
    def get_retry_constraint_message(self, violations: List[StackViolation]) -> str:
        """
        Generate constraint message for retry.
        
        Args:
            violations: List of violations
            
        Returns:
            Constraint message for agent
        """
        lock = self.load_stack_lock()
        if lock is None:
            return "No stack lock found"
        
        critical = [v for v in violations if v.severity == "critical"]
        
        parts = [
            "STACK CONSTRAINT VIOLATION - You must comply with the locked technology stack:",
            f"  - Frontend: {lock.frontend or 'Not specified'}",
            f"  - Backend: {lock.backend or 'Not specified'}",
            f"  - Database: {lock.db or 'Not specified'}",
            f"  - Package Manager: {lock.package_manager or 'Not specified'}",
            "",
            "Violations detected:",
        ]
        
        for v in critical:
            parts.append(f"  - {v.artifact_path}: Expected {v.expected}, but found {v.actual}")
        
        parts.append("")
        parts.append("You MUST regenerate the artifact(s) to match the locked stack.")
        
        return "\n".join(parts)
