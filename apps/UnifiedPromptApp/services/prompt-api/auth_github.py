"""GitHub auth helper for bootstrapping GITHUB_TOKEN via gh."""

from __future__ import annotations

import logging
import os
import subprocess
from typing import Optional

LOGGER = logging.getLogger("prompt-api.github-auth")


def _run_gh_token() -> Optional[str]:
    try:
        result = subprocess.run(
            ["gh", "auth", "token"],
            check=False,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("GitHub CLI (gh) not found. Install it and run: gh auth login") from exc

    token = (result.stdout or "").strip()
    if result.returncode != 0 or not token:
        raise RuntimeError("GitHub CLI is not authenticated. Run: gh auth login")
    return token


def ensure_github_token() -> None:
    """
    Ensure GITHUB_TOKEN is set for this process.

    Honors PROMPT_API_DISABLE_GH_TOKEN_BOOTSTRAP=1 to skip gh lookup.
    """
    if os.environ.get("PROMPT_API_DISABLE_GH_TOKEN_BOOTSTRAP") == "1":
        return

    if os.environ.get("GITHUB_TOKEN"):
        LOGGER.info("GitHub token already present in environment.")
        return

    token = _run_gh_token()
    os.environ["GITHUB_TOKEN"] = token
    LOGGER.info("GitHub token bootstrapped from gh auth.")
