#!/bin/bash
# Universal Launch Script for Unified AI Toolbox
# Works on Linux, macOS, and WSL

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default values
USE_DOCKER=false
SKIP_INSTALL=false
FRONTEND_ONLY=false
BACKEND_ONLY=false
API_PORT=8000
FRONTEND_PORT=5173
WEB_PORT=3000

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

# Check prerequisites
check_command() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${RED}Error: $1 is not installed${NC}"
        return 1
    fi
    echo -e "${GREEN}✓ $1 found${NC}"
    return 0
}

echo -e "${CYAN}Checking prerequisites...${NC}"

if [ "$USE_DOCKER" = true ]; then
    check_command docker || exit 1
    check_command docker-compose || check_command docker compose || exit 1
else
    check_command node || exit 1
    check_command npm || exit 1
    check_command python3 || exit 1
    check_command pip3 || exit 1
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
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1 || netstat -an 2>/dev/null | grep -q ":$1.*LISTEN"; then
        return 1
    fi
    return 0
}

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Shutting down services...${NC}"
    jobs -p | xargs -r kill 2>/dev/null || true
    echo -e "${GREEN}Cleanup complete${NC}"
}

trap cleanup EXIT INT TERM

# Start backend services
if [ "$FRONTEND_ONLY" != true ]; then
    echo -e "${CYAN}Setting up backend services...${NC}"
    
    # Check port availability
    if ! check_port $API_PORT; then
        echo -e "${YELLOW}Warning: Port $API_PORT is already in use${NC}"
    fi
    
    cd services/prompt-api
    
    # Create virtual environment if it doesn't exist
    if [ ! -d ".venv-linux" ]; then
        echo -e "${YELLOW}Creating Python virtual environment...${NC}"
        python3 -m venv .venv-linux
    fi
    
    # Activate virtual environment and install dependencies
    source .venv-linux/bin/activate
    
    if [ "$SKIP_INSTALL" != true ]; then
        echo -e "${YELLOW}Installing Python dependencies...${NC}"
        pip install --upgrade pip
        pip install -r requirements.txt
    fi
    
    # Start API server
    echo -e "${GREEN}Starting Prompt API on port $API_PORT...${NC}"
    export PROMPT_API_PORT=$API_PORT
    export OPENAI_MODEL=${OPENAI_MODEL:-gpt-4o-mini}
    export FRONTEND_PORT=$FRONTEND_PORT
    python app.py &
    API_PID=$!
    
    cd "$SCRIPT_DIR"
    sleep 3
fi

# Start frontend services
if [ "$BACKEND_ONLY" != true ]; then
    echo -e "${CYAN}Setting up frontend services...${NC}"
    
    # Check port availability
    if ! check_port $FRONTEND_PORT; then
        echo -e "${YELLOW}Warning: Port $FRONTEND_PORT is already in use${NC}"
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
    export VITE_API_BASE="http://localhost:$API_PORT"
    npm run dev -- --host 0.0.0.0 --port $FRONTEND_PORT &
    DASHBOARD_PID=$!
    
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
fi

if [ "$FRONTEND_ONLY" != true ]; then
    echo -e "${CYAN}  API:${NC}        http://localhost:${API_PORT}"
    echo -e "${CYAN}  Health:${NC}     http://localhost:${API_PORT}/health"
fi

echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services...${NC}"
echo ""

# Wait for all background jobs
wait
