"""
Orchestrator verification runner.

Provides optional verification capabilities for orchestration runs including:
- Artifact normalization
- Build verification
- Test verification (unit, smoke)
- Linting
- Docker Compose validation
"""

import logging
import shutil
import subprocess
import json
import os
import socket
import time
import urllib.error
import urllib.request
import re
from pathlib import Path
from typing import Dict, Any, Optional, List, Tuple

NON_NODE_PROJECT_MARKER_FILES = (
    "requirements.txt",
    "pyproject.toml",
    "Pipfile",
    "setup.py",
    "setup.cfg",
    "Cargo.toml",
    "go.mod",
)
NON_NODE_PROJECT_MARKER_GLOBS = ("*.psm1", "*.psd1", "*.ps1")
NODE_DEP_KEYS = ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies")

logger = logging.getLogger(__name__)
RUNTIME_ERROR_PATTERNS = (
    re.compile(r"\bruntime error\b", re.IGNORECASE),
    re.compile(r"\b(unhandled )?exception\b", re.IGNORECASE),
    re.compile(r"\bunhandled\s*rejection\b", re.IGNORECASE),
    re.compile(r"\b(typeerror|referenceerror|syntaxerror)\b", re.IGNORECASE),
    re.compile(r"\bfailed to compile\b", re.IGNORECASE),
    re.compile(r"\berror:\s", re.IGNORECASE),
)
# These phrases often appear in successful compiler/linter summaries.
RUNTIME_ERROR_IGNORES = ("0 errors", "no errors")


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
        env: Optional[Dict[str, str]] = None,
    ) -> Tuple[bool, str, Optional[str], int]:
        """
        Run a shell command and capture output.
        
        Args:
            command: Command and arguments
            cwd: Working directory (defaults to run_dir)
            timeout: Timeout in seconds
            log_name: Name for log file (if None, logs not saved)
            
        Returns:
            Tuple of (success, short_output, log_path, returncode)
        """
        cwd = cwd or self.run_dir
        log_path = None
        command = self._resolve_command_executable(command)

        try:
            result = subprocess.run(
                command,
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=timeout,
                env={**os.environ, **(env or {})},
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
            
            return success, short_output, log_path, result.returncode
            
        except subprocess.TimeoutExpired:
            error_msg = f"Command timed out after {timeout}s"
            if log_name:
                log_path = str(self.log_dir / f"{log_name}.log")
                Path(log_path).write_text(error_msg, encoding='utf-8')
            return False, error_msg, log_path, -1
        except Exception as e:
            error_msg = f"Command failed: {e}"
            if log_name:
                log_path = str(self.log_dir / f"{log_name}.log")
                Path(log_path).write_text(error_msg, encoding='utf-8')
            return False, error_msg, log_path, -1

    def _load_package_json(self) -> Optional[Dict[str, Any]]:
        package_json = self.run_dir / "package.json"
        if not package_json.exists():
            return None
        try:
            return json.loads(package_json.read_text(encoding="utf-8"))
        except Exception:
            return None

    def _get_package_scripts(self, pkg: Optional[Dict[str, Any]] = None) -> Dict[str, str]:
        pkg = pkg or self._load_package_json() or {}
        scripts = pkg.get("scripts") or {}
        if not isinstance(scripts, dict):
            return {}
        return {str(key): str(value) for key, value in scripts.items()}

    def _detect_node_package_manager(self, pkg: Optional[Dict[str, Any]] = None) -> str:
        pkg = pkg or self._load_package_json() or {}
        package_manager = str(pkg.get("packageManager") or "").strip().lower()
        for candidate in ("pnpm", "yarn", "bun", "npm"):
            if package_manager == candidate or package_manager.startswith(f"{candidate}@"):
                return candidate

        if (self.run_dir / "pnpm-lock.yaml").exists():
            return "pnpm"
        if (self.run_dir / "yarn.lock").exists():
            return "yarn"
        if (self.run_dir / "bun.lockb").exists() or (self.run_dir / "bun.lock").exists():
            return "bun"
        return "npm"

    def _get_package_script_command(
        self,
        script_name: str,
        extra_args: Optional[List[str]] = None,
    ) -> Optional[List[str]]:
        pkg = self._load_package_json()
        if not pkg:
            return None
        if script_name not in self._get_package_scripts(pkg):
            return None

        package_manager = self._detect_node_package_manager(pkg)
        extra_args = extra_args or []
        if package_manager == "yarn":
            return ["yarn", "run", script_name, *extra_args]
        if package_manager == "pnpm":
            return ["pnpm", "run", script_name, *(["--"] + extra_args if extra_args else [])]
        if package_manager == "bun":
            return ["bun", "run", script_name, *(["--"] + extra_args if extra_args else [])]
        return ["npm", "run", script_name, *(["--"] + extra_args if extra_args else [])]

    def _get_install_command(self, pkg: Optional[Dict[str, Any]] = None) -> Optional[List[str]]:
        pkg = pkg or self._load_package_json()
        if not pkg:
            return None

        package_manager = self._detect_node_package_manager(pkg)
        has_lock = any(
            (self.run_dir / lockfile).exists()
            for lockfile in ("package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "bun.lock")
        )

        if package_manager == "pnpm":
            return ["pnpm", "install", "--frozen-lockfile"] if has_lock else ["pnpm", "install"]
        if package_manager == "yarn":
            return ["yarn", "install", "--frozen-lockfile"] if has_lock else ["yarn", "install"]
        if package_manager == "bun":
            return ["bun", "install", "--frozen-lockfile"] if has_lock else ["bun", "install"]
        command = ["npm", "install", "--no-audit", "--no-fund"]
        if has_lock:
            command = ["npm", "ci", "--no-audit", "--no-fund"]
        return command

    def _resolve_node_pm_executable(self, package_manager: str) -> Optional[str]:
        return shutil.which(package_manager)

    def _resolve_command_executable(self, command: List[str]) -> List[str]:
        """
        Resolve command[0] to its full path via shutil.which when possible.

        Windows-specific quirk: ``subprocess.run(["npm", ...])`` raises
        ``FileNotFoundError`` when npm is installed as ``npm.CMD`` because
        ``_winapi.CreateProcess`` doesn't honor PATHEXT shim resolution the
        way shells do. ``shutil.which`` *does* find the .CMD shim, but
        subprocess can only execute it when given the resolved absolute path.
        Resolving here closes the gap so the install/build/test gates can
        actually run the package manager they detected.

        If the first arg is already absolute, or shutil.which returns nothing,
        the command is returned unchanged so the existing exception-handling
        path in _run_command preserves backward-compatible behavior.
        """
        if not command:
            return command
        first = command[0]
        if not first or os.path.isabs(first):
            return command
        resolved = shutil.which(first)
        if not resolved:
            return command
        return [resolved, *command[1:]]

    def _has_non_node_project_markers(self) -> bool:
        for marker in NON_NODE_PROJECT_MARKER_FILES:
            if (self.run_dir / marker).exists():
                return True
        for pattern in NON_NODE_PROJECT_MARKER_GLOBS:
            try:
                if any(self.run_dir.glob(pattern)):
                    return True
            except OSError:
                continue
        return False

    def _package_json_looks_like_placeholder(self, pkg: Dict[str, Any]) -> bool:
        for key in NODE_DEP_KEYS:
            deps = pkg.get(key)
            if isinstance(deps, dict) and deps:
                return False
        return self._has_non_node_project_markers()

    def _find_available_port(self, host: str = "127.0.0.1") -> int:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            probe.bind((host, 0))
            return int(probe.getsockname()[1])

    def _is_port_available(self, port: int, host: str = "127.0.0.1") -> bool:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            try:
                probe.bind((host, port))
                return True
            except OSError:
                return False

    def _read_short_log_output(self, log_path: Path) -> str:
        try:
            output = log_path.read_text(encoding="utf-8")
        except Exception as exc:
            return f"Unable to read log output: {exc}"
        short_output = output[:500]
        if len(output) > 500:
            short_output += "\n... (truncated)"
        return short_output

    def _wait_for_http_server(self, url: str, process: subprocess.Popen, timeout: int = 45) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline:
            if process.poll() is not None:
                return False
            try:
                with urllib.request.urlopen(url, timeout=2):
                    return True
            except urllib.error.HTTPError:
                return True
            except Exception:
                time.sleep(1)
        return False

    def _wait_for_any_http_server(
        self,
        urls: List[str],
        process: subprocess.Popen,
        timeout: int = 45,
    ) -> Optional[str]:
        deadline = time.time() + timeout
        while time.time() < deadline:
            if process.poll() is not None:
                return None
            for url in urls:
                try:
                    with urllib.request.urlopen(url, timeout=2):
                        return url
                except urllib.error.HTTPError:
                    return url
                except Exception:
                    continue
            time.sleep(1)
        return None

    def _probe_http_page(self, url: str, timeout: int = 5) -> Tuple[bool, str]:
        try:
            with urllib.request.urlopen(url, timeout=timeout) as response:
                status = int(getattr(response, "status", 200))
                if status >= 500:
                    return False, f"HTTP probe to {url} returned status {status}"
                # Consume a small response chunk to ensure the route can actually stream content.
                response.read(8192)
                return True, f"HTTP probe to {url} succeeded with status {status}."
        except Exception as exc:
            return False, f"HTTP probe to {url} failed: {exc}"

    def _extract_runtime_errors(self, log_output: str, max_items: int = 3) -> List[str]:
        findings: List[str] = []
        for raw_line in str(log_output or "").splitlines():
            line = raw_line.strip()
            if not line:
                continue
            lowered = line.lower()
            if any(ignore in lowered for ignore in RUNTIME_ERROR_IGNORES):
                continue
            if any(pattern.search(line) for pattern in RUNTIME_ERROR_PATTERNS):
                findings.append(line)
                if len(findings) >= max_items:
                    break
        return findings

    def _terminate_process(self, process: subprocess.Popen) -> None:
        if process.poll() is not None:
            return
        try:
            process.terminate()
            process.wait(timeout=10)
        except Exception:
            try:
                process.kill()
                process.wait(timeout=5)
            except Exception:
                pass

    def _make_skipped_result(self, summary: str, command: Optional[List[str]] = None) -> Dict[str, Any]:
        return {
            "status": "skipped",
            "summary": summary,
            "command": " ".join(command) if command else None,
            "exit_code": None,
            "log_path": None,
        }

    def _resolve_dev_server_plan(self, script_name: str, pkg: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        pkg = pkg or self._load_package_json() or {}
        scripts = self._get_package_scripts(pkg)
        script_body = scripts.get(script_name, "").lower()
        port = self._find_available_port("127.0.0.1")
        host = "127.0.0.1"

        supports_next_flags = "next " in script_body or script_body.startswith("next")
        supports_vite_style_flags = any(
            token in script_body
            for token in ("vite", "astro", "svelte-kit", "storybook", "webpack serve", "webpack-dev-server")
        )
        supports_port_only_flags = "serve " in script_body or script_body.startswith("serve")

        candidate_ports = [port]
        for default_port in (3000, 3001, 4173, 5173, 5174, 8080):
            if default_port != port and self._is_port_available(default_port, host):
                candidate_ports.append(default_port)

        extra_args: List[str] = []
        if supports_next_flags:
            extra_args = ["--hostname", host, "--port", str(port)]
            candidate_ports = [port]
        elif supports_vite_style_flags:
            extra_args = ["--host", host, "--port", str(port)]
            candidate_ports = [port]
        elif supports_port_only_flags:
            extra_args = ["--listen", str(port)]
            candidate_ports = [port]

        command = self._get_package_script_command(script_name, extra_args=extra_args) or []

        probe_urls = [f"http://{host}:{candidate_port}" for candidate_port in candidate_ports]
        env = {
            "HOST": host,
            "HOSTNAME": host,
            "PORT": str(port),
            "BROWSER": "none",
            "CI": "true",
            "NO_COLOR": "1",
        }
        return {
            "command": command,
            "port": port,
            "env": env,
            "probe_urls": probe_urls,
        }

    def verify_install(self) -> Optional[Dict[str, Any]]:
        """
        Install dependencies for Node apps when package metadata is present.

        Returns:
            Dict with passed, output, log_path or None if no installable app found
        """
        pkg = self._load_package_json()
        if not pkg:
            return None

        if self._package_json_looks_like_placeholder(pkg):
            return {
                "status": "skipped",
                "summary": (
                    "Non-Node project detected (package.json declares no dependencies "
                    "and Python/PowerShell/Go/Rust project markers are present); "
                    "skipping npm install gate."
                ),
                "command": None,
                "exit_code": None,
                "log_path": None,
            }

        command = self._get_install_command(pkg)
        if not command:
            return None

        package_manager = command[0]
        if not self._resolve_node_pm_executable(package_manager):
            return {
                "status": "skipped",
                "summary": (
                    f"Node package manager '{package_manager}' was not found on PATH; "
                    "skipping install gate."
                ),
                "command": " ".join(command),
                "exit_code": None,
                "log_path": None,
            }

        passed, output, log_path, returncode = self._run_command(
            command,
            log_name="install",
            timeout=900,
            env={
                "CI": "true",
                "NO_COLOR": "1",
                "BROWSER": "none",
            },
        )
        return {
            "passed": passed,
            "output": output,
            "log_path": log_path,
            "command": " ".join(command),
            "exit_code": returncode,
        }
    
    def verify_lint(self) -> Optional[Dict[str, Any]]:
        """
        Run linting if applicable config exists.
        
        Returns:
            Dict with passed, output, log_path or None if no linter found
        """
        # Check for common linter configs
        lint_command = self._get_package_script_command("lint")
        if lint_command:
            passed, output, log_path, returncode = self._run_command(
                lint_command,
                log_name="lint",
                timeout=180,
            )
            return {
                "passed": passed,
                "output": output,
                "log_path": log_path,
                "command": " ".join(lint_command),
                "exit_code": returncode,
            }

        lint_configs = [
            ("pyproject.toml", ["pylint", "."]),
            (".pylintrc", ["pylint", "."]),
        ]
        
        for config_file, command in lint_configs:
            if (self.run_dir / config_file).exists():
                passed, output, log_path, returncode = self._run_command(
                    command,
                    log_name="lint",
                    timeout=120,
                )
                return {
                    "passed": passed,
                    "output": output,
                    "log_path": log_path,
                    "command": " ".join(command),
                    "exit_code": returncode,
                }
        
        return None
    
    def verify_build(self) -> Optional[Dict[str, Any]]:
        """
        Run build if applicable config exists.
        
        Returns:
            Dict with passed, output, log_path or None if no build found
        """
        # Check for common build configs
        build_command = self._get_package_script_command("build")
        if build_command:
            passed, output, log_path, returncode = self._run_command(
                build_command,
                log_name="build",
                timeout=600,
            )
            return {
                "passed": passed,
                "output": output,
                "log_path": log_path,
                "command": " ".join(build_command),
                "exit_code": returncode,
            }

        build_configs = [
            ("Makefile", ["make", "build"]),
            ("pyproject.toml", ["python", "-m", "build"]),
            ("go.mod", ["go", "build", "./..."]),
            ("Cargo.toml", ["cargo", "build"]),
        ]
        
        for config_file, command in build_configs:
            if (self.run_dir / config_file).exists():
                passed, output, log_path, returncode = self._run_command(
                    command,
                    log_name="build",
                    timeout=600,
                )
                return {
                    "passed": passed,
                    "output": output,
                    "log_path": log_path,
                    "command": " ".join(command),
                    "exit_code": returncode,
                }
        
        return None
    
    def verify_unit_tests(self) -> Optional[Dict[str, Any]]:
        """
        Run unit tests if applicable config exists.
        
        Returns:
            Dict with passed, output, log_path or None if no tests found
        """
        # Check for common test configs
        test_command = self._get_package_script_command("test")
        if test_command:
            passed, output, log_path, returncode = self._run_command(
                test_command,
                log_name="unit_tests",
                timeout=600,
            )
            return {
                "passed": passed,
                "output": output,
                "log_path": log_path,
                "command": " ".join(test_command),
                "exit_code": returncode,
            }

        test_configs = [
            ("pytest.ini", ["pytest"]),
            ("pyproject.toml", ["pytest"]),
            ("go.mod", ["go", "test", "./..."]),
            ("Cargo.toml", ["cargo", "test"]),
        ]
        
        for config_file, command in test_configs:
            if (self.run_dir / config_file).exists():
                passed, output, log_path, returncode = self._run_command(
                    command,
                    log_name="unit_tests",
                    timeout=600,
                )
                return {
                    "passed": passed,
                    "output": output,
                    "log_path": log_path,
                    "command": " ".join(command),
                    "exit_code": returncode,
                }
        
        return None
    
    def verify_smoke_tests(self) -> Optional[Dict[str, Any]]:
        """
        Run smoke tests if applicable script exists.
        
        Returns:
            Dict with passed, output, log_path or None if no smoke tests found
        """
        # Check for smoke test scripts
        smoke_command = self._get_package_script_command("smoke")
        if smoke_command:
            passed, output, log_path, returncode = self._run_command(
                smoke_command,
                log_name="smoke_tests",
                timeout=300,
            )
            return {
                "passed": passed,
                "output": output,
                "log_path": log_path,
                "command": " ".join(smoke_command),
                "exit_code": returncode,
            }

        smoke_scripts = [
            ("smoke.sh", ["bash", "smoke.sh"]),
            ("smoke.py", ["python", "smoke.py"]),
        ]
        
        for script_file, command in smoke_scripts:
            if (self.run_dir / script_file).exists():
                passed, output, log_path, returncode = self._run_command(
                    command,
                    log_name="smoke_tests",
                    timeout=300,
                )
                return {
                    "passed": passed,
                    "output": output,
                    "log_path": log_path,
                    "command": " ".join(command),
                    "exit_code": returncode,
                }
        
        return None

    def verify_dev_server(self) -> Optional[Dict[str, Any]]:
        """
        Start a local dev server and confirm it responds over HTTP.

        Returns:
            Dict with passed, output, log_path or None if no dev/start script found
        """
        pkg = self._load_package_json()
        if not pkg:
            return None

        if self._package_json_looks_like_placeholder(pkg):
            return {
                "status": "skipped",
                "summary": (
                    "Non-Node project detected (package.json declares no dependencies "
                    "and Python/PowerShell/Go/Rust project markers are present); "
                    "skipping dev server gate."
                ),
                "command": None,
                "exit_code": None,
                "log_path": None,
            }

        scripts = self._get_package_scripts(pkg)
        script_name = "dev" if "dev" in scripts else "start" if "start" in scripts else None
        if not script_name:
            return None

        plan = self._resolve_dev_server_plan(script_name, pkg)
        command = list(plan.get("command") or [])
        if not command:
            return None

        package_manager = command[0]
        if not self._resolve_node_pm_executable(package_manager):
            return {
                "status": "skipped",
                "summary": (
                    f"Node package manager '{package_manager}' was not found on PATH; "
                    "skipping dev server gate."
                ),
                "command": " ".join(command),
                "exit_code": None,
                "log_path": None,
            }

        log_path = self.log_dir / "dev_server.log"
        env = dict(plan.get("env") or {})
        probe_urls = [str(url) for url in (plan.get("probe_urls") or [])]
        # Keep ``command`` (display-friendly, e.g. ``npm run dev --host ...``)
        # for the result payload while passing the resolved-path variant to
        # subprocess.Popen so Windows ``.CMD`` shims can actually execute.
        exec_command = self._resolve_command_executable(command)
        process: Optional[subprocess.Popen] = None
        try:
            with open(log_path, "w", encoding="utf-8") as log_file:
                process = subprocess.Popen(
                    exec_command,
                    cwd=self.run_dir,
                    stdout=log_file,
                    stderr=subprocess.STDOUT,
                    text=True,
                    env={**os.environ, **env},
                )
                ready_url = self._wait_for_any_http_server(
                    probe_urls,
                    process,
                    timeout=45,
                )

            output = self._read_short_log_output(log_path)
            if ready_url:
                probe_ok, probe_summary = self._probe_http_page(ready_url)
                runtime_errors = self._extract_runtime_errors(output)
                poll_result = process.poll() if process else None
                if poll_result not in (None, 0):
                    return {
                        "passed": False,
                        "output": output or f"Dev server exited with code {poll_result} after startup on {ready_url}.",
                        "log_path": str(log_path),
                        "command": " ".join(command),
                        "exit_code": poll_result if poll_result is not None else -1,
                        "runtime_probe_url": ready_url,
                        "runtime_probe_ok": False,
                    }
                if not probe_ok or runtime_errors:
                    failure_reasons: List[str] = []
                    if not probe_ok:
                        failure_reasons.append(probe_summary)
                    if runtime_errors:
                        failure_reasons.append(
                            "Detected runtime errors after startup: " + "; ".join(runtime_errors)
                        )
                    return {
                        "passed": False,
                        "output": " ".join(failure_reasons),
                        "log_path": str(log_path),
                        "command": " ".join(command),
                        "exit_code": poll_result if poll_result is not None else 1,
                        "runtime_probe_url": ready_url,
                        "runtime_probe_ok": probe_ok,
                        "runtime_errors": runtime_errors,
                    }
                return {
                    "passed": True,
                    "output": output or probe_summary,
                    "log_path": str(log_path),
                    "command": " ".join(command),
                    "exit_code": 0,
                    "runtime_probe_url": ready_url,
                    "runtime_probe_ok": probe_ok,
                    "runtime_errors": [],
                }

            exit_code = process.poll() if process else -1
            target_summary = ", ".join(probe_urls) if probe_urls else "configured probe targets"
            summary = output or f"Dev server did not become reachable on {target_summary}"
            return {
                "passed": False,
                "output": summary,
                "log_path": str(log_path),
                "command": " ".join(command),
                "exit_code": exit_code if exit_code is not None else -1,
            }
        except Exception as e:
            if not log_path.exists():
                log_path.write_text(f"Dev server verification failed: {e}", encoding="utf-8")
            return {
                "passed": False,
                "output": f"Dev server verification failed: {e}",
                "log_path": str(log_path),
                "command": " ".join(command),
                "exit_code": -1,
            }
        finally:
            if process is not None:
                self._terminate_process(process)
    
    def verify_docker_compose(self) -> Optional[Dict[str, Any]]:
        """
        Validate docker-compose file if it exists.
        
        Returns:
            Dict with passed, output, command, exit_code or None if no compose file
        """
        compose_files = ["docker-compose.yml", "docker-compose.yaml"]
        
        for compose_file in compose_files:
            if (self.run_dir / compose_file).exists():
                passed, output, _, returncode = self._run_command(
                    ["docker-compose", "-f", compose_file, "config"],
                    log_name="docker_compose_validation",
                    timeout=30,
                )
                return {
                    "passed": passed,
                    "output": output,
                    "command": f"docker-compose -f {compose_file} config",
                    "exit_code": returncode,
                }
        
        return None
    
    def run_normalization(self) -> Optional[Dict[str, Any]]:
        """
        Run artifact normalization if enabled.
        
        Returns:
            Dict with normalization results or None if disabled
        """
        # Check if normalization is enabled via environment variable
        normalize_enabled = os.environ.get("NORMALIZE_ARTIFACTS", "true").lower() == "true"
        if not normalize_enabled:
            return None
        
        strict_mode = os.environ.get("NORMALIZE_STRICT", "false").lower() == "true"
        
        try:
            # Import normalizer (lazy import to avoid issues if module not available)
            import sys
            bridge_dir = self.run_dir.parent.parent
            normalize_path = bridge_dir / "src" / "normalize"
            
            if not normalize_path.exists():
                logger.warning(f"Normalize module not found at {normalize_path}")
                return None
            
            # Add to path if not already there
            if str(bridge_dir / "src") not in sys.path:
                sys.path.insert(0, str(bridge_dir / "src"))
            
            from normalize.normalizer import ArtifactNormalizer
            
            # Run normalization
            normalizer = ArtifactNormalizer(
                artifact_path=self.run_dir,
                normalize_enabled=True,
                strict_mode=strict_mode
            )
            
            result = normalizer.normalize()
            
            # Clean up temp workspace
            normalizer.cleanup()
            
            return result
            
        except Exception as e:
            logger.error(f"Normalization failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "report": f"Normalization error: {e}"
            }
    
    def run_all_verifications(self) -> Dict[str, Any]:
        """
        Run all applicable verifications including normalization.
        
        Returns:
            Dict containing all verification results and log paths
        """
        install_result = self.verify_install()
        install_dict = install_result if isinstance(install_result, dict) else None
        install_was_skipped = bool(
            install_dict
            and (
                str(install_dict.get("status") or "").lower() == "skipped"
                or install_dict.get("skipped")
            )
        )
        install_failed = bool(
            install_dict
            and not install_was_skipped
            and not bool(install_dict.get("passed"))
        )

        if install_failed:
            cascade_messages = {
                "lint": "Lint skipped because dependency installation failed.",
                "build": "Build skipped because dependency installation failed.",
                "unit_tests": "Unit tests skipped because dependency installation failed.",
                "smoke_tests": "Smoke tests skipped because dependency installation failed.",
                "dev_server": "Dev server proof skipped because dependency installation failed.",
            }
        elif install_was_skipped:
            reason = str(install_dict.get("summary") or "Install gate was skipped.").strip()
            cascade_messages = {
                "lint": f"Lint skipped: install gate was skipped. {reason}",
                "build": f"Build skipped: install gate was skipped. {reason}",
                "unit_tests": f"Unit tests skipped: install gate was skipped. {reason}",
                "smoke_tests": f"Smoke tests skipped: install gate was skipped. {reason}",
                "dev_server": f"Dev server proof skipped: install gate was skipped. {reason}",
            }
        else:
            cascade_messages = None

        results = {
            "normalization_result": self.run_normalization(),
            "install_result": install_result,
            "lint_result": (
                self._make_skipped_result(cascade_messages["lint"])
                if cascade_messages else self.verify_lint()
            ),
            "build_result": (
                self._make_skipped_result(cascade_messages["build"])
                if cascade_messages else self.verify_build()
            ),
            "unit_test_result": (
                self._make_skipped_result(cascade_messages["unit_tests"])
                if cascade_messages else self.verify_unit_tests()
            ),
            "smoke_test_result": (
                self._make_skipped_result(cascade_messages["smoke_tests"])
                if cascade_messages else self.verify_smoke_tests()
            ),
            "dev_server_result": (
                self._make_skipped_result(cascade_messages["dev_server"])
                if cascade_messages else self.verify_dev_server()
            ),
            "docker_compose_valid": self.verify_docker_compose(),
            "paths_to_full_logs": [],
        }
        
        # Collect all log paths
        log_paths = []
        for key in [
            "install_result",
            "lint_result",
            "build_result",
            "unit_test_result",
            "smoke_test_result",
            "dev_server_result",
        ]:
            result = results[key]
            if result and result.get("log_path"):
                log_paths.append(result["log_path"])
        
        results["paths_to_full_logs"] = log_paths
        
        return results
