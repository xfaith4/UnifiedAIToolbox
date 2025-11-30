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

# Logging
LOG_DIR="$SCRIPT_DIR/runs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/launch-$(date +%Y%m%d-%H%M%S).log"
FAILURE_REASON=""

# Mirror output to console and log file
exec > >(tee -a "$LOG_FILE") 2>&1

# Default values
USE_DOCKER=false
SKIP_INSTALL=false
FRONTEND_ONLY=false
BACKEND_ONLY=false
API_PORT=8000
FRONTEND_PORT=5173
WEB_PORT=3000
OPEN_BROWSER=true

# Error trap to surface the failing command before exiting
on_error() {
    local exit_code=$1
    local line_no=$2
    local cmd=$3
    FAILURE_REASON="Command \"${cmd}\" failed with exit code ${exit_code} (line ${line_no})."
    echo -e "${RED}${FAILURE_REASON}${NC}"
    echo -e "${YELLOW}Full log: ${LOG_FILE}${NC}"
    exit "$exit_code"
}

trap 'on_error $? ${LINENO} "$BASH_COMMAND"' ERR

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --docker)
            USE_DOCKER=true
            shift
            ;;
        --skip-install)
            SKIP_INSTALL=true
            shift
            ;;
        --frontend-only)
            FRONTEND_ONLY=true
            shift
            ;;
        --backend-only)
            BACKEND_ONLY=true
            shift
            ;;
        --api-port)
            API_PORT="$2"
            shift 2
            ;;
        --frontend-port)
            FRONTEND_PORT="$2"
            shift 2
            ;;
        --web-port)
            WEB_PORT="$2"
            shift 2
            ;;
        --no-open)
            OPEN_BROWSER=false
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --docker              Use Docker Compose to launch services"
            echo "  --skip-install        Skip dependency installation"
            echo "  --frontend-only       Launch only frontend services"
            echo "  --backend-only        Launch only backend services"
            echo "  --api-port PORT       Set API port (default: 8000)"
            echo "  --frontend-port PORT  Set frontend port (default: 5173)"
            echo "  --web-port PORT       Set web port (default: 3000)"
            echo "  --no-open             Do not auto-open the dashboard in a browser"
            echo "  --help, -h            Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                    # Launch all services locally"
            echo "  $0 --docker           # Launch all services with Docker"
            echo "  $0 --frontend-only    # Launch only frontend"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Banner
echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════╗"
echo "║     Unified AI Toolbox - Launch Script       ║"
echo "╚═══════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "${YELLOW}Logs: ${LOG_FILE}${NC}"

# Check prerequisites
check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${RED}Error: $1 is not installed${NC}"
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
        echo -e "${RED}$bin $required+ required; found $found${NC}"
        return 1
    fi
    echo -e "${GREEN}✓ $bin $found (>= $required)${NC}"
    return 0
}

echo -e "${CYAN}Checking prerequisites...${NC}"

if [ "$USE_DOCKER" = true ]; then
    check_command docker || exit 1
    check_command docker-compose || check_command docker compose || exit 1
else
    check_command node || exit 1
    check_version node "$REQUIRED_NODE" || exit 1
    check_command npm || exit 1
    check_command python3 || check_command python || exit 1
    PYTHON_BIN_GLOBAL="$(command -v python3 || command -v python)"
    check_version "$PYTHON_BIN_GLOBAL" "$REQUIRED_PYTHON" || exit 1
    check_command pip3 || check_command pip || exit 1
    check_command curl || exit 1
fi

echo ""

# Docker launch
if [ "$USE_DOCKER" = true ]; then
    echo -e "${CYAN}Launching with Docker Compose...${NC}"
    
    # Load environment variables
    if [ -f .env ]; then
        export $(cat .env | grep -v '^#' | xargs)
    fi
    
    export API_PORT FRONTEND_PORT WEB_PORT
    
    # Check if docker compose or docker-compose
    if command -v docker compose &> /dev/null; then
        DOCKER_COMPOSE="docker compose"
    else
        DOCKER_COMPOSE="docker-compose"
    fi
    
    # Build and start services
    echo -e "${YELLOW}Building containers...${NC}"
    $DOCKER_COMPOSE build
    
    echo -e "${YELLOW}Starting services...${NC}"
    $DOCKER_COMPOSE up -d
    
    echo ""
    echo -e "${GREEN}Services started successfully!${NC}"
    echo -e "${CYAN}Access points:${NC}"
    echo -e "  Dashboard:  http://localhost:${FRONTEND_PORT}"
    echo -e "  API:        http://localhost:${API_PORT}"
    echo -e "  Web Portal: http://localhost:${WEB_PORT}"
    echo ""
    echo -e "${YELLOW}View logs: $DOCKER_COMPOSE logs -f${NC}"
    echo -e "${YELLOW}Stop all:  $DOCKER_COMPOSE down${NC}"
    
    exit 0
fi

# Native launch (without Docker)
echo -e "${CYAN}Launching services natively...${NC}"

# Function to check if port is available
check_port() {
    if lsof -Pi :"$1" -sTCP:LISTEN -t >/dev/null 2>&1 || netstat -an 2>/dev/null | grep -q ":$1.*LISTEN"; then
        return 1
    fi
    return 0
}

# Function to find an available port starting from a given port
find_available_port() {
    local start_port=$1
    local max_attempts=${2:-10}
    local port=$start_port
    
    for ((i = 1; i <= max_attempts; i++)); do
        if check_port "$port"; then
            echo "$port"
            return 0
        fi
        port=$((port + 1))
    done
    
    return 1
}

# Cleanup function
cleanup() {
    local status=$1

    echo -e "\n${YELLOW}Shutting down services...${NC}"
    jobs -p | xargs -r kill 2>/dev/null || true
    echo -e "${GREEN}Cleanup complete${NC}"

    if [ "$status" -ne 0 ]; then
        if [ -z "$FAILURE_REASON" ]; then
            FAILURE_REASON="Launch failed with exit code ${status}."
        fi
        echo -e "${RED}${FAILURE_REASON}${NC}"
        echo -e "${YELLOW}See detailed log: ${LOG_FILE}${NC}"
        if [ -t 1 ]; then
            read -rp "Press Enter to close..." < /dev/tty
        fi
    fi

    exit "$status"
}

trap 'cleanup $?' EXIT

# Start backend services
# Start backend services
if [ "$FRONTEND_ONLY" != true ]; then
    echo -e "${CYAN}Setting up backend services...${NC}"
    
    # Check port availability and find alternative if needed
    if ! check_port "$API_PORT"; then
        echo -e "${YELLOW}Port $API_PORT is already in use, searching for available port...${NC}"
        ORIGINAL_API_PORT=$API_PORT
        AVAILABLE_PORT=$(find_available_port "$((API_PORT + 1))" 10)
        if [ -n "$AVAILABLE_PORT" ]; then
            API_PORT=$AVAILABLE_PORT
            echo -e "${GREEN}Using alternative port: $API_PORT${NC}"
        else
            echo -e "${RED}Error: Could not find an available port in range ${ORIGINAL_API_PORT}-$((ORIGINAL_API_PORT + 10))${NC}"
            echo -e "${YELLOW}Please free up port $ORIGINAL_API_PORT or specify a different port with --api-port${NC}"
            exit 1
        fi
    fi
    
    cd Orchestration/UnifiedPromptApp/services/prompt-api || cd services/prompt-api

    # Normalize venv location (single .venv)
    if [ ! -d ".venv" ]; then
        echo -e "${YELLOW}Creating Python virtual environment...${NC}"
        python3 -m venv .venv || python -m venv .venv
    fi

    # Resolve Python executable inside venv (Linux/macOS vs Windows)
    PYTHON_BIN=""
    if [ -x ".venv/Scripts/python.exe" ]; then
        PYTHON_BIN=".venv/Scripts/python.exe"
    elif [ -x ".venv/bin/python" ]; then
        PYTHON_BIN=".venv/bin/python"
    fi

    # Detect broken/mismatched venvs (common when switching between WSL and Git Bash)
    if [ -z "$PYTHON_BIN" ] || ! "$PYTHON_BIN" - <<'PY' 2>/dev/null; then
import sys, pathlib
print(sys.executable)
PY
        echo -e "${YELLOW}Existing virtual environment looks incompatible; rebuilding with current Python...${NC}"
        rm -rf .venv
        python3 -m venv .venv || python -m venv .venv
        if [ -x ".venv/Scripts/python.exe" ]; then
            PYTHON_BIN=".venv/Scripts/python.exe"
        elif [ -x ".venv/bin/python" ]; then
            PYTHON_BIN=".venv/bin/python"
        else
            echo -e "${RED}Failed to locate Python inside the recreated virtual environment${NC}"
            exit 1
        fi
    fi

    echo -e "${CYAN}Using virtualenv Python: $PYTHON_BIN${NC}"

    if [ "$SKIP_INSTALL" != true ]; then
        echo -e "${YELLOW}Installing Python dependencies (respecting constraints)...${NC}"
        "$PYTHON_BIN" -m pip install --upgrade pip
        "$PYTHON_BIN" -m pip install -r requirements.txt
    else
        echo -e "${YELLOW}Skipping dependency install (set SKIP_INSTALL=false to reinstall)${NC}"
    fi
    
    # Load local env if present
    if [ -f ".env" ]; then
      export $(cat .env | grep -v '^#' | xargs)
    fi
    
    # Start API server
    echo -e "${GREEN}Starting Prompt API on port $API_PORT...${NC}"
    export PROMPT_API_PORT=$API_PORT
    export OPENAI_MODEL=${OPENAI_MODEL:-gpt-4o-mini}
    export FRONTEND_PORT=$FRONTEND_PORT
    "$PYTHON_BIN" -m uvicorn app:app --host 0.0.0.0 --port $API_PORT &
    API_PID=$!
    
    cd "$SCRIPT_DIR"
    echo -e "${CYAN}Waiting for API to respond...${NC}"
    for _ in $(seq 1 30); do
        if curl -fsS "http://localhost:${API_PORT}/health" >/dev/null 2>&1; then
            echo -e "${GREEN}API is up at http://localhost:${API_PORT}${NC}"
            break
        fi
        sleep 1
    done
fi

if [ "$FRONTEND_ONLY" != true ]; then
    if [ -z "${NEXT_PUBLIC_API_BASE:-}" ]; then
        export NEXT_PUBLIC_API_BASE="http://localhost:${API_PORT}"
    fi
    if [ -z "${NEXT_PUBLIC_PROMPT_API_BASE:-}" ]; then
        export NEXT_PUBLIC_PROMPT_API_BASE="${NEXT_PUBLIC_API_BASE}"
    fi
fi

# Start frontend services
if [ "$BACKEND_ONLY" != true ]; then
    echo -e "${CYAN}Setting up frontend services...${NC}"
    
    # Check port availability and find alternative if needed
    if ! check_port "$FRONTEND_PORT"; then
        echo -e "${YELLOW}Port $FRONTEND_PORT is already in use, searching for available port...${NC}"
        ORIGINAL_FRONTEND_PORT=$FRONTEND_PORT
        AVAILABLE_PORT=$(find_available_port "$((FRONTEND_PORT + 1))" 10)
        if [ -n "$AVAILABLE_PORT" ]; then
            FRONTEND_PORT=$AVAILABLE_PORT
            echo -e "${GREEN}Using alternative port: $FRONTEND_PORT${NC}"
        else
            echo -e "${RED}Error: Could not find an available port in range ${ORIGINAL_FRONTEND_PORT}-$((ORIGINAL_FRONTEND_PORT + 10))${NC}"
            echo -e "${YELLOW}Please free up port $ORIGINAL_FRONTEND_PORT or specify a different port with --frontend-port${NC}"
            exit 1
        fi
    fi
    
    cd apps/dashboard
    
    if [ "$SKIP_INSTALL" != true ]; then
        if [ ! -d "node_modules" ]; then
            echo -e "${YELLOW}Installing dashboard dependencies...${NC}"
            npm install
        fi
    fi
    
    echo -e "${GREEN}Starting Dashboard on port $FRONTEND_PORT...${NC}"
    export VITE_PORT=$FRONTEND_PORT
    export VITE_API_URL="http://localhost:$API_PORT"
    export VITE_API_BASE="http://localhost:$API_PORT"
    npm run dev -- --host 0.0.0.0 --port $FRONTEND_PORT &
    DASHBOARD_PID=$!
    
    cd "$SCRIPT_DIR"
fi

# Start Next.js web portal
if [ "$BACKEND_ONLY" != true ]; then
    echo -e "${CYAN}Setting up web portal services...${NC}"
    
    if ! check_port "$WEB_PORT"; then
        echo -e "${YELLOW}Port $WEB_PORT is already in use, searching for available port...${NC}"
        ORIGINAL_WEB_PORT=$WEB_PORT
        AVAILABLE_WEB_PORT=$(find_available_port "$((WEB_PORT + 1))" 10)
        if [ -n "$AVAILABLE_WEB_PORT" ]; then
            WEB_PORT=$AVAILABLE_WEB_PORT
            echo -e "${GREEN}Using alternative port: $WEB_PORT${NC}"
        else
            echo -e "${RED}Error: Could not find an available port in range ${ORIGINAL_WEB_PORT}-$((ORIGINAL_WEB_PORT + 10))${NC}"
            echo -e "${YELLOW}Please free up port $ORIGINAL_WEB_PORT or specify a different port with --web-port${NC}"
            exit 1
        fi
    fi
    
    cd apps/unifiedtoolbox.webapp
    
    if [ "$SKIP_INSTALL" != true ]; then
        if [ ! -d "node_modules" ]; then
            echo -e "${YELLOW}Installing web portal dependencies...${NC}"
            npm install
        fi
    else
        echo -e "${YELLOW}Skipping web portal dependency install (set SKIP_INSTALL=false to reinstall)${NC}"
    fi

    echo -e "${GREEN}Starting Web Portal on port $WEB_PORT...${NC}"
    export PORT=$WEB_PORT
    npm run dev -- --hostname 0.0.0.0 --port $WEB_PORT &
    WEB_PORTAL_PID=$!
    
    cd "$SCRIPT_DIR"
fi

# Display status
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Unified AI Toolbox is running!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════${NC}"
echo ""

if [ "$BACKEND_ONLY" != true ]; then
    echo -e "${CYAN}  Dashboard:${NC}  http://localhost:${FRONTEND_PORT}"
    echo -e "${CYAN}  Web Portal:${NC}  http://localhost:${WEB_PORT}"
fi

if [ "$FRONTEND_ONLY" != true ]; then
    echo -e "${CYAN}  API:${NC}        http://localhost:${API_PORT}"
    echo -e "${CYAN}  Health:${NC}     http://localhost:${API_PORT}/health"
fi

echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services...${NC}"
echo ""

if [ "$OPEN_BROWSER" = true ] && [ "$BACKEND_ONLY" != true ]; then
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "http://localhost:${FRONTEND_PORT}" >/dev/null 2>&1 &
    elif command -v open >/dev/null 2>&1; then
        open "http://localhost:${FRONTEND_PORT}" >/dev/null 2>&1 &
    fi
fi

# Wait for all background jobs
wait
