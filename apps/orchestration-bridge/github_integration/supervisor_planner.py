"""Supervisor planner that turns an IntakeReport into a TaskGraph artifact."""

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional


class SupervisorPlannerError(Exception):
    """Raised when planning fails."""


@dataclass
class TaskGraphArtifacts:
    """Paths to generated task graph artifacts."""

    json_path: Path


class SupervisorPlanner:
    """Deterministic planner producing chunky tasks from intake + goal + constraints."""

    def __init__(self, runs_dir: Optional[Path] = None):
        base_dir = runs_dir or Path(__file__).parent.parent / "runs"
        self.runs_dir = Path(base_dir)
        self.runs_dir.mkdir(parents=True, exist_ok=True)

    def generate_taskgraph(
        self,
        run_id: str,
        intake: Dict[str, Any],
        user_goal: str,
        constraints: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Build a task graph and persist it under runs/<run_id>/taskgraph.json.
        """
        if not run_id:
            raise SupervisorPlannerError("run_id is required")
        if not intake:
            raise SupervisorPlannerError("intake report is required")
        if not user_goal:
            raise SupervisorPlannerError("user_goal is required")

        run_dir = self.runs_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)

        allowed_paths = self._normalize_paths(constraints.get("allowed_paths") or [])
        max_parallel = constraints.get("max_parallel") or 1
        risk_posture = (constraints.get("risk_posture") or "standard").lower()
        model = (constraints.get("model") or "").strip() or None

        build_signals = intake.get("build_signals") or []
        validation_commands = self._build_validation_commands(build_signals)

        tasks = self._build_tasks(
            run_id=run_id,
            allowed_paths=allowed_paths,
            user_goal=user_goal,
            validation_commands=validation_commands,
            risk_posture=risk_posture,
            max_parallel=max_parallel,
            model=model,
        )

        taskgraph = {
            "run_id": run_id,
            "user_goal": user_goal,
            "constraints": {
                "allowed_paths": allowed_paths,
                "max_parallel": max_parallel,
                "risk_posture": risk_posture,
                "model": model,
            },
            "tasks": tasks,
        }

        artifacts = self._write_artifacts(run_dir, taskgraph)
        taskgraph["artifacts"] = {"taskgraph_json": str(artifacts.json_path)}
        return taskgraph

    def _write_artifacts(self, run_dir: Path, taskgraph: Dict[str, Any]) -> TaskGraphArtifacts:
        json_path = run_dir / "taskgraph.json"
        json_path.write_text(json.dumps(taskgraph, indent=2), encoding="utf-8")
        return TaskGraphArtifacts(json_path=json_path)

    def _normalize_paths(self, paths: List[str]) -> List[str]:
        """Ensure paths are sorted and normalized."""
        normalized = sorted({p.strip() for p in paths if p and p.strip()})
        return normalized

    def _build_validation_commands(self, build_signals: List[Dict[str, Any]]) -> List[str]:
        """Convert build signals into deterministic validation commands."""
        commands: List[str] = []
        for signal in build_signals:
            cmds = signal.get("commands") or []
            for cmd in cmds:
                commands.append(cmd)

        # Filter out long-running dev/start commands (they are not validations).
        def _is_validation_command(cmd: str) -> bool:
            normalized = (cmd or "").strip().lower()
            if not normalized:
                return False
            # Node ecosystem
            if re.search(r"\b(npm|pnpm|yarn)\b.*\brun\b\s+(dev|start)\b", normalized):
                return False
            if re.search(r"\b(npm|pnpm|yarn)\b\s+start\b", normalized):
                return False
            if re.search(r"\bnext\s+dev\b", normalized):
                return False
            # Dotnet watch / other watchers
            if re.search(r"\bdotnet\b.*\bwatch\b", normalized):
                return False
            return True

        commands = [c for c in commands if _is_validation_command(c)]

        # Deduplicate while preserving order
        seen = set()
        unique_cmds: List[str] = []
        for cmd in commands:
            if cmd not in seen:
                seen.add(cmd)
                unique_cmds.append(cmd)
        return unique_cmds

    def _build_tasks(
        self,
        run_id: str,
        allowed_paths: List[str],
        user_goal: str,
        validation_commands: List[str],
        risk_posture: str,
        max_parallel: int,
        model: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Create a focused execution task that delegates parallelism to Codex swarms."""
        path_scope = allowed_paths or ["."]
        validation_steps = validation_commands or ["git status --short", "python -m pytest"]
        run_suffix = self._run_suffix(run_id)

        try:
            parallel_value = int(max_parallel)
        except Exception:
            parallel_value = 1
        parallel_value = max(1, parallel_value)

        task: Dict[str, Any] = {
            "id": "t1_execute",
            "branch": self._task_branch(run_suffix, "t1_execute"),
            "title": "Implement and validate repository changes",
            "rationale": f"Deliver the requested outcome with focused edits: {user_goal}",
            "file_scope": path_scope,
            "conflict_group": "implementation",
            "dependencies": [],
            "validation": validation_steps,
            "rollback": "Revert commits or changes within the scoped paths if validation fails.",
            "max_parallel": parallel_value,
            "risk_posture": risk_posture,
        }
        if model:
            task["model"] = model

        return [task]

    def _run_suffix(self, run_id: str) -> str:
        """Create a short, stable suffix for branch names."""
        if not run_id:
            return "run"

        parts = run_id.rsplit("-", 1)
        candidate = parts[-1] if parts else run_id
        candidate = self._sanitize_branch_component(candidate)
        return candidate[:12] or "run"

    def _task_branch(self, run_suffix: str, task_id: str) -> str:
        component_task = self._sanitize_branch_component(task_id)
        component_suffix = self._sanitize_branch_component(run_suffix)
        branch = f"orchestrator/{component_suffix}/{component_task}"
        return branch[:120]

    def _sanitize_branch_component(self, value: str) -> str:
        """Keep only characters that are safe in git ref names."""
        if not value:
            return ""
        value = value.strip().lower()
        value = re.sub(r"[^a-z0-9._/-]+", "-", value)
        value = re.sub(r"-+", "-", value)
        value = value.strip("-./")
        return value
