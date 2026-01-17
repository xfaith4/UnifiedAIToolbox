"""
Orchestrator verification runner.

Provides optional verification capabilities for orchestration runs including:
- Build verification
- Test verification (unit, smoke)
- Linting
- Docker Compose validation
"""

import logging
import subprocess
import json
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple

logger = logging.getLogger(__name__)


class OrchestratorVerifier:
    """
    Verification runner for orchestration artifacts.
    
    Executes builds, tests, lints, and validates configurations
    when appropriate files exist in the run directory.
    """
    
    def __init__(self, run_dir: Path, log_dir: Optional[Path] = None):
        """
        Initialize verifier.
        
        Args:
            run_dir: Directory containing generated artifacts
            log_dir: Directory for detailed logs (defaults to run_dir/logs)
        """
        self.run_dir = Path(run_dir)
        self.log_dir = Path(log_dir) if log_dir else self.run_dir / "logs"
        self.log_dir.mkdir(parents=True, exist_ok=True)
    
    def _run_command(
        self,
        command: List[str],
        cwd: Optional[Path] = None,
        timeout: int = 300,
        log_name: Optional[str] = None,
    ) -> Tuple[bool, str, Optional[str]]:
        """
        Run a shell command and capture output.
        
        Args:
            command: Command and arguments
            cwd: Working directory (defaults to run_dir)
            timeout: Timeout in seconds
            log_name: Name for log file (if None, logs not saved)
            
        Returns:
            Tuple of (success, short_output, log_path)
        """
        cwd = cwd or self.run_dir
        log_path = None
        
        try:
            result = subprocess.run(
                command,
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            
            success = result.returncode == 0
            output = result.stdout + result.stderr
            
            # Truncate for short output (first 500 chars)
            short_output = output[:500]
            if len(output) > 500:
                short_output += "\n... (truncated)"
            
            # Save full log if log_name provided
            if log_name:
                log_path = str(self.log_dir / f"{log_name}.log")
                Path(log_path).write_text(output, encoding='utf-8')
            
            return success, short_output, log_path
            
        except subprocess.TimeoutExpired:
            error_msg = f"Command timed out after {timeout}s"
            if log_name:
                log_path = str(self.log_dir / f"{log_name}.log")
                Path(log_path).write_text(error_msg, encoding='utf-8')
            return False, error_msg, log_path
            
        except Exception as e:
            error_msg = f"Command failed: {e}"
            if log_name:
                log_path = str(self.log_dir / f"{log_name}.log")
                Path(log_path).write_text(error_msg, encoding='utf-8')
            return False, error_msg, log_path
    
    def verify_lint(self) -> Optional[Dict[str, Any]]:
        """
        Run linting if applicable config exists.
        
        Returns:
            Dict with passed, output, log_path or None if no linter found
        """
        # Check for common linter configs
        lint_configs = [
            (".eslintrc.js", ["npm", "run", "lint"]),
            (".eslintrc.json", ["npm", "run", "lint"]),
            ("pyproject.toml", ["pylint", "."]),
            (".pylintrc", ["pylint", "."]),
            ("tslint.json", ["npm", "run", "lint"]),
        ]
        
        for config_file, command in lint_configs:
            if (self.run_dir / config_file).exists():
                passed, output, log_path = self._run_command(
                    command,
                    log_name="lint",
                    timeout=120,
                )
                return {
                    "passed": passed,
                    "output": output,
                    "log_path": log_path,
                }
        
        return None
    
    def verify_build(self) -> Optional[Dict[str, Any]]:
        """
        Run build if applicable config exists.
        
        Returns:
            Dict with passed, output, log_path or None if no build found
        """
        # Check for common build configs
        build_configs = [
            ("package.json", ["npm", "run", "build"]),
            ("Makefile", ["make", "build"]),
            ("pyproject.toml", ["python", "-m", "build"]),
            ("go.mod", ["go", "build", "./..."]),
            ("Cargo.toml", ["cargo", "build"]),
        ]
        
        for config_file, command in build_configs:
            if (self.run_dir / config_file).exists():
                # Special check for npm: ensure build script exists
                if config_file == "package.json":
                    try:
                        with open(self.run_dir / "package.json") as f:
                            pkg = json.load(f)
                            if "build" not in pkg.get("scripts", {}):
                                continue
                    except Exception:
                        continue
                
                passed, output, log_path = self._run_command(
                    command,
                    log_name="build",
                    timeout=600,
                )
                return {
                    "passed": passed,
                    "output": output,
                    "log_path": log_path,
                }
        
        return None
    
    def verify_unit_tests(self) -> Optional[Dict[str, Any]]:
        """
        Run unit tests if applicable config exists.
        
        Returns:
            Dict with passed, output, log_path or None if no tests found
        """
        # Check for common test configs
        test_configs = [
            ("package.json", ["npm", "test"]),
            ("pytest.ini", ["pytest"]),
            ("pyproject.toml", ["pytest"]),
            ("go.mod", ["go", "test", "./..."]),
            ("Cargo.toml", ["cargo", "test"]),
        ]
        
        for config_file, command in test_configs:
            if (self.run_dir / config_file).exists():
                # Special check for npm: ensure test script exists
                if config_file == "package.json":
                    try:
                        with open(self.run_dir / "package.json") as f:
                            pkg = json.load(f)
                            if "test" not in pkg.get("scripts", {}):
                                continue
                    except Exception:
                        continue
                
                passed, output, log_path = self._run_command(
                    command,
                    log_name="unit_tests",
                    timeout=600,
                )
                return {
                    "passed": passed,
                    "output": output,
                    "log_path": log_path,
                }
        
        return None
    
    def verify_smoke_tests(self) -> Optional[Dict[str, Any]]:
        """
        Run smoke tests if applicable script exists.
        
        Returns:
            Dict with passed, output, log_path or None if no smoke tests found
        """
        # Check for smoke test scripts
        smoke_scripts = [
            ("smoke.sh", ["bash", "smoke.sh"]),
            ("smoke.py", ["python", "smoke.py"]),
            ("package.json", ["npm", "run", "smoke"]),
        ]
        
        for script_file, command in smoke_scripts:
            if (self.run_dir / script_file).exists():
                # Special check for npm: ensure smoke script exists
                if script_file == "package.json":
                    try:
                        with open(self.run_dir / "package.json") as f:
                            pkg = json.load(f)
                            if "smoke" not in pkg.get("scripts", {}):
                                continue
                    except Exception:
                        continue
                
                passed, output, log_path = self._run_command(
                    command,
                    log_name="smoke_tests",
                    timeout=300,
                )
                return {
                    "passed": passed,
                    "output": output,
                    "log_path": log_path,
                }
        
        return None
    
    def verify_docker_compose(self) -> Optional[bool]:
        """
        Validate docker-compose file if it exists.
        
        Returns:
            True if valid, False if invalid, None if no compose file
        """
        compose_files = ["docker-compose.yml", "docker-compose.yaml"]
        
        for compose_file in compose_files:
            if (self.run_dir / compose_file).exists():
                passed, output, _ = self._run_command(
                    ["docker-compose", "-f", compose_file, "config"],
                    log_name="docker_compose_validation",
                    timeout=30,
                )
                return passed
        
        return None
    
    def run_all_verifications(self) -> Dict[str, Any]:
        """
        Run all applicable verifications.
        
        Returns:
            Dict containing all verification results and log paths
        """
        results = {
            "lint_result": self.verify_lint(),
            "build_result": self.verify_build(),
            "unit_test_result": self.verify_unit_tests(),
            "smoke_test_result": self.verify_smoke_tests(),
            "docker_compose_valid": self.verify_docker_compose(),
            "paths_to_full_logs": [],
        }
        
        # Collect all log paths
        log_paths = []
        for key in ["lint_result", "build_result", "unit_test_result", "smoke_test_result"]:
            result = results[key]
            if result and result.get("log_path"):
                log_paths.append(result["log_path"])
        
        results["paths_to_full_logs"] = log_paths
        
        return results
