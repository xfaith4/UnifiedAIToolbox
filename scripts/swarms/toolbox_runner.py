#!/usr/bin/env python3
"""
UnifiedAIToolbox Swarms Engine Runner

This is the canonical entrypoint for running Swarms from within UnifiedAIToolbox.

It is designed to be callable from:
- Next.js API routes (web UI)
- PowerShell orchestration (POF / codex swarm engine)
- CLI wrappers

It prints a single JSON object to stdout and exits 0 even on failure, so callers
always receive structured output.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple


def _toolbox_root() -> Path:
    # scripts/swarms/toolbox_runner.py -> repo root is two parents up
    return Path(__file__).resolve().parents[2]


def _default_agent_config_path() -> Path:
    return _toolbox_root() / "Orchestration" / "prompts" / "Agents.json"


def _safe_json(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False)


def _print_payload(payload: Dict[str, Any]) -> None:
    try:
        print(_safe_json(payload))
    except (BrokenPipeError, OSError):
        # When stdout is closed early by a consumer (e.g., piping to `head`), avoid crashing.
        pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Swarms as a UnifiedAIToolbox engine.")
    parser.add_argument("--goal", required=True, help="Goal/task for the swarm.")
    parser.add_argument("--agents", default="", help="Comma-separated list of agent names (e.g., Researcher,Engineer).")
    parser.add_argument("--model", default=None, help="LLM model name to use.")
    parser.add_argument(
        "--swarm-type",
        default=None,
        help="SwarmRouter type (e.g., SequentialWorkflow, ConcurrentWorkflow, MixtureOfAgents, GroupChat, auto).",
    )
    parser.add_argument("--max-loops", type=int, default=1, help="Max loops for SwarmRouter/workflow.")
    parser.add_argument("--repo-root", default=None, help="Optional repo root path (enables safe file tools).")
    parser.add_argument("--output-dir", default=None, help="Optional output dir for artifacts/workspace.")
    parser.add_argument("--agent-config", default=None, help="Path to Orchestration Agents.json (system prompts).")
    parser.add_argument("--rules", default=None, help="Optional rules injected into swarm router.")
    return parser.parse_args()


def _load_agent_prompts(config_path: Path) -> Dict[str, Dict[str, str]]:
    raw = json.loads(config_path.read_text(encoding="utf-8"))
    agents = raw.get("Agents", [])
    out: Dict[str, Dict[str, str]] = {}
    for item in agents:
        name = str(item.get("name", "")).strip()
        if not name:
            continue
        out[name] = {
            "prompt": str(item.get("prompt", "")).strip(),
            "role": str(item.get("role", "")).strip(),
        }
    return out


@dataclass(frozen=True)
class SafePaths:
    repo_root: Optional[Path]
    workspace: Path


def _build_tools(paths: SafePaths) -> List[Callable[..., Any]]:
    """
    Minimal, safe file IO tools for agents.

    - Reads are restricted to repo_root (if provided)
    - Writes go to a dedicated workspace directory under output_dir (or .uaitoolbox)
    """

    def _within_root(target: Path, root: Path) -> bool:
        try:
            target.resolve().relative_to(root.resolve())
            return True
        except Exception:
            return False

    def list_repo_files(glob: str = "**/*", max_files: int = 500) -> List[str]:
        """List files under repo root. Returns relative paths."""
        if not paths.repo_root:
            return []
        root = paths.repo_root
        results: List[str] = []
        for p in root.glob(glob):
            if p.is_file():
                try:
                    results.append(str(p.resolve().relative_to(root.resolve())))
                except Exception:
                    continue
            if len(results) >= max_files:
                break
        return results

    def read_repo_file(path: str, max_bytes: int = 200_000) -> str:
        """Read a text file within repo root (UTF-8)."""
        if not paths.repo_root:
            return _safe_json({"error": "repo_root not configured"})
        root = paths.repo_root
        target = (root / path).resolve()
        if not _within_root(target, root):
            return _safe_json({"error": "path escapes repo_root"})
        if not target.exists() or not target.is_file():
            return _safe_json({"error": f"file not found: {path}"})
        data = target.read_bytes()[:max_bytes]
        try:
            return data.decode("utf-8", errors="replace")
        except Exception:
            return data.decode(errors="replace")

    def write_workspace_file(path: str, content: str) -> str:
        """Write a file within the Swarms workspace (UTF-8). Returns written path."""
        root = paths.workspace
        target = (root / path).resolve()
        if not _within_root(target, root):
            return _safe_json({"error": "path escapes workspace"})
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        return str(target)

    return [list_repo_files, read_repo_file, write_workspace_file]


def _resolve_config(args: argparse.Namespace) -> Tuple[List[str], str, str, int, Optional[Path], Optional[Path], Path, Optional[str]]:
    agents = [a.strip() for a in str(args.agents or "").split(",") if a.strip()]
    model = (args.model or os.environ.get("SWARM_MODEL") or os.environ.get("OPENAI_MODEL") or "gpt-4o-mini").strip()
    swarm_type = (args.swarm_type or os.environ.get("SWARM_TYPE") or "SequentialWorkflow").strip()
    max_loops = int(args.max_loops or 1)
    repo_root = Path(args.repo_root).resolve() if args.repo_root else None
    output_dir = Path(args.output_dir).resolve() if args.output_dir else None
    agent_config = Path(args.agent_config).resolve() if args.agent_config else _default_agent_config_path()
    rules = args.rules or os.environ.get("SWARM_RULES")
    return agents, model, swarm_type, max_loops, repo_root, output_dir, agent_config, rules


def main() -> int:
    args = parse_args()
    started_at = time.time()
    run_id = uuid.uuid4().hex

    payload: Dict[str, Any] = {
        "ok": False,
        "status": "started",
        "runId": run_id,
        "goal": args.goal,
        "startedAt": started_at,
    }

    try:
        selected_agents, model, swarm_type, max_loops, repo_root, output_dir, agent_config, rules = _resolve_config(args)
        payload.update(
            {
                "agents": selected_agents,
                "model": model,
                "swarmType": swarm_type,
                "maxLoops": max_loops,
                "repoRoot": str(repo_root) if repo_root else None,
                "outputDir": str(output_dir) if output_dir else None,
                "agentConfig": str(agent_config),
            }
        )

        if not os.environ.get("OPENAI_API_KEY") and not os.environ.get("SWARMS_API_KEY"):
            raise RuntimeError("OPENAI_API_KEY (or SWARMS_API_KEY) is not set; cannot run Swarms engine.")

        if not agent_config.exists():
            raise FileNotFoundError(f"Agent config not found: {agent_config}")

        prompts = _load_agent_prompts(agent_config)

        # Lazy import: keeps failure mode clean when deps aren't installed.
        # Import from submodules directly to avoid heavy `swarms.__init__` star-import side effects.
        from swarms.structs.agent import Agent  # type: ignore
        from swarms.structs.swarm_router import SwarmRouter  # type: ignore

        if not selected_agents:
            selected_agents = ["Researcher", "Engineer", "Critic", "Synthesizer", "Commissioner"]

        workspace = (
            (output_dir / "swarms-workspace") if output_dir else (_toolbox_root() / ".uaitoolbox" / "swarms" / "workspace")
        )
        workspace.mkdir(parents=True, exist_ok=True)

        # Swarms uses loguru extensively; avoid noisy stdout and Windows console sink issues
        # by redirecting logs to a file in the workspace.
        try:
            from loguru import logger  # type: ignore

            logger.remove()
            logger.add(str(workspace / "swarms.log"), level=os.environ.get("SWARMS_LOG_LEVEL", "INFO"))
        except Exception:
            pass

        tools = _build_tools(SafePaths(repo_root=repo_root, workspace=workspace))

        agents: List[Any] = []
        for name in selected_agents:
            prompt = prompts.get(name, {}).get("prompt") or f"You are {name}. Help achieve the goal."
            agents.append(
                Agent(
                    agent_name=name,
                    agent_description=f"UnifiedAIToolbox Swarms agent: {name}",
                    system_prompt=prompt,
                    model_name=model,
                    max_loops=1,
                    dynamic_temperature_enabled=True,
                    output_type="dict",
                    tools=tools,
                    workspace_dir=str(workspace),
                )
            )

        if len(agents) == 1:
            # SwarmRouter/SequentialWorkflow can require an explicit multi-agent flow; single-agent runs
            # are handled directly for reliability.
            result = agents[0].run(task=args.goal)
        else:
            router = SwarmRouter(
                name="UnifiedAIToolbox-SwarmsEngine",
                description="UnifiedAIToolbox Swarms engine runner",
                agents=agents,
                swarm_type=swarm_type,  # type: ignore[arg-type]
                max_loops=max_loops,
                rules=rules,
                output_type="dict-all-except-first",
                return_entire_history=True,
                multi_agent_collab_prompt=True,
                telemetry_enabled=False,
            )

            result = router.run(task=args.goal)
        payload.update(
            {
                "ok": True,
                "status": "completed",
                "result": result,
            }
        )
    except Exception as exc:
        payload.update(
            {
                "ok": False,
                "status": "failed",
                "error": f"{type(exc).__name__}: {exc}",
                "traceback": traceback.format_exc(),
            }
        )
    finally:
        payload["completedAt"] = time.time()
        payload["durationSec"] = round(payload["completedAt"] - started_at, 3)
        _print_payload(payload)

    # Always exit 0 so callers can consume the JSON payload even on failure.
    return 0


if __name__ == "__main__":
    sys.exit(main())
