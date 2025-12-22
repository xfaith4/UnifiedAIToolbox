#!/bin/bash

###############################################################################
# Pre-Deployment Verification Script
# Unified AI Toolbox v1.5
#
# This script verifies that all prerequisites are met before deploying
# to production. Run this on the production server before deployment.
#
# Usage: ./scripts/pre-deployment-check.sh
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Functions
print_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

print_summary() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Pre-Deployment Check Summary${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
    echo -e "${GREEN}Passed:${NC}   $PASSED"
    echo -e "${RED}Failed:${NC}   $FAILED"
    echo -e "${YELLOW}Warnings:${NC} $WARNINGS"
    echo ""
    
    if [ $FAILED -gt 0 ]; then
        echo -e "${RED}❌ Pre-deployment checks FAILED${NC}"
        echo -e "${RED}   Fix the failed checks before proceeding with deployment.${NC}\n"
        exit 1
    elif [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠️  Pre-deployment checks PASSED with warnings${NC}"
        echo -e "${YELLOW}   Review warnings before proceeding with deployment.${NC}\n"
        exit 0
    else
        echo -e "${GREEN}✅ All pre-deployment checks PASSED${NC}"
        echo -e "${GREEN}   System is ready for production deployment.${NC}\n"
        exit 0
    fi
}

###############################################################################
# 1. System Requirements
###############################################################################
print_header "1. System Requirements"

# Check OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    check_pass "Operating System: $NAME $VERSION"
else
    check_warn "Could not detect operating system"
fi

# Check CPU cores
CPU_CORES=$(nproc)
if [ "$CPU_CORES" -ge 4 ]; then
    check_pass "CPU Cores: $CPU_CORES (recommended: 4+)"
elif [ "$CPU_CORES" -ge 2 ]; then
    check_warn "CPU Cores: $CPU_CORES (minimum: 2, recommended: 4+)"
else
    check_fail "CPU Cores: $CPU_CORES (minimum: 2 required)"
fi

# Check RAM
TOTAL_RAM=$(free -g | awk '/^Mem:/{print $2}')
if [ "$TOTAL_RAM" -ge 8 ]; then
    check_pass "RAM: ${TOTAL_RAM}GB (recommended: 8GB+)"
elif [ "$TOTAL_RAM" -ge 4 ]; then
    check_warn "RAM: ${TOTAL_RAM}GB (minimum: 4GB, recommended: 8GB+)"
else
    check_fail "RAM: ${TOTAL_RAM}GB (minimum: 4GB required)"
fi

# Check disk space
DISK_AVAIL=$(df -BG . | awk 'NR==2 {print $4}' | sed 's/G//')
if [ "$DISK_AVAIL" -ge 50 ]; then
    check_pass "Disk Space Available: ${DISK_AVAIL}GB (recommended: 50GB+)"
elif [ "$DISK_AVAIL" -ge 20 ]; then
    check_warn "Disk Space Available: ${DISK_AVAIL}GB (minimum: 20GB, recommended: 50GB+)"
else
    check_fail "Disk Space Available: ${DISK_AVAIL}GB (minimum: 20GB required)"
fi

###############################################################################
# 2. Required Software
###############################################################################
print_header "2. Required Software"

# Check Docker
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version | grep -oP '\d+\.\d+' | head -1)
    check_pass "Docker installed: $DOCKER_VERSION"
else
    check_fail "Docker is not installed (required: 24.0+)"
fi

# Check Docker Compose
if command -v docker compose version &> /dev/null; then
    COMPOSE_VERSION=$(docker compose version --short)
    check_pass "Docker Compose installed: $COMPOSE_VERSION"
else
    check_fail "Docker Compose is not installed (required: 2.20+)"
fi

# Check Git
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version | grep -oP '\d+\.\d+\.\d+')
    check_pass "Git installed: $GIT_VERSION"
else
    check_fail "Git is not installed (required)"
fi

# Check Python
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version | grep -oP '\d+\.\d+')
    if [[ $(echo "$PYTHON_VERSION >= 3.12" | bc -l) -eq 1 ]]; then
        check_pass "Python installed: $PYTHON_VERSION (required: 3.12+)"
    else
        check_warn "Python version: $PYTHON_VERSION (recommended: 3.12+)"
    fi
else
    check_fail "Python 3 is not installed (required: 3.12+)"
fi

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version | grep -oP '\d+' | head -1)
    if [ "$NODE_VERSION" -ge 18 ]; then
        check_pass "Node.js installed: v$NODE_VERSION (required: 18+)"
    else
        check_warn "Node.js version: v$NODE_VERSION (recommended: 18+)"
    fi
else
    check_fail "Node.js is not installed (required: 18+)"
fi

###############################################################################
# 3. Network Configuration
###############################################################################
print_header "3. Network Configuration"

# Check firewall
if command -v ufw &> /dev/null; then
    UFW_STATUS=$(sudo ufw status | head -1)
    if [[ $UFW_STATUS == *"active"* ]]; then
        check_pass "Firewall (ufw) is active"
        
        # Check specific ports
        if sudo ufw status | grep -q "80"; then
            check_pass "Port 80 (HTTP) is configured"
        else
            check_warn "Port 80 (HTTP) not configured in firewall"
        fi
        
        if sudo ufw status | grep -q "443"; then
            check_pass "Port 443 (HTTPS) is configured"
        else
            check_warn "Port 443 (HTTPS) not configured in firewall"
        fi
    else
        check_warn "Firewall (ufw) is not active"
    fi
else
    check_warn "ufw not found (firewall configuration not verified)"
fi

# Check if ports are available
for port in 8000 5173; do
    if ! sudo lsof -i :$port &> /dev/null; then
        check_pass "Port $port is available"
    else
        check_warn "Port $port is already in use"
    fi
done

###############################################################################
# 4. Environment Configuration
###############################################################################
print_header "4. Environment Configuration"

# Check if .env file exists
if [ -f ".env" ]; then
    check_pass ".env file exists"
    
    # Check critical environment variables
    required_vars=("JWT_SECRET_KEY" "OPENAI_API_KEY" "ANTHROPIC_API_KEY" "GITHUB_TOKEN")
    for var in "${required_vars[@]}"; do
        if grep -q "^${var}=" .env && ! grep -q "^${var}=$" .env && ! grep -q "^${var}=<" .env; then
            check_pass "Environment variable $var is set"
        else
            check_fail "Environment variable $var is not set or is placeholder"
        fi
    done
    
    # Check JWT_SECRET_KEY strength
    JWT_SECRET=$(grep "^JWT_SECRET_KEY=" .env | cut -d'=' -f2)
    if [ ${#JWT_SECRET} -ge 32 ]; then
        check_pass "JWT_SECRET_KEY is strong (${#JWT_SECRET} characters)"
    else
        check_fail "JWT_SECRET_KEY is too short (${#JWT_SECRET} characters, minimum: 32)"
    fi
    
else
    check_fail ".env file does not exist (create from .env.example)"
fi

# Check file permissions on .env
if [ -f ".env" ]; then
    ENV_PERMS=$(stat -c %a .env)
    if [ "$ENV_PERMS" = "600" ] || [ "$ENV_PERMS" = "400" ]; then
        check_pass ".env file permissions are secure ($ENV_PERMS)"
    else
        check_warn ".env file permissions are $ENV_PERMS (recommended: 600)"
    fi
fi

###############################################################################
# 5. Database Setup
###############################################################################
print_header "5. Database Setup"

# Check if data directory exists
if [ -d "data" ]; then
    check_pass "data/ directory exists"
    
    # Check for database files
    for db in prompts.db auth.db audit.db; do
        if [ -f "data/$db" ]; then
            check_pass "Database file data/$db exists"
            
            # Check database integrity
            if command -v sqlite3 &> /dev/null; then
                if sqlite3 "data/$db" "PRAGMA integrity_check;" | grep -q "ok"; then
                    check_pass "Database data/$db integrity is OK"
                else
                    check_fail "Database data/$db integrity check failed"
                fi
            fi
        else
            check_warn "Database file data/$db does not exist (will be created)"
        fi
    done
else
    check_warn "data/ directory does not exist (will be created)"
fi

###############################################################################
# 6. Application Build
###############################################################################
print_header "6. Application Build"

# Check dashboard build
if [ -d "apps/dashboard/dist" ]; then
    check_pass "Dashboard build directory exists"
    
    # Check for index.html
    if [ -f "apps/dashboard/dist/index.html" ]; then
        check_pass "Dashboard index.html exists"
    else
        check_fail "Dashboard index.html not found"
    fi
    
    # Check bundle size
    if [ -f "apps/dashboard/dist/assets/index-*.js" ]; then
        BUNDLE_SIZE=$(ls -lh apps/dashboard/dist/assets/index-*.js | awk '{print $5}')
        check_pass "Dashboard bundle exists ($BUNDLE_SIZE)"
    fi
else
    check_fail "Dashboard not built (run: cd apps/dashboard && npm run build)"
fi

# Check API dependencies
if [ -f "services/prompt-api/requirements.txt" ]; then
    check_pass "API requirements.txt exists"
    
    # Try to import key modules
    if command -v python3 &> /dev/null; then
        if python3 -c "import fastapi" 2>/dev/null; then
            check_pass "FastAPI is installed"
        else
            check_fail "FastAPI is not installed (run: pip install -r requirements.txt)"
        fi
        
        if python3 -c "import openai" 2>/dev/null; then
            check_pass "OpenAI SDK is installed"
        else
            check_fail "OpenAI SDK is not installed"
        fi
    fi
fi

###############################################################################
# 7. Security Configuration
###############################################################################
print_header "7. Security Configuration"

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    check_warn "Running as root (not recommended for production)"
else
    check_pass "Not running as root"
fi

# Check for certbot (SSL)
if command -v certbot &> /dev/null; then
    check_pass "Certbot is installed (for SSL certificates)"
else
    check_warn "Certbot not installed (needed for Let's Encrypt SSL)"
fi

# Check nginx
if command -v nginx &> /dev/null; then
    NGINX_VERSION=$(nginx -v 2>&1 | grep -oP '\d+\.\d+\.\d+')
    check_pass "nginx installed: $NGINX_VERSION"
else
    check_warn "nginx not installed (optional for reverse proxy)"
fi

###############################################################################
# 8. Connectivity Tests
###############################################################################
print_header "8. External Service Connectivity"

# Test OpenAI API (if key is set)
if [ -f ".env" ] && grep -q "^OPENAI_API_KEY=sk-" .env; then
    if curl -s --max-time 5 https://api.openai.com > /dev/null; then
        check_pass "Can reach api.openai.com"
    else
        check_warn "Cannot reach api.openai.com (check network/firewall)"
    fi
fi

# Test Anthropic API
if curl -s --max-time 5 https://api.anthropic.com > /dev/null; then
    check_pass "Can reach api.anthropic.com"
else
    check_warn "Cannot reach api.anthropic.com (check network/firewall)"
fi

# Test GitHub API
if curl -s --max-time 5 https://api.github.com > /dev/null; then
    check_pass "Can reach api.github.com"
else
    check_warn "Cannot reach api.github.com (check network/firewall)"
fi

###############################################################################
# 9. Documentation Check
###############################################################################
print_header "9. Documentation"

docs=("README.md" "PRODUCTION_DEPLOYMENT.md" "SECURITY.md" "WHATS_NEXT.md")
for doc in "${docs[@]}"; do
    if [ -f "$doc" ] || [ -f "docs/$doc" ]; then
        check_pass "Documentation: $doc exists"
    else
        check_warn "Documentation: $doc not found"
    fi
done

###############################################################################
# Print Summary
###############################################################################
print_summary
