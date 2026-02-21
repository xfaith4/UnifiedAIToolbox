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
echo "  → Starting API (port $API_PORT)..."
(
    cd apps/UnifiedPromptApp/services/prompt-api
    source "$REPO_ROOT/.venv/bin/activate"
    export PYTHONPATH="$REPO_ROOT:$PYTHONPATH"
    export PROMPT_API_HOST
    python app.py > "$REPO_ROOT/logs/api.log" 2>&1
) &
pids+=($!)

sleep 3

# Start Next.js frontend
echo "  → Starting Web Portal (port $WEB_PORT)..."
(
    cd apps/unifiedtoolbox.webapp
    export NEXT_PUBLIC_API_BASE="http://localhost:$API_PORT"
    export PORT="$WEB_PORT"
    npm run dev > "$REPO_ROOT/logs/webapp.log" 2>&1
) &
pids+=($!)

sleep 5

echo ""
echo "✅ UnifiedAIToolbox is running!"
echo ""
echo "  🌐 Web Portal:  http://localhost:$WEB_PORT"
echo "  🔧 API Docs:    http://localhost:$API_PORT/docs"
echo "  💊 Health:      http://localhost:$API_PORT/health"
echo ""
echo "  📋 Logs:        tail -f logs/*.log"
echo ""
echo "Press Ctrl+C to stop all services."

# Wait for processes
wait
