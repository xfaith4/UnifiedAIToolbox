#!/usr/bin/env bash
# UnifiedAIToolbox - Simple Launcher
set -euo pipefail

echo "🚀 UnifiedAIToolbox Launcher"
echo ""

# Get repo root
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

# Load environment variables
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from template..."
    cp .env.example .env
    echo "📝 Please edit .env and add your OPENAI_API_KEY"
    echo ""
    read -p "Press Enter to continue after editing .env..."
fi

source .env 2>/dev/null || true

# Check for OpenAI API key
if [ -z "${OPENAI_API_KEY:-}" ] || [ "$OPENAI_API_KEY" = "sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" ]; then
    echo "❌ Error: OPENAI_API_KEY not set in .env"
    echo "   Please edit .env and add your OpenAI API key"
    exit 1
fi

API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-3000}"
PROMPT_API_HOST="${PROMPT_API_HOST:-127.0.0.1}"

# ---------------------------------------------------------------------------
# Port helpers
# ---------------------------------------------------------------------------

# Return the name of the process listening on a given TCP port (best-effort).
_port_owner() {
    local port="$1"
    local owner=""
    # Prefer ss (iproute2); fall back to lsof (macOS / older Linux).
    if command -v ss >/dev/null 2>&1; then
        owner=$(ss -tlnp "sport = :${port}" 2>/dev/null \
                | grep -oP 'users:\(\("\K[^"]+' | head -1)
    fi
    if [ -z "$owner" ] && command -v lsof >/dev/null 2>&1; then
        local pid
        pid=$(lsof -ti ":${port}" -sTCP:LISTEN 2>/dev/null | head -1)
        if [ -n "$pid" ]; then
            owner=$(ps -p "$pid" -o comm= 2>/dev/null || true)
            [ -n "$owner" ] && owner="${owner} (PID ${pid})" || owner="PID ${pid}"
        fi
    fi
    echo "${owner:-unknown process}"
}

# Check if a TCP port is free.  Returns 0 (free) or 1 (in use).
_port_free() {
    local port="$1"
    if command -v ss >/dev/null 2>&1; then
        # Match `:PORT` or `:::PORT` (IPv4-mapped IPv6) followed by space or end-of-field
        ! ss -tln 2>/dev/null | grep -qE "[: ]${port}( |$)" && return 0 || return 1
    elif command -v lsof >/dev/null 2>&1; then
        ! lsof -ti ":${port}" -sTCP:LISTEN >/dev/null 2>&1 && return 0 || return 1
    else
        # Portable fallback via /dev/tcp
        ( echo >/dev/tcp/127.0.0.1/"${port}" ) >/dev/null 2>&1 && return 1 || return 0
    fi
}

# Find the next free port starting at $1 (for service named $2).
# Prints the chosen port; emits warnings to stderr for each busy port.
find_available_port() {
    local base_port="$1"
    local service_name="$2"
    local max_attempts=10
    local port

    for i in $(seq 0 $((max_attempts - 1))); do
        port=$((base_port + i))
        if _port_free "$port"; then
            echo "$port"
            return 0
        fi
        owner=$(_port_owner "$port")
        echo "  ⚠️  WARNING: Port ${port} (${service_name}) is in use by: ${owner}" >&2
    done

    echo "❌ No available port found for ${service_name} in range ${base_port}–$((base_port + max_attempts - 1))." >&2
    return 1
}

echo "📦 Installing dependencies..."
echo ""

# Install Python dependencies
echo "  → Installing Python packages..."
if [ ! -f .venv/bin/activate ]; then
    python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt

# Install Node dependencies for web app
echo "  → Installing Node packages..."
cd apps/unifiedtoolbox.webapp
if [ ! -d node_modules ]; then
    npm install --silent --no-audit --no-fund
fi
cd "$REPO_ROOT"

echo ""
echo "🔍 Checking port availability..."
echo ""

# Resolve actual ports (fallback to next free if requested port is busy).
ACTUAL_API_PORT=$(find_available_port "$API_PORT" "Prompt API") || {
    echo "❌ Cannot start: no free port for Prompt API near ${API_PORT}."
    exit 1
}
if [ "$ACTUAL_API_PORT" != "$API_PORT" ]; then
    echo "  ℹ️  Prompt API will use port ${ACTUAL_API_PORT} instead of ${API_PORT}."
fi

ACTUAL_WEB_PORT=$(find_available_port "$WEB_PORT" "Web Portal") || {
    echo "❌ Cannot start: no free port for Web Portal near ${WEB_PORT}."
    exit 1
}
if [ "$ACTUAL_WEB_PORT" != "$WEB_PORT" ]; then
    echo "  ℹ️  Web Portal will use port ${ACTUAL_WEB_PORT} instead of ${WEB_PORT}."
fi

echo ""
echo "🎯 Starting services..."
echo ""

# Store PIDs for cleanup
pids=()
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    for pid in "${pids[@]}"; do
        kill "$pid" 2>/dev/null || true
    done
}
trap cleanup EXIT INT TERM

# Start FastAPI backend
echo "  → Starting API (port $ACTUAL_API_PORT)..."
(
    cd apps/UnifiedPromptApp/services/prompt-api
    source "$REPO_ROOT/.venv/bin/activate"
    export PYTHONPATH="$REPO_ROOT:$PYTHONPATH"
    export PROMPT_API_HOST
    export PROMPT_API_PORT="$ACTUAL_API_PORT"
    python app.py > "$REPO_ROOT/logs/api.log" 2>&1
) &
pids+=($!)

sleep 3

# Start Next.js frontend
echo "  → Starting Web Portal (port $ACTUAL_WEB_PORT)..."
(
    cd apps/unifiedtoolbox.webapp
    export NEXT_PUBLIC_API_BASE="http://localhost:$ACTUAL_API_PORT"
    export PORT="$ACTUAL_WEB_PORT"
    npm run dev > "$REPO_ROOT/logs/webapp.log" 2>&1
) &
pids+=($!)

sleep 5

echo ""
echo "✅ UnifiedAIToolbox is running!"
echo ""
echo "  🌐 Web Portal:  http://localhost:$ACTUAL_WEB_PORT"
echo "  🔧 API Docs:    http://localhost:$ACTUAL_API_PORT/docs"
echo "  💊 Health:      http://localhost:$ACTUAL_API_PORT/health"
echo ""
echo "  📋 Logs:        tail -f logs/*.log"
echo ""
echo "Press Ctrl+C to stop all services."

# Wait for processes
wait
