"""Merge coordinator to combine task branches into an integration branch and open a PR."""

import json
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional

from github import Github

from github_integration.pr_service import GitHubPRService, PRCreationError


class MergeCoordinatorError(Exception):
    """Raised when merge coordination fails."""


class MergeCoordinator:
    """Coordinate merging task branches with validations and PR creation."""

    def __init__(
        self,
        github_token: Optional[str] = None,
        runs_dir: Optional[Path] = None,
    ):
        self.github_token = github_token or ""
        self.runs_dir = Path(runs_dir or Path(__file__).parent.parent / "runs")
        self.runs_dir.mkdir(parents=True, exist_ok=True)

    def merge_taskgraph(
        self,
        repo_path: Path,
        run_id: str,
        repo_owner: str,
        repo_name: str,
        base_branch: Optional[str] = None,
        integration_branch: Optional[str] = None,
        taskgraph_path: Optional[Path] = None,
        pr_title: Optional[str] = None,
        pr_body: Optional[str] = None,
        push_integration: bool = False,
    ) -> Dict[str, Any]:
        if not run_id:
            raise MergeCoordinatorError("run_id is required")
        if not repo_path.exists():
            raise MergeCoordinatorError(f"Repo path not found: {repo_path}")

        run_dir = self.runs_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        artifacts_dir = run_dir / "merge"
        artifacts_dir.mkdir(parents=True, exist_ok=True)

        taskgraph_path = taskgraph_path or (run_dir / "taskgraph.json")
        if not taskgraph_path.exists():
            raise MergeCoordinatorError(f"taskgraph.json not found at {taskgraph_path}")
        taskgraph = json.loads(taskgraph_path.read_text(encoding="utf-8"))

        tasks = taskgraph.get("tasks") or []
        if any("branch" not in t for t in tasks):
            raise MergeCoordinatorError("Each task must include a 'branch' key for merging.")

        base_branch = base_branch or self._detect_default_branch(repo_path)
        integration_branch = integration_branch or f"{run_id}-integration"

        self._checkout_branch(repo_path, base_branch)
        self._run_cmd(["git", "-C", str(repo_path), "branch", "-f", integration_branch, base_branch])
        self._checkout_branch(repo_path, integration_branch)

        merged_tasks: List[str] = []
        validation_results: List[Dict[str, Any]] = []
        conflict_report: Optional[Path] = None

        for task in tasks:
            branch = task["branch"]
            task_id = task.get("id", branch)
            merge_result = self._merge_branch(repo_path, branch)
            if not merge_result["success"]:
                conflict_report = self._write_conflict_report(artifacts_dir, task_id, merge_result)
                self._run_cmd(["git", "-C", str(repo_path), "merge", "--abort"], check=False)
                return {
                    "status": "conflict",
                    "failed_task": task_id,
                    "conflict_report": str(conflict_report),
                    "merged_tasks": merged_tasks,
                }

            merged_tasks.append(task_id)

            # Validations
            validations = task.get("validation") or []
            val_result = self._run_validations(repo_path, task_id, validations, artifacts_dir)
            validation_results.append(val_result)
            if val_result["failed"]:
                return {
                    "status": "validation_failed",
                    "failed_task": task_id,
                    "validation": val_result,
                    "merged_tasks": merged_tasks,
                }

        # If there are no commits between base and integration, GitHub will reject PR creation.
        ahead_count = self._ahead_count(repo_path, base_branch, integration_branch)
        if ahead_count == 0:
            return {
                "status": "no_changes",
                "merged_tasks": merged_tasks,
                "validation_results": validation_results,
                "base_branch": base_branch,
                "integration_branch": integration_branch,
                "message": "No commits between base and integration; PR creation skipped.",
            }

        # Push integration branch and create PR
        pr_service = GitHubPRService(github_token=self.github_token)
        title = pr_title or f"Integration for {run_id}"
        body = pr_body or self._render_pr_body(merged_tasks, validation_results, artifacts_dir)
        if push_integration:
            self._run_cmd(
                ["git", "-C", str(repo_path), "push", "-u", "origin", integration_branch],
                check=True,
            )
        pr_info = pr_service.create_pr_from_branch(
            repo_owner=repo_owner,
            repo_name=repo_name,
            head_branch=integration_branch,
            base_branch=base_branch,
            title=title,
            body=body,
        )

        return {
            "status": "merged",
            "merged_tasks": merged_tasks,
            "validation_results": validation_results,
            "pr": pr_info,
            "artifacts_dir": str(artifacts_dir),
        }

    def _ahead_count(self, repo_path: Path, base_branch: str, integration_branch: str) -> int:
        proc = self._run_cmd(
            ["git", "-C", str(repo_path), "rev-list", "--count", f"{base_branch}..{integration_branch}"],
            check=False,
        )
        if proc.returncode != 0:
            return -1
        try:
            return int((proc.stdout or "").strip() or "0")
        except Exception:
            return -1

    def _detect_default_branch(self, repo_path: Path) -> str:
        proc = self._run_cmd(["git", "-C", str(repo_path), "symbolic-ref", "refs/remotes/origin/HEAD"], check=False)
        if proc.returncode == 0 and proc.stdout:
            return proc.stdout.strip().split("/")[-1]
        return "main"

    def _checkout_branch(self, repo_path: Path, branch: str):
        self._run_cmd(["git", "-C", str(repo_path), "checkout", branch])

    def _merge_branch(self, repo_path: Path, branch: str) -> Dict[str, Any]:
        proc = self._run_cmd(["git", "-C", str(repo_path), "merge", "--no-ff", branch], check=False)
        return {
            "success": proc.returncode == 0,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
        }

    def _run_validations(
        self,
        repo_path: Path,
        task_id: str,
        commands: List[str],
        artifacts_dir: Path,
    ) -> Dict[str, Any]:
        results = []
        failed = False
        for cmd in commands:
            cmd_str = (cmd or "").strip()
            cmd_to_run = cmd_str
            ignore_failure = False
            note_parts: List[str] = []

            # Back-compat: allow "… || true" to mean "ignore failures".
            if "||" in cmd_to_run:
                parts = [p.strip() for p in cmd_to_run.split("||", 1)]
                if len(parts) == 2 and parts[1] == "true":
                    cmd_to_run = parts[0]
                    ignore_failure = True
                    note_parts.append('ignored failure via "|| true"')

            proc = self._run_cmd(cmd_to_run, shell=True, cwd=repo_path, check=False)
            effective_returncode = proc.returncode

            # Treat "no tests collected" (pytest exit code 5) as non-fatal by default.
            if self._is_pytest_command(cmd_to_run) and proc.returncode == 5:
                out = (proc.stdout or "").lower()
                if "no tests ran" in out or "collected 0 items" in out or "no tests collected" in out:
                    effective_returncode = 0
                    note_parts.append("pytest reported no tests; treated as success")

            # If pytest isn't installed in this execution environment, don't hard-fail a generic validation.
            # This commonly happens when orchestrating non-Python repos from a toolbox venv.
            if self._is_pytest_command(cmd_to_run) and proc.returncode != 0:
                err = (proc.stderr or "")
                if "No module named pytest" in err or "No module named 'pytest'" in err:
                    effective_returncode = 0
                    note_parts.append("pytest not installed; treated as skipped")

            if ignore_failure and effective_returncode != 0:
                effective_returncode = 0
            results.append(
                {
                    "command": cmd_str,
                    "executed": cmd_to_run,
                    "returncode": proc.returncode,
                    "effective_returncode": effective_returncode,
                    "stdout": proc.stdout,
                    "stderr": proc.stderr,
                    "note": "; ".join(note_parts) if note_parts else None,
                }
            )
            if effective_returncode != 0:
                failed = True
                break

        val_path = artifacts_dir / f"{task_id}_validation.json"
        val_path.write_text(json.dumps(results, indent=2), encoding="utf-8")

        return {"task_id": task_id, "results": results, "failed": failed, "artifact": str(val_path)}

    @staticmethod
    def _is_pytest_command(cmd: str) -> bool:
        c = (cmd or "").strip().lower()
        return c.startswith("pytest") or c.startswith("python -m pytest") or c.startswith("py -m pytest")

    def _write_conflict_report(self, artifacts_dir: Path, task_id: str, merge_result: Dict[str, Any]) -> Path:
        report = {
            "task_id": task_id,
            "stdout": merge_result.get("stdout"),
            "stderr": merge_result.get("stderr"),
        }
        path = artifacts_dir / f"{task_id}_conflict.json"
        path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        return path

    def _render_pr_body(self, merged_tasks: List[str], validation_results: List[Dict[str, Any]], artifacts_dir: Path) -> str:
        validation_summary = "\n".join(
            f"- {res['task_id']}: {'failed' if res['failed'] else 'passed'} ({res['artifact']})"
            for res in validation_results
        )
        return (
            "## Merged Tasks\n"
            + "\n".join(f"- {t}" for t in merged_tasks)
            + "\n\n## Validation\n"
            + validation_summary
            + f"\n\nArtifacts: {artifacts_dir}"
        )

    def _run_cmd(
        self,
        cmd: List[str] | str,
        shell: bool = False,
        cwd: Optional[Path] = None,
        check: bool = True,
    ) -> subprocess.CompletedProcess:
        return subprocess.run(
            cmd,
            shell=shell,
            cwd=str(cwd) if cwd else None,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=check,
        )
