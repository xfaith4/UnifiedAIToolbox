#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
api_dir="$repo_root/apps/UnifiedPromptApp/services/prompt-api"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) not found. Install it and run: gh auth login" >&2
  exit 1
fi

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  GITHUB_TOKEN="$(gh auth token)" || {
    echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
    exit 1
  }
  export GITHUB_TOKEN
fi

python_bin="$api_dir/.venv-linux/bin/python"
if [[ ! -x "$python_bin" ]]; then
  python_bin="python3"
fi

port="${PROMPT_API_PORT:-8000}"

cd "$api_dir"
exec "$python_bin" -m uvicorn app:app --reload --host 0.0.0.0 --port "$port"
