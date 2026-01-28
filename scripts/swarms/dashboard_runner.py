#!/usr/bin/env python3
"""
Backward-compatible swarm runner used by the Unified AI Toolbox dashboard.

This file remains as a stable entrypoint for the existing Next.js API route,
but delegates the actual work to `toolbox_runner.py` so the Swarms engine is a
full multi-agent capability (SwarmRouter + multiple swarm types).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run a swarm task for the dashboard.")
    parser.add_argument("--goal", required=True, help="Goal or task description for the swarm.")
    parser.add_argument("--agents", default="", help="Comma-separated list of agent names to include in the swarm.")
    parser.add_argument("--model", default=None, help="LLM model name to use.")
    parser.add_argument(
        "--swarm-type",
        default=None,
        help="Optional SwarmRouter type (SequentialWorkflow, ConcurrentWorkflow, MixtureOfAgents, GroupChat, auto, etc.).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    runner = Path(__file__).resolve().with_name("toolbox_runner.py")

    # Ensure toolbox runner exists even if someone runs an older checkout.
    if not runner.exists():
        print(
            json.dumps(
                {
                    "ok": False,
                    "status": "failed",
                    "error": f"toolbox_runner.py missing at {str(runner)}",
                },
                ensure_ascii=False,
            )
        )
        return 0

    argv = ["--goal", args.goal]
    if args.agents:
        argv += ["--agents", args.agents]
    if args.model:
        argv += ["--model", args.model]
    if args.swarm_type:
        argv += ["--swarm-type", args.swarm_type]

    # Execute toolbox_runner in-process for simpler env handling.
    # It prints a single JSON payload and always exits 0.
    from runpy import run_path

    sys.argv = [str(runner), *argv]
    run_path(str(runner), run_name="__main__")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
