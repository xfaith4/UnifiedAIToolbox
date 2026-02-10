from __future__ import annotations

import json
import subprocess
from pathlib import Path

from github_integration.codex_service import CodexRunStatus
from github_integration.task_executor import TaskExecutor


class SummaryCodexService:
    """Codex service stub that writes orchestration-summary artifacts."""

    def __init__(self, output_root: Path):
        self.output_root = output_root
        self.runs: dict[str, dict[str, object]] = {}

    async def start_codex_run(
        self,
        repo_path: Path,
        model: str = "gpt-4",
        max_parallel: int = 3,
        run_id: str | None = None,
        goal: str | None = None,
    ) -> str:
        run_id = run_id or "run"
        run_dir = self.output_root / run_id
        swarm_output_dir = run_dir / "swarm-output"
        swarm_output_dir.mkdir(parents=True, exist_ok=True)

        summary = {
            "AgentCount": 5,
            "AgentsUsed": ["Researcher", "Engineer", "Critic", "Synthesizer", "ValidationAuditor"],
            "ValidationAuditorIncluded": True,
            "Refinement": {"detected": True, "signal_count": 1, "signals": ["refinement"]},
            "Status": "completed",
        }
        (swarm_output_dir / "orchestration-summary.json").write_text(
            json.dumps(summary, indent=2), encoding="utf-8"
        )

        self.runs[run_id] = {
            "repo_path": str(repo_path),
            "status": CodexRunStatus.PENDING,
            "swarm_output_dir": str(swarm_output_dir),
        }
        return run_id

    async def execute_codex_run(self, run_id: str):
        repo_path = Path(str(self.runs[run_id]["repo_path"]))
        (repo_path / "README.md").write_text("hello\nsummary telemetry test\n", encoding="utf-8")
        self.runs[run_id]["status"] = CodexRunStatus.COMPLETED
        yield {"run_id": run_id, "status": CodexRunStatus.RUNNING, "log_line": "Selected 5 agents"}
        yield {"run_id": run_id, "status": CodexRunStatus.COMPLETED}

    def get_run_status(self, run_id: str):
        return {
            "run_id": run_id,
            "status": self.runs.get(run_id, {}).get("status"),
            "swarm_output_dir": self.runs.get(run_id, {}).get("swarm_output_dir"),
        }

    def get_findings(self, run_id: str):
        return []


def _init_repo(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    (path / "README.md").write_text("hello\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(path), "init"], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    subprocess.run(["git", "-C", str(path), "config", "user.email", "test@example.com"], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    subprocess.run(["git", "-C", str(path), "config", "user.name", "Test Runner"], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    subprocess.run(["git", "-C", str(path), "add", "."], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    subprocess.run(["git", "-C", str(path), "commit", "-m", "init"], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def _write_taskgraph(path: Path) -> None:
    payload = {
        "tasks": [
            {
                "id": "task1",
                "title": "Telemetry summary task",
                "rationale": "validate codex summary propagation",
                "file_scope": ["."],
                "conflict_group": "impl",
                "dependencies": [],
                "validation": ["echo ok"],
            }
        ]
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def test_task_executor_emits_codex_summary_event(tmp_path: Path):
    repo_path = tmp_path / "repo"
    _init_repo(repo_path)

    runs_dir = tmp_path / "runs"
    run_id = "run-telemetry"
    taskgraph_path = runs_dir / run_id / "taskgraph.json"
    _write_taskgraph(taskgraph_path)

    codex_output = runs_dir / run_id / "codex_runs"
    service = SummaryCodexService(codex_output)
    executor = TaskExecutor(runs_dir=runs_dir, codex_service=service)

    progress_events: list[dict[str, object]] = []
    result = executor.execute_taskgraph(
        repo_path=repo_path,
        run_id=run_id,
        taskgraph_path=taskgraph_path,
        progress_callback=lambda event: progress_events.append(event),
    )

    task_result = result["tasks"][0]
    assert task_result["status"] == "completed"
    assert task_result["orchestration_summary"]["AgentCount"] == 5
    assert task_result["orchestration_summary"]["ValidationAuditorIncluded"] is True

    summary_events = [e for e in progress_events if e.get("event") == "codex_summary"]
    assert len(summary_events) == 1
    event = summary_events[0]
    assert event.get("agent_count") == 5
    assert event.get("validation_auditor_included") is True
    assert event.get("refinement_detected") is True
