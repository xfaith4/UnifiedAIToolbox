### BEGIN FILE: launch.sh
#!/bin/bash
# Universal Launch Script for Unified AI Toolbox
# Works on Linux, macOS, and WSL

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

REQUIRED_NODE="18.0.0"
REQUIRED_PYTHON="3.12.1"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default ports (align with existing services)
API_PORT="${API_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
WEB_PORT="${WEB_PORT:-3000}"

# Flags
SKIP_CHECKS=false
BACKEND_ONLY=false
FRONTEND_ONLY=false
OPEN_BROWSER=true

print_help() {
    cat <<EOF
Unified AI Toolbox - Universal Launch Script

Usage: ./launch.sh [options]

Options:
  --skip-checks     Skip Node/Python version checks
  --backend-only    Start only backend services (API + orchestrator)
  --frontend-only   Start only frontend UI (requires backend already running)
  --no-browser      Do not auto-open the browser after startup
  -h, --help        Show this help message

Environment:
  API_PORT          Port for the orchestrator API (default: 8000)
  FRONTEND_PORT     Port for the frontend UI (default: 5173)
  WEB_PORT          Port for the static web assets (default: 3000)

AI diagnostics (optional, for orchestration verification):
  AI_LAUNCH_DIAGNOSTICS=1          Enable OpenAI-based diagnostics on failure
  AI_LAUNCH_MAX_RETRIES=<N>        Max orchestration attempts (default: 1 -> no auto-retry)
  AI_LAUNCH_RETRY_DELAY=<seconds>  Delay between retries (default: 20)
  AI_LAUNCH_MIN_INTERVAL_SEC=<s>   Min seconds between AI calls (default: 300)
  AI_LAUNCH_MODEL=<model-name>     Override default model (default: gpt-4.1-mini)
  OPENAI_API_KEY                   API key for OpenAI (required if diagnostics enabled)

EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --skip-checks)
            SKIP_CHECKS=true
            shift
            ;;
        --backend-only)
            BACKEND_ONLY=true
            shift
            ;;
        --frontend-only)
            FRONTEND_ONLY=true
            shift
            ;;
        --no-browser)
            OPEN_BROWSER=false
            shift
            ;;
        -h|--help)
            print_help
            exit 0
            ;;
        *)
            echo -e "${YELLOW}Unknown option: $1${NC}"
            print_help
            exit 1
            ;;
    esac
done

if [ "$BACKEND_ONLY" = true ] && [ "$FRONTEND_ONLY" = true ]; then
    echo -e "${RED}Cannot use --backend-only and --frontend-only at the same time.${NC}"
    exit 1
fi

check_binary() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo -e "${RED}Error: $1 is not installed or not in PATH.${NC}"
        return 1
    fi
    echo -e "${GREEN}✓ $1 found${NC}"
    return 0
}

check_version() {
    local bin="$1"
    local required="$2"
    local found
    found="$($bin --version 2>/dev/null | grep -Eo '[0-9]+(\.[0-9]+){1,}')"
    if [ -z "$found" ]; then
        echo -e "${RED}Error: could not determine $bin version${NC}"
        return 1
    fi
    if [ "$(printf '%s\n%s\n' "$required" "$found" | sort -V | head -n1)" != "$required" ]; then
        echo -e "${RED}$bin $required+ required, but found $found${NC}"
        return 1
    fi
    echo -e "${GREEN}✓ $bin version $found (meets requirement $required)${NC}"
}

if [ "$SKIP_CHECKS" = false ]; then
    echo -e "${CYAN}Checking runtime prerequisites...${NC}"
    check_binary node
    check_binary python3
    check_version node "$REQUIRED_NODE"
    check_version python3 "$REQUIRED_PYTHON"
fi

# Start prompt API (FastAPI + orchestrator)
if [ "$FRONTEND_ONLY" != true ]; then
    echo -e "${CYAN}Starting Prompt API (FastAPI)...${NC}"
    (
        cd "${SCRIPT_DIR}/apps/UnifiedPromptApp/services/prompt-api" || exit 1
        if [ ! -d ".venv" ]; then
            python3 -m venv .venv || python -m venv .venv
        fi
        if [ -x ".venv/Scripts/python.exe" ]; then
            PY_BIN=".venv/Scripts/python.exe"
        else
            PY_BIN=".venv/bin/python"
        fi
        "$PY_BIN" -m pip install --upgrade pip >/dev/null 2>&1 || true
        "$PY_BIN" -m pip install -r requirements.txt >/dev/null 2>&1 || echo -e "${YELLOW}pip install reported issues; continuing...${NC}"
        # Export orchestrator paths for Windows PowerShell execution
        ORCH_PS1_WIN="$(python3 - <<'PY'
import pathlib, os
root = pathlib.Path(__file__).resolve().parents[4]
path = (root / "Orchestration" / "MilestoneController.ps1").resolve()
print(str(path))
PY
)"
        export ORCHESTRATOR_PS1="MilestoneController.ps1"
        export POF_PS1="$ORCHESTRATOR_PS1"
        export PROMPT_API_PORT=$API_PORT
        "$PY_BIN" -m uvicorn app:app --host 0.0.0.0 --port "$API_PORT"
    ) &
    API_PID=$!
    echo -e "${GREEN}Prompt API starting with PID ${API_PID}${NC}"
fi

# Start Vite dashboard
if [ "$BACKEND_ONLY" != true ]; then
    echo -e "${CYAN}Starting dashboard (Vite)...${NC}"
    (
        cd "${SCRIPT_DIR}/apps/dashboard" || exit 1
        if [ ! -d "node_modules" ]; then
            npm install >/dev/null 2>&1 || echo -e "${YELLOW}npm install (dashboard) reported issues; continuing...${NC}"
        fi
        VITE_PORT="$FRONTEND_PORT" VITE_API_URL="http://localhost:${API_PORT}" VITE_API_BASE="http://localhost:${API_PORT}" \
            npm run dev -- --host 0.0.0.0 --port "$FRONTEND_PORT"
    ) &
    DASHBOARD_PID=$!
    echo -e "${GREEN}Dashboard starting with PID ${DASHBOARD_PID}${NC}"
fi

# Start Next.js portal
if [ "$BACKEND_ONLY" != true ]; then
    echo -e "${CYAN}Starting web portal (Next.js)...${NC}"
    (
        cd "${SCRIPT_DIR}/apps/unifiedtoolbox.webapp" || exit 1
        if [ ! -d "node_modules" ]; then
            npm install >/dev/null 2>&1 || echo -e "${YELLOW}npm install (portal) reported issues; continuing...${NC}"
        fi
        NEXT_PUBLIC_API_BASE="http://localhost:${API_PORT}" PORT="$WEB_PORT" \
            npm run dev -- --hostname 0.0.0.0 --port "$WEB_PORT"
    ) &
    PORTAL_PID=$!
    echo -e "${GREEN}Web portal starting with PID ${PORTAL_PID}${NC}"
fi

# Give services a moment to come up
sleep 5

echo -e "${CYAN}Running post-launch verification with optional AI diagnostics...${NC}"

# --- AI diagnostics helper (optional) ----------------------------------------
ai_maybe_diagnose_run() {
    # Controlled via:
    #   AI_LAUNCH_DIAGNOSTICS=1        -> enable OpenAI call
    #   AI_LAUNCH_MIN_INTERVAL_SEC=300 -> cooldown window between AI calls
    #   AI_LAUNCH_MODEL=gpt-4.1-mini   -> override default model
    if [ "${AI_LAUNCH_DIAGNOSTICS:-0}" != "1" ]; then
        return 0
    fi

    if [ -z "${OPENAI_API_KEY:-}" ]; then
        echo -e "${YELLOW}AI diagnostics skipped: OPENAI_API_KEY is not set.${NC}"
        return 0
    fi

    if [ -z "${AI_LOG_SNIPPET:-}" ]; then
        echo -e "${YELLOW}AI diagnostics skipped: no log snippet was captured.${NC}"
        return 0
    fi

    local now last min_interval
    now=$(date +%s 2>/dev/null || echo 0)
    if [ -f "${AI_LAUNCH_STATE_FILE}" ]; then
        last=$(cat "${AI_LAUNCH_STATE_FILE}" 2>/dev/null || echo 0)
    else
        last=0
    fi
    min_interval="${AI_LAUNCH_MIN_INTERVAL_SEC:-300}"

    if [ "$now" -gt 0 ] && [ "$last" -gt 0 ] && [ $(( now - last )) -lt "$min_interval" ]; then
        echo -e "${YELLOW}AI diagnostics skipped: cooldown window (${min_interval}s) has not elapsed since last call.${NC}"
        return 0
    fi

    echo "$now" > "${AI_LAUNCH_STATE_FILE}" 2>/dev/null || true

    echo -e "${CYAN}Calling OpenAI for orchestration failure analysis...${NC}"

    local ai_output
    ai_output="$(python3 <<'PY'
import os, sys, json, urllib.request, urllib.error

api_key = os.environ.get("OPENAI_API_KEY")
log_snippet = os.environ.get("AI_LOG_SNIPPET", "")
run_status = os.environ.get("AI_RUN_STATUS", "")

if not api_key or not log_snippet.strip():
    sys.exit(0)

model = os.environ.get("AI_LAUNCH_MODEL", "gpt-4.1-mini")

prompt = f"""You are helping debug a local AI orchestration tool's launch.

Run status: {run_status}

Here is a snippet of the orchestration log:

{log_snippet}

1. Summarize the most likely root cause in 2-3 bullet points.
2. Suggest 2-4 concrete next steps for the engineer (which script to inspect, what invariants to check, what to log).
3. Keep the answer tightly focused on debugging this tool. Do NOT assume access to the filesystem or ability to run commands."""

payload = {
    "model": model,
    "messages": [
        {
            "role": "system",
            "content": "You are a precise, concise debugging assistant for a local developer tool. When unsure, state uncertainties clearly."
        },
        {
            "role": "user",
            "content": prompt,
        },
    ],
}

req = urllib.request.Request(
    "https://api.openai.com/v1/chat/completions",
    data=json.dumps(payload).encode("utf-8"),
    headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    },
)

try:
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = json.load(resp)
    msg = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    if msg:
        print(msg.strip())
except Exception as exc:
    print(f"[AI diagnostics failed: {exc}]", file=sys.stderr)
PY
)"
    if [ -n "$ai_output" ]; then
        echo -e "${CYAN}=== AI diagnostics (OpenAI) ===${NC}"
        printf '%s\n' "$ai_output"
        echo -e "${CYAN}=== end AI diagnostics ===${NC}"
    fi
}

# Defaults can be overridden via environment
AI_LAUNCH_MAX_RETRIES="${AI_LAUNCH_MAX_RETRIES:-1}"           # 1 = no automatic retries, just diagnostics
AI_LAUNCH_RETRY_DELAY="${AI_LAUNCH_RETRY_DELAY:-20}"          # seconds between retries
AI_LAUNCH_MIN_INTERVAL_SEC="${AI_LAUNCH_MIN_INTERVAL_SEC:-300}"
AI_LAUNCH_STATE_FILE="${AI_LAUNCH_STATE_FILE:-${SCRIPT_DIR}/.ai_launch_last_call}"

attempt=1
VERIFY_EXIT=0

while :; do
    echo -e "${CYAN}Running post-launch verification (attempt ${attempt}/${AI_LAUNCH_MAX_RETRIES})...${NC}"
    VERIFY_SCRIPT="${SCRIPT_DIR}/scripts/verify-launch.py"
    VERIFY_ARGS=("--api-port" "${API_PORT}" "--frontend-port" "${FRONTEND_PORT}" "--web-port" "${WEB_PORT}")
    if [ "$BACKEND_ONLY" = true ]; then
        VERIFY_ARGS=("--api-port" "${API_PORT}" "--skip-frontend" "--skip-web")
    elif [ "$FRONTEND_ONLY" = true ]; then
        # Frontend-only mode: assume API already running with its own health,
        # and just exercise the web surfaces as configured.
        VERIFY_ARGS=("--frontend-port" "${FRONTEND_PORT}" "--web-port" "${WEB_PORT}" "--skip-api")
    fi

    VERIFY_OUTPUT="$(python3 "${VERIFY_SCRIPT}" "${VERIFY_ARGS[@]}" 2>&1)"
    VERIFY_EXIT=$?
    printf '%s\n' "$VERIFY_OUTPUT"

    RUN_ID="$(printf '%s\n' "$VERIFY_OUTPUT" | awk -F': ' '/^RUN_ID:/ {print $2}')"

    # --- NEW BEHAVIOR: handle "no RUN_ID" as a first-class failure for AI diagnostics ---
    if [ -z "${RUN_ID}" ]; then
        echo -e "${YELLOW}Verification script did not emit a RUN_ID; skipping run inspection API calls.${NC}"

        # If verification failed (non-zero exit or obvious HTTP errors), call AI diagnostics once
        if [ "$VERIFY_EXIT" -ne 0 ] || printf '%s\n' "$VERIFY_OUTPUT" | grep -qiE 'HTTP 4[0-9][0-9]|HTTP 5[0-9][0-9]'; then
            AI_RUN_STATUS="verify-launch failed (no RUN_ID; exit=${VERIFY_EXIT})"
            AI_LOG_SNIPPET="$VERIFY_OUTPUT" ai_maybe_diagnose_run
        fi

        break
    fi

    echo -e "${CYAN}Inspecting orchestration run ${RUN_ID}...${NC}"

    RUN_JSON="$(curl -fsS "http://localhost:${API_PORT}/orchestrate/run/${RUN_ID}" 2>/dev/null || echo "")"
    if [ -z "$RUN_JSON" ]; then
        echo -e "${YELLOW}Could not fetch run JSON from orchestrator API.${NC}"

        # Treat this as a failure worth AI diagnostics too
        AI_RUN_STATUS="orchestrate/run/${RUN_ID} fetch failed"
        AI_LOG_SNIPPET="$VERIFY_OUTPUT" ai_maybe_diagnose_run
        break
    fi

    RUN_STATUS="$(python3 <<'PY'
import json, sys
try:
    data = json.load(sys.stdin)
    print(data.get("status") or "unknown")
except Exception as exc:
    print(f"error:{exc}")
PY
<<< "$RUN_JSON")"

    echo -e "${CYAN}Run status: ${RUN_STATUS}${NC}"

    LOG_CONTENT="$(curl -fsS "http://localhost:${API_PORT}/orchestrate/run/${RUN_ID}/log?max_bytes=4000" 2>/dev/null || true)"
    if [ -n "$LOG_CONTENT" ]; then
        echo -e "${CYAN}Orchestrator log snippet:${NC}"
        printf '%s\n' "$LOG_CONTENT"
    fi

    # Heuristic failure detection: status begins with "error" OR log contains obvious error markers
    is_error=0
    if printf '%s' "$RUN_STATUS" | grep -qi '^error'; then
        is_error=1
    elif printf '%s\n' "$LOG_CONTENT" | grep -qiE '\[ERROR\]|Traceback|Exception'; then
        is_error=1
    fi

    if [ $is_error -eq 0 ]; then
        echo -e "${GREEN}Orchestration run looks healthy; exiting verification loop.${NC}"
        break
    fi

    # On first failure, optionally call AI diagnostics (rate-limited above)
    if [ "$attempt" -eq 1 ]; then
        AI_RUN_STATUS="$RUN_STATUS" AI_LOG_SNIPPET="$LOG_CONTENT" ai_maybe_diagnose_run
    fi

    if [ "$AI_LAUNCH_MAX_RETRIES" -le 1 ] || [ "$attempt" -ge "$AI_LAUNCH_MAX_RETRIES" ]; then
        echo -e "${YELLOW}Orchestration is still failing and max retries (${AI_LAUNCH_MAX_RETRIES}) reached. Leaving services running for manual debugging.${NC}"
        break
    fi

    attempt=$((attempt + 1))
    echo -e "${YELLOW}Retrying orchestration in ${AI_LAUNCH_RETRY_DELAY}s...${NC}"
    sleep "${AI_LAUNCH_RETRY_DELAY}"
done

if [ "$VERIFY_EXIT" -ne 0 ]; then
    echo -e "${YELLOW}Launch verification script reported issues (exit code ${VERIFY_EXIT}). Check the logs above for details.${NC}"
fi

if [ "$OPEN_BROWSER" = true ] && [ "$BACKEND_ONLY" != true ]; then
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "http://localhost:${FRONTEND_PORT}" >/dev/null 2>&1 &
    elif command -v open >/dev/null 2>&1; then
        open "http://localhost:${FRONTEND_PORT}" >/dev/null 2>&1 &
    fi
fi

# Wait for all background jobs
wait
### END FILE: launch.sh
