#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

API_PORT="${API_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
WEB_PORT="${WEB_PORT:-3000}"

DOCKER_MODE="false"
FRONTEND_ONLY="false"
SKIP_FRONTEND="false"
SKIP_WEB="false"
SKIP_VERIFY="false"
NO_INSTALL="false"
NO_OPEN="false"

usage() {
  cat <<'EOF'
Usage: ./launch.sh [options]

Starts the Unified AI Toolbox stack for Linux/Mac/WSL:
  - Prompt API (FastAPI)
  - Dashboard (React/Vite)
  - Web Portal (Next.js)
Then runs scripts/verify-launch.py unless --skip-verify is set.

Options:
  --docker                 Launch via docker compose (no local processes)
  --api-port <port>        Prompt API port (default: 8000)
  --frontend-port <port>   Dashboard port (default: 5173)
  --web-port <port>        Web Portal port (default: 3000)
  --frontend-only          Start only the web portal (Next.js)
  --backend-only           Start only Prompt API
  --skip-frontend          Do not start the dashboard (alias: --skip-dashboard)
  --skip-web               Do not start the web portal
  --skip-install           Do not run npm install automatically (alias: --no-install)
  --skip-verify            Skip post-launch verification
  --no-open                Do not attempt to open the browser automatically
  -h, --help               Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --docker) DOCKER_MODE="true"; shift ;;
    --api-port) API_PORT="${2:?missing port}"; shift 2 ;;
    --frontend-port) FRONTEND_PORT="${2:?missing port}"; shift 2 ;;
    --web-port) WEB_PORT="${2:?missing port}"; shift 2 ;;
    --frontend-only) FRONTEND_ONLY="true"; shift ;;
    --backend-only) SKIP_FRONTEND="true"; SKIP_WEB="true"; shift ;;
    --skip-frontend|--skip-dashboard) SKIP_FRONTEND="true"; shift ;;
    --skip-web) SKIP_WEB="true"; shift ;;
    --skip-verify) SKIP_VERIFY="true"; shift ;;
    --skip-install|--no-install) NO_INSTALL="true"; shift ;;
    --no-open) NO_OPEN="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

pids=()
open_url() {
  local url="$1"
  if [[ "$NO_OPEN" == "true" ]]; then
    return 0
  fi

  if command -v xdg-open >/dev/null 2>&1; then
    (xdg-open "$url" >/dev/null 2>&1 || true) &
    return 0
  fi

  if command -v open >/dev/null 2>&1; then
    (open "$url" >/dev/null 2>&1 || true) &
    return 0
  fi

  if command -v cmd.exe >/dev/null 2>&1; then
    (cmd.exe /c start "" "$url" >/dev/null 2>&1 || true) &
    return 0
  fi

  return 0
}

cleanup() {
  if [[ ${#pids[@]} -gt 0 ]]; then
    echo ""
    echo "Stopping services..."
    for pid in "${pids[@]}"; do
      kill "$pid" >/dev/null 2>&1 || true
    done
  fi
}
trap cleanup EXIT INT TERM

echo "Repo root: $repo_root"
echo "API_PORT=$API_PORT FRONTEND_PORT=$FRONTEND_PORT WEB_PORT=$WEB_PORT"

if [[ "$DOCKER_MODE" == "true" ]]; then
  echo ""
  echo "Launching via docker compose..."
  API_PORT="$API_PORT" FRONTEND_PORT="$FRONTEND_PORT" WEB_PORT="$WEB_PORT" docker compose up -d
  echo "Docker services started."

  if [[ "$SKIP_VERIFY" != "true" ]]; then
    echo ""
    echo "Running post-launch verification..."
    python3 "$repo_root/scripts/verify-launch.py" \
      --api-port "$API_PORT" \
      --frontend-port "$FRONTEND_PORT" \
      --web-port "$WEB_PORT" || true
  fi

  echo ""
  echo "Open:"
  echo "  Prompt API:   http://localhost:$API_PORT"
  echo "  Dashboard:    http://localhost:$FRONTEND_PORT"
  echo "  Web Portal:   http://localhost:$WEB_PORT"
  open_url "http://localhost:$WEB_PORT" || true
  exit 0
fi

if [[ "$FRONTEND_ONLY" == "true" ]]; then
  echo ""
  echo "Starting Web Portal (Next.js) only..."
  (
    cd "$repo_root/apps/unifiedtoolbox.webapp"
    if [[ "$NO_INSTALL" != "true" && ! -d node_modules ]]; then
      npm install --no-audit --no-fund
    fi
    NEXT_PUBLIC_API_BASE="${NEXT_PUBLIC_API_BASE:-http://localhost:$API_PORT}" PORT="$WEB_PORT" \
      exec npm run dev -- --hostname 0.0.0.0 --port "$WEB_PORT"
  ) &
  pids+=("$!")

  sleep 2
  echo ""
  echo "Web Portal: http://localhost:$WEB_PORT"
  open_url "http://localhost:$WEB_PORT" || true
  echo "Press Ctrl+C to stop."
  wait
fi

echo ""
echo "Starting Prompt API..."
(
  cd "$repo_root"
  ORCHESTRATOR_PS1="$repo_root/Orchestration/MilestoneController.ps1" \
  POF_PS1="$repo_root/Orchestration/MilestoneController.ps1" \
  PROMPT_API_PORT="$API_PORT" \
    exec "$repo_root/scripts/start-prompt-api.sh"
) &
pids+=("$!")

if [[ "$SKIP_FRONTEND" != "true" ]]; then
  echo ""
  echo "Starting Dashboard (React/Vite)..."
  (
    cd "$repo_root/apps/dashboard"
    if [[ "$NO_INSTALL" != "true" && ! -d node_modules ]]; then
      npm install --no-audit --no-fund
    fi
    VITE_API_BASE="http://localhost:$API_PORT" VITE_API_URL="http://localhost:$API_PORT" \
      exec npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT"
  ) &
  pids+=("$!")
fi

if [[ "$SKIP_WEB" != "true" ]]; then
  echo ""
  echo "Starting Web Portal (Next.js)..."
  (
    cd "$repo_root/apps/unifiedtoolbox.webapp"
    if [[ "$NO_INSTALL" != "true" && ! -d node_modules ]]; then
      npm install --no-audit --no-fund
    fi
    NEXT_PUBLIC_API_BASE="http://localhost:$API_PORT" PORT="$WEB_PORT" \
      exec npm run dev -- --hostname 0.0.0.0 --port "$WEB_PORT"
  ) &
  pids+=("$!")
fi

sleep 3

if [[ "$SKIP_VERIFY" != "true" ]]; then
  echo ""
  echo "Running post-launch verification..."
  python3 "$repo_root/scripts/verify-launch.py" \
    --api-port "$API_PORT" \
    --frontend-port "$FRONTEND_PORT" \
    --web-port "$WEB_PORT" \
    $( [[ "$SKIP_FRONTEND" == "true" ]] && echo "--skip-frontend" ) \
    $( [[ "$SKIP_WEB" == "true" ]] && echo "--skip-web" ) || true
fi

echo ""
echo "Services running:"
echo "  Prompt API:   http://localhost:$API_PORT"
if [[ "$SKIP_FRONTEND" != "true" ]]; then
  echo "  Dashboard:    http://localhost:$FRONTEND_PORT"
fi
if [[ "$SKIP_WEB" != "true" ]]; then
  echo "  Web Portal:   http://localhost:$WEB_PORT"
fi
echo ""
if [[ "$SKIP_WEB" != "true" ]]; then
  open_url "http://localhost:$WEB_PORT" || true
elif [[ "$SKIP_FRONTEND" != "true" ]]; then
  open_url "http://localhost:$FRONTEND_PORT" || true
fi
echo "Press Ctrl+C to stop."

wait
