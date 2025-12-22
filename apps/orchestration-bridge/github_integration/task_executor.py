"""Task executor for running TaskGraph tasks with Codex swarm support."""

import asyncio
import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from github import GithubException

from github_integration.codex_service import CodexSwarmService, CodexRunStatus


class TaskExecutionError(Exception):
    """Raised when task execution fails."""


@dataclass
class TaskArtifacts:
    """Paths to per-task artifacts."""

    log_file: Path
    findings_file: Path
    diff_file: Path
    violation_file: Optional[Path] = None


class TaskExecutor:
    """Execute TaskGraph tasks with conflict awareness and scope enforcement."""

    def __init__(
        self,
        runs_dir: Optional[Path] = None,
        codex_service: Optional[CodexSwarmService] = None,
    ):
        base_dir = runs_dir or Path(__file__).parent.parent / "runs"
        self.runs_dir = Path(base_dir)
        self.runs_dir.mkdir(parents=True, exist_ok=True)
        self.codex_service = codex_service or CodexSwarmService()

    def execute_taskgraph(
        self,
        repo_path: Path,
        run_id: str,
        taskgraph_path: Optional[Path] = None,
    ) -> Dict[str, Any]:
        """
        Execute the tasks defined in taskgraph.json sequentially respecting conflict groups.
        """
        if not run_id:
            raise TaskExecutionError("run_id is required")
        if not repo_path.exists():
            raise TaskExecutionError(f"Repository path not found: {repo_path}")

        if taskgraph_path is None:
            taskgraph_path = self.runs_dir / run_id / "taskgraph.json"
        if not taskgraph_path.exists():
            raise TaskExecutionError(f"TaskGraph not found: {taskgraph_path}")

        taskgraph = json.loads(taskgraph_path.read_text(encoding="utf-8"))
        tasks = taskgraph.get("tasks") or []

        results: List[Dict[str, Any]] = []
        completed: Set[str] = set()
        conflict_busy: Set[str] = set()

        for task in tasks:
            task_id = task.get("id")
            conflict_group = task.get("conflict_group") or ""
            deps = set(task.get("dependencies") or [])

            if not task_id:
                raise TaskExecutionError("Task is missing id")
            if not deps.issubset(completed):
                raise TaskExecutionError(f"Dependencies not met for task {task_id}")
            if conflict_group and conflict_group in conflict_busy:
                raise TaskExecutionError(f"Conflict group busy: {conflict_group}")

            conflict_busy.add(conflict_group)
            result = self._execute_task(repo_path, run_id, task)
            conflict_busy.discard(conflict_group)
            completed.add(task_id)
            results.append(result)

        summary_path = self.runs_dir / run_id / "task_results.json"
        summary_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
        return {"tasks": results, "results_file": str(summary_path)}

    def _execute_task(self, repo_path: Path, run_id: str, task: Dict[str, Any]) -> Dict[str, Any]:
        task_id = task["id"]
        allowed_paths = task.get("file_scope") or ["."]
        task_dir = self.runs_dir / run_id / "tasks" / task_id
        task_dir.mkdir(parents=True, exist_ok=True)

        # Create isolated worktree
        worktrees_dir = self.runs_dir / run_id / "worktrees"
        worktrees_dir.mkdir(parents=True, exist_ok=True)
        worktree_path = worktrees_dir / task_id
        if worktree_path.exists():
            shutil.rmtree(worktree_path)
        self._run_cmd(["git", "-C", str(repo_path), "worktree", "add", str(worktree_path), "HEAD"])

        log_lines: List[str] = []
        findings: List[Dict[str, Any]] = []
        codex_run_id: Optional[str] = None
        status = "completed"
        violation_file: Optional[Path] = None

        try:
            codex_run_id = asyncio.run(
                self.codex_service.start_codex_run(
                    repo_path=worktree_path,
                    model="gpt-5-codex",
                    max_parallel=1,
                    run_id=f"{run_id}-{task_id}",
                )
            )

            # Consume the async generator to completion
            async def _consume():
                async for _ in self.codex_service.execute_codex_run(codex_run_id):
                    pass

            asyncio.run(_consume())
            findings = self.codex_service.get_findings(codex_run_id) or []
        except (GithubException, Exception) as exc:
            status = "failed"
            log_lines.append(f"[error] {exc}")

        # Capture diff and enforce scope
        diff_text, touched_paths = self._collect_diff(worktree_path)
        diff_file = task_dir / "task_diff.patch"
        diff_file.write_text(diff_text, encoding="utf-8")

        violation_paths = [p for p in touched_paths if not self._is_allowed(p, allowed_paths)]
        if violation_paths:
            status = "failed"
            violation_file = task_dir / "scope_violation.json"
            violation_file.write_text(
                json.dumps({"task_id": task_id, "violations": violation_paths}, indent=2),
                encoding="utf-8",
            )

        # Write findings and log
        findings_file = task_dir / "task_findings.json"
        findings_file.write_text(json.dumps(findings, indent=2), encoding="utf-8")

        log_file = task_dir / "task_run.log"
        log_file.write_text("\n".join(log_lines), encoding="utf-8")

        artifacts = TaskArtifacts(
            log_file=log_file,
            findings_file=findings_file,
            diff_file=diff_file,
            violation_file=violation_file,
        )

        return {
            "task_id": task_id,
            "status": status,
            "codex_run_id": codex_run_id,
            "artifacts": {
                "log": str(artifacts.log_file),
                "findings": str(artifacts.findings_file),
                "diff": str(artifacts.diff_file),
                "violation": str(artifacts.violation_file) if artifacts.violation_file else None,
            },
        }

    def _collect_diff(self, worktree_path: Path) -> (str, List[str]):
        """Return diff patch text and list of touched paths."""
        proc = self._run_cmd(["git", "-C", str(worktree_path), "diff"], check=False)
        diff_text = proc.stdout

        touched: List[str] = []
        for line in diff_text.splitlines():
            if line.startswith("diff --git"):
                parts = line.split()
                if len(parts) >= 3:
                    path = parts[2].replace("a/", "", 1)
                    touched.append(path)
        return diff_text, touched

    def _is_allowed(self, path: str, allowlist: List[str]) -> bool:
        """Check if a path is within the allowed scope."""
        for allowed in allowlist:
            if allowed == "." or path.startswith(allowed.rstrip("/") + "/") or path == allowed:
                return True
        return False

    def _run_cmd(self, cmd: List[str], check: bool = True) -> subprocess.CompletedProcess:
        return subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=check,
        )
