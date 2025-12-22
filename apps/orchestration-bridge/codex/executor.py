"""Codex swarm executor for automated code review and analysis."""

import subprocess
import json
import threading
import time
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Optional, List, Dict, Any
import uuid


class CodexStatus(str, Enum):
    """Status of a Codex run."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class FindingSeverity(str, Enum):
    """Severity levels for findings."""
    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class CodexFinding:
    """A finding from a Codex analysis."""
    id: str
    severity: FindingSeverity
    category: str
    title: str
    description: str
    file_path: Optional[str] = None
    line_number: Optional[int] = None
    code_snippet: Optional[str] = None
    recommendation: Optional[str] = None
    agent_role: Optional[str] = None


@dataclass
class CodexRun:
    """Represents a Codex swarm execution."""
    run_id: str
    repo_path: str
    status: CodexStatus
    start_time: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    end_time: Optional[datetime] = None
    progress_percent: float = 0.0
    current_step: str = "Initializing..."
    findings: List[CodexFinding] = field(default_factory=list)
    logs: List[str] = field(default_factory=list)
    error: Optional[str] = None
    model: str = "gpt-5-codex"
    max_parallel: int = 3


class CodexExecutor:
    """
    Executor for running Codex swarm analysis on repositories.
    Wraps the PowerShell Orchestrate-Codex.ps1 script.
    """

    def __init__(
        self,
        codex_script_path: Optional[str] = None,
        output_dir: str = "/tmp/codex_runs"
    ):
        """
        Initialize the Codex executor.
        
        Args:
            codex_script_path: Path to Orchestrate-Codex.ps1 script
            output_dir: Directory to store run outputs
        """
        if codex_script_path is None:
            # Prefer explicit env override, then the in-repo script location.
            base_dir = Path(__file__).parent.parent.parent.parent
            env_path = os.environ.get("CODEX_SWARM_PS1")
            if env_path:
                codex_script_path = str(Path(env_path).expanduser().resolve())
            else:
                primary = (
                    base_dir / "Orchestration" / "engine" / "codex-multiagent-swarm"
                    / "Orchestrate-Codex.ps1"
                )
                fallback = (
                    base_dir / "packages" / "prompt-registry" / "tooling"
                    / "Orchestrate-Codex.ps1"
                )
                codex_script_path = str(primary if primary.exists() else fallback)
        
        self.codex_script_path = Path(codex_script_path)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Track active runs
        self._runs: Dict[str, CodexRun] = {}
        self._processes: Dict[str, subprocess.Popen] = {}
        self._lock = threading.Lock()

    def start_analysis(
        self,
        repo_path: str,
        model: str = "gpt-5-codex",
        max_parallel: int = 3
    ) -> str:
        """
        Start a Codex analysis on a repository.
        
        Args:
            repo_path: Path to the repository to analyze
            model: AI model to use
            max_parallel: Maximum number of parallel agent jobs
            
        Returns:
            Run ID for tracking progress
        """
        run_id = str(uuid.uuid4())
        
        # Create run directory
        run_dir = self.output_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize run
        run = CodexRun(
            run_id=run_id,
            repo_path=repo_path,
            status=CodexStatus.PENDING,
            model=model,
            max_parallel=max_parallel
        )
        
        with self._lock:
            self._runs[run_id] = run
        
        # Start analysis in background thread
        thread = threading.Thread(
            target=self._execute_worker,
            args=(run_id, repo_path, model, max_parallel, run_dir)
        )
        thread.daemon = True
        thread.start()
        
        return run_id

    def _execute_worker(
        self,
        run_id: str,
        repo_path: str,
        model: str,
        max_parallel: int,
        run_dir: Path
    ):
        """Background worker for executing Codex analysis."""
        run = self._runs[run_id]
        
        try:
            # Update status
            run.status = CodexStatus.RUNNING
            run.current_step = "Starting Codex swarm..."
            run.progress_percent = 5.0
            self._add_log(run_id, "Starting Codex analysis...")
            
            # Check if PowerShell is available
            pwsh_cmd = self._find_powershell()
            if not pwsh_cmd:
                raise Exception("PowerShell not found. Install PowerShell Core.")
            
            # Check if script exists
            if not self.codex_script_path.exists():
                raise Exception(f"Codex script not found: {self.codex_script_path}")
            
            run.current_step = "Preparing Codex environment..."
            run.progress_percent = 10.0
            self._add_log(run_id, f"Using PowerShell: {pwsh_cmd}")
            self._add_log(run_id, f"Script: {self.codex_script_path}")
            self._add_log(run_id, f"Repository: {repo_path}")
            
            # Build PowerShell command
            ps_args = [
                pwsh_cmd,
                "-NoProfile",
                "-NonInteractive",
                "-File", str(self.codex_script_path),
                "-RepoRoot", repo_path,
                "-Model", model,
                "-MaxParallel", str(max_parallel),
                "-WorkDir", str(run_dir / "codex_out")
            ]
            
            run.current_step = "Executing Codex swarm..."
            run.progress_percent = 20.0
            self._add_log(run_id, "Launching Codex agents...")
            
            # Execute PowerShell script
            process = subprocess.Popen(
                ps_args,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1
            )
            
            with self._lock:
                self._processes[run_id] = process
            
            # Stream output
            line_count = 0
            for line in process.stdout:
                line = line.rstrip()
                if line:
                    self._add_log(run_id, line)
                    line_count += 1
                    
                    # Update progress based on output
                    if "agent" in line.lower() or "job" in line.lower():
                        run.progress_percent = min(20.0 + (line_count * 0.5), 80.0)
                    
                    # Update current step based on keywords
                    if "critic" in line.lower():
                        run.current_step = "Running critic agent..."
                    elif "security" in line.lower():
                        run.current_step = "Running security agent..."
                    elif "lint" in line.lower():
                        run.current_step = "Running lint agent..."
                    elif "test" in line.lower():
                        run.current_step = "Running test agent..."
                    elif "refactor" in line.lower():
                        run.current_step = "Running refactor agent..."
                    elif "synthesize" in line.lower() or "merge" in line.lower():
                        run.current_step = "Synthesizing findings..."
                        run.progress_percent = 85.0
            
            # Wait for completion
            return_code = process.wait()
            
            run.current_step = "Parsing results..."
            run.progress_percent = 90.0
            self._add_log(run_id, f"Codex execution completed with code: {return_code}")
            
            # Parse findings from output directory
            self._parse_findings(run_id, run_dir / "codex_out")
            
            # Check for success
            if return_code == 0:
                run.status = CodexStatus.COMPLETED
                run.current_step = "Analysis complete"
                run.progress_percent = 100.0
                self._add_log(run_id, f"Found {len(run.findings)} issues")
            else:
                run.status = CodexStatus.FAILED
                run.error = f"Codex execution failed with code {return_code}"
                self._add_log(run_id, f"ERROR: {run.error}")
            
            run.end_time = datetime.now(timezone.utc)
            
        except Exception as e:
            run.status = CodexStatus.FAILED
            run.error = str(e)
            run.end_time = datetime.now(timezone.utc)
            self._add_log(run_id, f"ERROR: {str(e)}")
        finally:
            # Cleanup process reference
            with self._lock:
                if run_id in self._processes:
                    del self._processes[run_id]

    def _find_powershell(self) -> Optional[str]:
        """Find PowerShell executable."""
        # Try pwsh (PowerShell Core) first
        for cmd in ["pwsh", "powershell"]:
            try:
                result = subprocess.run(
                    [cmd, "-Version"],
                    capture_output=True,
                    timeout=5
                )
                if result.returncode == 0:
                    return cmd
            except (FileNotFoundError, subprocess.TimeoutExpired):
                continue
        return None

    def _parse_findings(self, run_id: str, output_dir: Path):
        """Parse findings from Codex output directory."""
        run = self._runs[run_id]
        
        # Look for agent output files
        if not output_dir.exists():
            self._add_log(run_id, "No output directory found")
            return
        
        # Parse findings from each agent's output
        for agent_dir in output_dir.glob("*"):
            if not agent_dir.is_dir():
                continue
            
            agent_role = agent_dir.name.split('_')[0]
            
            # Look for findings files
            for findings_file in agent_dir.glob("*.json"):
                try:
                    with open(findings_file, 'r') as f:
                        data = json.load(f)
                        
                    if isinstance(data, list):
                        for item in data:
                            finding = self._parse_finding(item, agent_role)
                            if finding:
                                run.findings.append(finding)
                    elif isinstance(data, dict):
                        finding = self._parse_finding(data, agent_role)
                        if finding:
                            run.findings.append(finding)
                except Exception as e:
                    self._add_log(run_id, f"Failed to parse {findings_file}: {e}")
            
            # Also check for text-based findings in codex.log
            log_file = agent_dir / "codex.log"
            if log_file.exists():
                self._parse_log_findings(run_id, log_file, agent_role)

    def _parse_finding(self, data: Dict[str, Any], agent_role: str) -> Optional[CodexFinding]:
        """Parse a single finding from JSON data."""
        try:
            return CodexFinding(
                id=str(uuid.uuid4()),
                severity=FindingSeverity(data.get('severity', 'medium').lower()),
                category=data.get('category', agent_role),
                title=data.get('title', 'Issue detected'),
                description=data.get('description', ''),
                file_path=data.get('file'),
                line_number=data.get('line'),
                code_snippet=data.get('code'),
                recommendation=data.get('fix') or data.get('recommendation'),
                agent_role=agent_role
            )
        except Exception:
            return None

    def _parse_log_findings(self, run_id: str, log_file: Path, agent_role: str):
        """Parse findings from log file using heuristics."""
        run = self._runs[run_id]
        
        try:
            with open(log_file, 'r') as f:
                content = f.read()
            
            # Simple heuristic: look for common patterns
            # This is a basic implementation - real parsing would be more sophisticated
            lines = content.split('\n')
            
            for i, line in enumerate(lines):
                line_lower = line.lower()
                
                # Look for keywords indicating issues
                if any(keyword in line_lower for keyword in ['error', 'warning', 'issue', 'problem', 'bug', 'vulnerability']):
                    # Try to extract severity
                    severity = FindingSeverity.MEDIUM
                    if 'critical' in line_lower or 'severe' in line_lower:
                        severity = FindingSeverity.CRITICAL
                    elif 'high' in line_lower:
                        severity = FindingSeverity.HIGH
                    elif 'low' in line_lower or 'minor' in line_lower:
                        severity = FindingSeverity.LOW
                    
                    # Create finding
                    finding = CodexFinding(
                        id=str(uuid.uuid4()),
                        severity=severity,
                        category=agent_role,
                        title=f"Issue detected by {agent_role}",
                        description=line.strip(),
                        agent_role=agent_role
                    )
                    run.findings.append(finding)
        except Exception as e:
            self._add_log(run_id, f"Failed to parse log {log_file}: {e}")

    def _add_log(self, run_id: str, message: str):
        """Add a log message to a run."""
        run = self._runs.get(run_id)
        if run:
            timestamp = datetime.now(timezone.utc).strftime("%H:%M:%S")
            log_entry = f"[{timestamp}] {message}"
            run.logs.append(log_entry)

    def get_run(self, run_id: str) -> Optional[CodexRun]:
        """Get a run by ID."""
        with self._lock:
            return self._runs.get(run_id)

    def list_runs(self) -> List[CodexRun]:
        """List all runs."""
        with self._lock:
            return list(self._runs.values())

    def cancel_run(self, run_id: str) -> bool:
        """Cancel a running analysis."""
        with self._lock:
            if run_id not in self._runs:
                return False
            
            run = self._runs[run_id]
            if run.status not in [CodexStatus.PENDING, CodexStatus.RUNNING]:
                return False
            
            # Kill process if running
            if run_id in self._processes:
                process = self._processes[run_id]
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                del self._processes[run_id]
            
            run.status = CodexStatus.CANCELLED
            run.end_time = datetime.now(timezone.utc)
            self._add_log(run_id, "Run cancelled by user")
            
            return True

    def cleanup_run(self, run_id: str) -> bool:
        """Clean up a completed run."""
        with self._lock:
            if run_id not in self._runs:
                return False
            
            run = self._runs[run_id]
            if run.status in [CodexStatus.PENDING, CodexStatus.RUNNING]:
                return False
            
            # Clean up output directory
            run_dir = self.output_dir / run_id
            if run_dir.exists():
                import shutil
                shutil.rmtree(run_dir)
            
            del self._runs[run_id]
            return True
