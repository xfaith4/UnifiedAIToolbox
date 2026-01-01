#!/usr/bin/env python3
"""
Lightweight swarm runner used by the Unified AI Toolbox dashboard.

This script wraps the local `swarms` package so the web UI can trigger a
single-agent swarm run without requiring bespoke glue code. It is intentionally
minimal: it accepts a goal, optional agent names, and an optional model, then
prints a JSON payload describing the attempt. Failures are captured and
returned in the payload instead of raising, so callers always get structured
output.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import traceback
from typing import List

from pathlib import Path

DEFAULT_MODEL = "gpt-4o-mini"
REQUIREMENTS_PATH = Path(__file__).resolve().with_name("requirements.txt")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a swarm task for the dashboard.")
    parser.add_argument("--goal", required=True, help="Goal or task description for the swarm.")
    parser.add_argument(
        "--agents",
        default="",
        help="Comma-separated list of agent names to include in the swarm.",
    )
    parser.add_argument("--model", default=None, help="LLM model name to use.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    started_at = time.time()
    agents: List[str] = [a.strip() for a in args.agents.split(",") if a.strip()]

    payload = {
        "goal": args.goal,
        "agents": agents,
        "model": args.model,
        "startedAt": started_at,
        "status": "started",
    }

    try:
        from swarms import Agent  # type: ignore

        model_name = args.model or os.environ.get("SWARM_MODEL") or DEFAULT_MODEL
        agent = Agent(
            agent_name="UnifiedAIToolbox-Swarm",
            agent_description="Dashboard-triggered swarm run",
            model_name=model_name,
            max_loops=1,
            dynamic_temperature_enabled=True,
            output_type="json",
        )

        result = agent.run(task=args.goal, n=1)
        payload.update(
            {
                "status": "completed",
                "result": result,
            }
        )
    except ImportError as exc:
        payload.update(
            {
                "status": "failed",
                "error": f"{type(exc).__name__}: {exc}. Install swarm dependencies via pip install -r {str(REQUIREMENTS_PATH)}",
                "traceback": traceback.format_exc(),
            }
        )
    except Exception as exc:  # pragma: no cover - best effort runner
        payload.update(
            {
                "status": "failed",
                "error": f"{type(exc).__name__}: {exc}",
                "traceback": traceback.format_exc(),
            }
        )

    payload["completedAt"] = time.time()
    payload["durationSec"] = round(payload["completedAt"] - started_at, 3)
    print(json.dumps(payload, ensure_ascii=False))
    # Always exit 0 so callers can consume the JSON payload even on failure.
    return 0


if __name__ == "__main__":
    sys.exit(main())
