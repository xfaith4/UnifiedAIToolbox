"""
Codex Swarm Execution Service

Wraps the PowerShell Orchestrate-Codex.ps1 script for async execution
with progress streaming and findings management.
"""

import asyncio
import json
import logging
import subprocess
import uuid
from pathlib import Path
from typing import Optional, Dict, Any, AsyncGenerator
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)


class CodexRunStatus(str, Enum):
    """Status of a Codex swarm run."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class CodexSwarmService:
    """Service for executing Codex swarm analysis on repositories."""
    
    def __init__(
        self,
        codex_script_path: Optional[Path] = None,
        output_dir: Optional[Path] = None
    ):
        """
        Initialize the Codex swarm service.
        
        Args:
            codex_script_path: Path to Orchestrate-Codex.ps1 script
            output_dir: Directory for Codex run outputs
        """
        if codex_script_path is None:
            # Default to the script in the repository
            base_dir = Path(__file__).parent.parent.parent.parent
            codex_script_path = (
                base_dir / "packages" / "prompt-registry" / 
                "tooling" / "Orchestrate-Codex.ps1"
            )
        
        self.codex_script_path = Path(codex_script_path)
        
        if not self.codex_script_path.exists():
            raise FileNotFoundError(
                f"Codex script not found at {self.codex_script_path}"
            )
        
        if output_dir is None:
            output_dir = Path(__file__).parent.parent / "runs"
        
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Active runs tracking
        self.active_runs: Dict[str, Dict[str, Any]] = {}
    
    def _check_powershell_available(self) -> bool:
        """Check if PowerShell is available on the system."""
        try:
            result = subprocess.run(
                ["pwsh", "--version"],
                capture_output=True,
                timeout=5
            )
            return result.returncode == 0
        except (subprocess.TimeoutExpired, FileNotFoundError):
            # Try Windows PowerShell
            try:
                result = subprocess.run(
                    ["powershell", "-Command", "$PSVersionTable.PSVersion"],
                    capture_output=True,
                    timeout=5
                )
                return result.returncode == 0
            except (subprocess.TimeoutExpired, FileNotFoundError):
                return False
    
    def _get_powershell_command(self) -> str:
        """Get the appropriate PowerShell command for the system."""
        try:
            subprocess.run(["pwsh", "--version"], capture_output=True, timeout=5)
            return "pwsh"
        except (subprocess.TimeoutExpired, FileNotFoundError):
            return "powershell"
    
    async def start_codex_run(
        self,
        repo_path: Path,
        model: str = "gpt-4",
        max_parallel: int = 3,
        run_id: Optional[str] = None
    ) -> str:
        """
        Start a Codex swarm analysis run.
        
        Args:
            repo_path: Path to the repository to analyze
            model: AI model to use (default: gpt-4)
            max_parallel: Maximum parallel agent jobs
            run_id: Optional run identifier
            
        Returns:
            Run ID for tracking the execution
            
        Raises:
            RuntimeError: If PowerShell is not available
        """
        if not self._check_powershell_available():
            raise RuntimeError(
                "PowerShell is not available. Please install PowerShell Core (pwsh)."
            )
        
        if run_id is None:
            run_id = str(uuid.uuid4())
        
        # Create run directory
        run_dir = self.output_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize run metadata
        self.active_runs[run_id] = {
            'run_id': run_id,
            'status': CodexRunStatus.PENDING,
            'repo_path': str(repo_path),
            'model': model,
            'max_parallel': max_parallel,
            'start_time': datetime.utcnow().isoformat(),
            'end_time': None,
            'output_dir': str(run_dir),
            'log_file': str(run_dir / 'codex_run.log'),
            'findings_file': str(run_dir / 'findings.json'),
            'process': None
        }
        
        # Save run metadata to disk
        metadata_file = run_dir / 'metadata.json'
        with open(metadata_file, 'w') as f:
            json.dump(self.active_runs[run_id], f, indent=2, default=str)
        
        return run_id
    
    async def execute_codex_run(
        self,
        run_id: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Execute Codex swarm and stream progress updates.
        
        Args:
            run_id: Run identifier from start_codex_run
            
        Yields:
            Progress update dictionaries
        """
        if run_id not in self.active_runs:
            raise ValueError(f"Run ID {run_id} not found")
        
        run_info = self.active_runs[run_id]
        repo_path = Path(run_info['repo_path'])
        run_dir = Path(run_info['output_dir'])
        log_file = Path(run_info['log_file'])
        
        # Update status
        run_info['status'] = CodexRunStatus.RUNNING
        
        # Build PowerShell command
        ps_command = self._get_powershell_command()
        
        # Prepare arguments
        script_args = [
            ps_command,
            "-NoProfile",
            "-ExecutionPolicy", "Bypass",
            "-File", str(self.codex_script_path),
            "-RepoRoot", str(repo_path),
            "-Model", run_info['model'],
            "-MaxParallel", str(run_info['max_parallel']),
            "-WorkDir", str(run_dir / ".codex_out")
        ]
        
        try:
            # Start PowerShell process
            process = await asyncio.create_subprocess_exec(
                *script_args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                cwd=str(repo_path)
            )
            
            run_info['process'] = process
            
            # Stream output
            line_count = 0
            with open(log_file, 'w') as log:
                async for line_bytes in process.stdout:
                    line = line_bytes.decode('utf-8', errors='replace').strip()
                    log.write(line + '\n')
                    log.flush()
                    
                    line_count += 1
                    
                    # Yield progress update
                    yield {
                        'run_id': run_id,
                        'status': CodexRunStatus.RUNNING,
                        'line_count': line_count,
                        'log_line': line,
                        'timestamp': datetime.utcnow().isoformat()
                    }
            
            # Wait for process to complete
            return_code = await process.wait()
            
            # Update status based on return code
            if return_code == 0:
                run_info['status'] = CodexRunStatus.COMPLETED
                yield {
                    'run_id': run_id,
                    'status': CodexRunStatus.COMPLETED,
                    'message': 'Codex swarm completed successfully',
                    'return_code': return_code
                }
            else:
                run_info['status'] = CodexRunStatus.FAILED
                yield {
                    'run_id': run_id,
                    'status': CodexRunStatus.FAILED,
                    'message': f'Codex swarm failed with return code {return_code}',
                    'return_code': return_code
                }
            
            run_info['end_time'] = datetime.utcnow().isoformat()
            
            # Parse findings
            findings = await self._parse_findings(run_dir)
            run_info['findings_count'] = len(findings)
            
            # Save findings
            with open(run_info['findings_file'], 'w') as f:
                json.dump(findings, f, indent=2)
            
        except Exception as e:
            logger.error(f"Codex run {run_id} failed: {e}")
            run_info['status'] = CodexRunStatus.FAILED
            run_info['error'] = str(e)
            run_info['end_time'] = datetime.utcnow().isoformat()
            
            yield {
                'run_id': run_id,
                'status': CodexRunStatus.FAILED,
                'message': f'Error: {str(e)}',
                'error': str(e)
            }
        finally:
            # Save updated metadata
            metadata_file = run_dir / 'metadata.json'
            with open(metadata_file, 'w') as f:
                json.dump(run_info, f, indent=2, default=str)
    
    async def _parse_findings(self, run_dir: Path) -> list[Dict[str, Any]]:
        """
        Parse Codex findings from output directory.
        
        Args:
            run_dir: Directory containing Codex output
            
        Returns:
            List of finding dictionaries
        """
        findings = []
        codex_out = run_dir / ".codex_out"
        
        if not codex_out.exists():
            return findings
        
        try:
            # Iterate through agent output directories
            for agent_dir in codex_out.iterdir():
                if not agent_dir.is_dir():
                    continue
                
                # Look for standard output files
                log_file = agent_dir / "codex.log"
                if log_file.exists():
                    with open(log_file, 'r') as f:
                        log_content = f.read()
                    
                    # Extract finding info from directory name
                    # Format: {role}_{shard}
                    parts = agent_dir.name.split('_', 1)
                    role = parts[0] if len(parts) > 0 else 'unknown'
                    shard = parts[1] if len(parts) > 1 else 'unknown'
                    
                    findings.append({
                        'id': str(uuid.uuid4()),
                        'agent_role': role,
                        'shard': shard,
                        'log_content': log_content[:1000],  # Limit size
                        'log_file': str(log_file),
                        'directory': str(agent_dir)
                    })
        except Exception as e:
            logger.error(f"Failed to parse findings: {e}")
        
        return findings
    
    async def cancel_run(self, run_id: str) -> bool:
        """
        Cancel a running Codex swarm.
        
        Args:
            run_id: Run identifier
            
        Returns:
            True if cancelled successfully, False otherwise
        """
        if run_id not in self.active_runs:
            return False
        
        run_info = self.active_runs[run_id]
        process = run_info.get('process')
        
        if process and run_info['status'] == CodexRunStatus.RUNNING:
            try:
                process.terminate()
                await asyncio.wait_for(process.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                process.kill()
            
            run_info['status'] = CodexRunStatus.CANCELLED
            run_info['end_time'] = datetime.utcnow().isoformat()
            
            return True
        
        return False
    
    def get_run_status(self, run_id: str) -> Optional[Dict[str, Any]]:
        """
        Get the status of a Codex run.
        
        Args:
            run_id: Run identifier
            
        Returns:
            Run status dictionary or None if not found
        """
        if run_id not in self.active_runs:
            # Try to load from disk
            run_dir = self.output_dir / run_id
            metadata_file = run_dir / 'metadata.json'
            
            if metadata_file.exists():
                with open(metadata_file, 'r') as f:
                    return json.load(f)
        
        return self.active_runs.get(run_id)
    
    def list_runs(self) -> list[Dict[str, Any]]:
        """
        List all Codex runs (active and completed).
        
        Returns:
            List of run status dictionaries
        """
        runs = []
        
        # Add active runs
        runs.extend(self.active_runs.values())
        
        # Add completed runs from disk
        for run_dir in self.output_dir.iterdir():
            if not run_dir.is_dir():
                continue
            
            metadata_file = run_dir / 'metadata.json'
            if metadata_file.exists():
                run_id = run_dir.name
                if run_id not in self.active_runs:
                    with open(metadata_file, 'r') as f:
                        runs.append(json.load(f))
        
        # Sort by start time (newest first)
        runs.sort(key=lambda x: x.get('start_time', ''), reverse=True)
        
        return runs
    
    def get_findings(self, run_id: str) -> list[Dict[str, Any]]:
        """
        Get findings from a completed Codex run.
        
        Args:
            run_id: Run identifier
            
        Returns:
            List of finding dictionaries
        """
        run_dir = self.output_dir / run_id
        findings_file = run_dir / 'findings.json'
        
        if findings_file.exists():
            with open(findings_file, 'r') as f:
                return json.load(f)
        
        return []
