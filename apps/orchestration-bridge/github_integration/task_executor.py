"""Task executor for running TaskGraph tasks with Codex swarm support."""

import asyncio
import json
import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Callable

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
        progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
        cancel_event: Optional[asyncio.Event] = None,
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
        user_goal = (taskgraph.get("user_goal") or "").strip()
        tasks = taskgraph.get("tasks") or []

        results: List[Dict[str, Any]] = []
        completed: Set[str] = set()
        conflict_busy: Set[str] = set()

        for task in tasks:
            if cancel_event and cancel_event.is_set():
                results.append(
                    {
                        "task_id": task.get("id"),
                        "status": "cancelled",
                        "artifacts": {},
                    }
                )
                break
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
            result = self._execute_task(
                repo_path,
                run_id,
                task,
                user_goal=user_goal,
                progress_callback=progress_callback,
                cancel_event=cancel_event,
            )
            conflict_busy.discard(conflict_group)
            completed.add(task_id)
            results.append(result)

        summary_path = self.runs_dir / run_id / "task_results.json"
        summary_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
        return {"tasks": results, "results_file": str(summary_path)}

    def _execute_task(
        self,
        repo_path: Path,
        run_id: str,
        task: Dict[str, Any],
        user_goal: str = "",
        progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None,
        cancel_event: Optional[asyncio.Event] = None,
    ) -> Dict[str, Any]:
        task_id = task["id"]
        branch = self._normalize_branch_name(task.get("branch") or f"{run_id}-{task_id}")
        allowed_paths = task.get("file_scope") or ["."]
        task_dir = self.runs_dir / run_id / "tasks" / task_id
        task_dir.mkdir(parents=True, exist_ok=True)

        # Create isolated worktree
        worktrees_dir = self.runs_dir / run_id / "worktrees"
        worktrees_dir.mkdir(parents=True, exist_ok=True)
        worktree_path = worktrees_dir / task_id
        if worktree_path.exists():
            shutil.rmtree(worktree_path)

        # Never allow interactive git credential prompts in headless runs.
        os.environ.setdefault("GIT_TERMINAL_PROMPT", "0")

        # Create or reset a task branch and attach a worktree to it.
        self._run_cmd(
            [
                "git",
                "-C",
                str(repo_path),
                "worktree",
                "add",
                "-B",
                branch,
                str(worktree_path),
                "HEAD",
            ]
        )

        log_lines: List[str] = []
        findings: List[Dict[str, Any]] = []
        codex_run_id: Optional[str] = None
        status = "completed"
        violation_file: Optional[Path] = None

        try:
            task_title = (task.get("title") or task_id).strip()
            task_rationale = (task.get("rationale") or "").strip()
            goal_parts = [f"Task: {task_title}"]
            if user_goal:
                goal_parts.append(f"User goal: {user_goal}")
            if task_rationale:
                goal_parts.append(f"Rationale: {task_rationale}")
            task_goal = "\n".join(goal_parts).strip()

            codex_run_id = asyncio.run(
                self.codex_service.start_codex_run(
                    repo_path=worktree_path,
                    model="gpt-5-codex",
                    max_parallel=1,
                    run_id=f"{run_id}-{task_id}",
                    goal=task_goal,
                )
            )

            if progress_callback:
                progress_callback(
                    {
                        "task_id": task_id,
                        "event": "codex_run_started",
                        "codex_run_id": codex_run_id,
                    }
                )

            # Consume the async generator to completion
            async def _consume():
                last_event: Dict[str, Any] | None = None
                async for _ in self.codex_service.execute_codex_run(codex_run_id):
                    last_event = _
                    if cancel_event and cancel_event.is_set():
                        await self.codex_service.cancel_run(codex_run_id)
                        raise TaskExecutionError("cancelled")
                    if progress_callback:
                        progress_callback({**_, "task_id": task_id})

                # If Codex reports a terminal failure status, treat that as a task failure.
                if last_event and last_event.get("status") in (CodexRunStatus.FAILED, CodexRunStatus.CANCELLED):
                    message = last_event.get("message") or last_event.get("error") or "Codex run failed"
                    return_code = last_event.get("return_code")
                    detail = f"{message}" + (f" (return_code={return_code})" if return_code is not None else "")
                    raise TaskExecutionError(detail)

            asyncio.run(_consume())

            # Double-check persisted status in case the stream didn't include a terminal event.
            status_info = self.codex_service.get_run_status(codex_run_id) or {}
            if status_info.get("status") in (CodexRunStatus.FAILED, CodexRunStatus.CANCELLED):
                message = status_info.get("error") or status_info.get("message") or "Codex run failed"
                raise TaskExecutionError(message)

            findings = self.codex_service.get_findings(codex_run_id) or []
        except (GithubException, Exception) as exc:
            if isinstance(exc, TaskExecutionError) and str(exc) == "cancelled":
                status = "cancelled"
            else:
                status = "failed"
            err_text = str(exc) or exc.__class__.__name__
            log_lines.append(f"[error] {err_text}")
            if progress_callback and status == "failed":
                progress_callback(
                    {
                        "task_id": task_id,
                        "event": "task_failed",
                        "message": err_text,
                        "codex_run_id": codex_run_id,
                    }
                )

        # Capture diff (before any commit) and enforce scope
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

        # If successful and changes exist, commit them on the task branch.
        if status == "completed" and not violation_paths:
            if self._has_changes(worktree_path):
                self._commit_changes(worktree_path, task_id)

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

        # Remove the worktree to keep the run directory tidy.
        self._run_cmd(["git", "-C", str(repo_path), "worktree", "remove", "--force", str(worktree_path)], check=False)
        if worktree_path.exists():
            shutil.rmtree(worktree_path, ignore_errors=True)

        return {
            "task_id": task_id,
            "branch": branch,
            "status": status,
            "codex_run_id": codex_run_id,
            "artifacts": {
                "log": str(artifacts.log_file),
                "findings": str(artifacts.findings_file),
                "diff": str(artifacts.diff_file),
                "violation": str(artifacts.violation_file) if artifacts.violation_file else None,
            },
        }

    def _normalize_branch_name(self, branch: str) -> str:
        branch = (branch or "task").strip().lower()
        branch = re.sub(r"[^a-z0-9._/-]+", "-", branch)
        branch = re.sub(r"-+", "-", branch)
        branch = branch.strip("-./")
        return branch[:120] or "task"

    def _has_changes(self, repo_path: Path) -> bool:
        proc = self._run_cmd(["git", "-C", str(repo_path), "status", "--porcelain"], check=False)
        return bool((proc.stdout or "").strip())

    def _commit_changes(self, repo_path: Path, task_id: str) -> None:
        # Avoid committing orchestration artifacts into the target repo.
        self._run_cmd(
            [
                "git",
                "-C",
                str(repo_path),
                "add",
                "-A",
                "--",
                ".",
                ":!swarm-output",
                ":!agent_workspace",
            ],
            check=True,
        )
        msg = f"Orchestration: {task_id}"
        self._run_cmd(
            [
                "git",
                "-C",
                str(repo_path),
                "-c",
                "user.email=orchestration-bridge@local",
                "-c",
                "user.name=Orchestration Bridge",
                "commit",
                "-m",
                msg,
            ],
            check=False,
        )

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
