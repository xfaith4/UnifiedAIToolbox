#!/bin/bash
# Phase 3 Environment Verification Script
# Unified AI Toolbox v2.0
#
# This script verifies that all required components for Phase 3 development
# are installed and properly configured.

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

# Helper functions
print_header() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
}

print_check() {
    echo -n "  Checking $1... "
}

pass() {
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASSED++))
}

fail() {
    echo -e "${RED}✗ FAIL${NC}"
    if [ -n "$1" ]; then
        echo -e "    ${RED}→ $1${NC}"
    fi
    ((FAILED++))
}

warn() {
    echo -e "${YELLOW}⚠ WARNING${NC}"
    if [ -n "$1" ]; then
        echo -e "    ${YELLOW}→ $1${NC}"
    fi
    ((WARNINGS++))
}

info() {
    echo -e "    ${BLUE}→ $1${NC}"
}

# Start verification
print_header "Phase 3 Environment Verification"

# ============================================================================
# Check Milestone 1.5 Prerequisites
# ============================================================================
print_header "Milestone 1.5 Prerequisites"

# Node.js
print_check "Node.js (18+)"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -ge 18 ]; then
        pass
        info "Version: $(node --version)"
    else
        fail "Node.js 18+ required, found v$NODE_VERSION"
    fi
else
    fail "Node.js not found. Install from https://nodejs.org/"
fi

# Python
print_check "Python (3.12+)"
if command -v python3 &> /dev/null; then
    PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
    PYTHON_MAJOR=$(echo $PYTHON_VERSION | cut -d'.' -f1)
    PYTHON_MINOR=$(echo $PYTHON_VERSION | cut -d'.' -f2)
    if [ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -ge 12 ]; then
        pass
        info "Version: $(python3 --version)"
    else
        fail "Python 3.12+ required, found $PYTHON_VERSION"
    fi
else
    fail "Python3 not found"
fi

# Docker
print_check "Docker"
if command -v docker &> /dev/null; then
    if docker info &> /dev/null; then
        pass
        info "Version: $(docker --version)"
    else
        fail "Docker daemon not running"
    fi
else
    fail "Docker not found"
fi

# Docker Compose
print_check "Docker Compose"
if docker compose version &> /dev/null; then
    pass
    info "Version: $(docker compose version --short)"
else
    fail "Docker Compose not found"
fi

# ============================================================================
# Check Phase 3 New Requirements
# ============================================================================
print_header "Phase 3 New Requirements"

# PostgreSQL Client
print_check "PostgreSQL client (psql)"
if command -v psql &> /dev/null; then
    pass
    info "Version: $(psql --version)"
else
    warn "psql not found. Install PostgreSQL client for database management."
fi

# PostgreSQL Server/Container
print_check "PostgreSQL server"
if docker ps | grep -q postgres || pg_isready &> /dev/null; then
    pass
    if docker ps | grep -q postgres; then
        info "PostgreSQL running in Docker"
    else
        info "PostgreSQL running natively"
    fi
else
    fail "PostgreSQL not running. Start with: docker run -d -p 5432:5432 postgres:15"
fi

# Redis CLI
print_check "Redis CLI"
if command -v redis-cli &> /dev/null; then
    pass
    info "Version: $(redis-cli --version)"
else
    warn "redis-cli not found. Install Redis for cache management."
fi

# Redis Server/Container
print_check "Redis server"
if docker ps | grep -q redis || (redis-cli ping &> /dev/null); then
    pass
    if docker ps | grep -q redis; then
        info "Redis running in Docker"
    else
        info "Redis running natively"
    fi
else
    fail "Redis not running. Start with: docker run -d -p 6379:6379 redis:7-alpine"
fi

# kubectl
print_check "kubectl (Kubernetes CLI)"
if command -v kubectl &> /dev/null; then
    pass
    info "Version: $(kubectl version --client --short 2>/dev/null || kubectl version --client 2>/dev/null | head -1)"
else
    warn "kubectl not found. Required for Kubernetes development."
fi

# Helm
print_check "Helm (Kubernetes package manager)"
if command -v helm &> /dev/null; then
    pass
    info "Version: $(helm version --short)"
else
    warn "Helm not found. Required for Kubernetes deployments."
fi

# kind
print_check "kind (Kubernetes in Docker)"
if command -v kind &> /dev/null; then
    pass
    info "Version: $(kind version)"
    
    # Check if unified-dev cluster exists
    if kind get clusters 2>/dev/null | grep -q "unified-dev"; then
        info "Cluster 'unified-dev' exists"
    else
        warn "Cluster 'unified-dev' not found. Create with: kind create cluster --name unified-dev"
    fi
else
    warn "kind not found. Alternative: use minikube"
fi

# ============================================================================
# Check Python Dependencies
# ============================================================================
print_header "Python Dependencies"

print_check "FastAPI"
if python3 -c "import fastapi" &> /dev/null; then
    pass
else
    fail "FastAPI not installed. Run: pip install -r services/prompt-api/requirements.txt"
fi

print_check "SQLAlchemy"
if python3 -c "import sqlalchemy" &> /dev/null; then
    pass
else
    fail "SQLAlchemy not installed"
fi

print_check "psycopg2 (PostgreSQL driver)"
if python3 -c "import psycopg2" &> /dev/null; then
    pass
else
    warn "psycopg2 not installed. Install with: pip install psycopg2-binary"
fi

print_check "Redis Python client"
if python3 -c "import redis" &> /dev/null; then
    pass
else
    warn "redis-py not installed. Install with: pip install redis"
fi

print_check "Alembic (database migrations)"
if python3 -c "import alembic" &> /dev/null; then
    pass
else
    warn "Alembic not installed. Install with: pip install alembic"
fi

print_check "pytest"
if python3 -c "import pytest" &> /dev/null; then
    pass
else
    fail "pytest not installed"
fi

# ============================================================================
# Check Node.js Dependencies
# ============================================================================
print_header "Node.js Dependencies"

if [ -d "apps/dashboard/node_modules" ]; then
    print_check "Dashboard dependencies"
    pass
else
    print_check "Dashboard dependencies"
    fail "Run: cd apps/dashboard && npm install"
fi

# ============================================================================
# Check Configuration Files
# ============================================================================
print_header "Configuration Files"

print_check ".env file exists"
if [ -f ".env" ]; then
    pass
else
    warn ".env not found. Copy from .env.example"
fi

print_check ".env.phase3 file exists"
if [ -f ".env.phase3" ]; then
    pass
else
    warn ".env.phase3 not found. Copy from .env.phase3.example"
fi

# Check if .env.phase3 has PostgreSQL configured
if [ -f ".env.phase3" ]; then
    print_check ".env.phase3 PostgreSQL configuration"
    if grep -q "DATABASE_TYPE=postgresql" .env.phase3 && grep -q "DATABASE_URL=postgresql://" .env.phase3; then
        pass
    else
        fail "PostgreSQL not configured in .env.phase3"
    fi
    
    print_check ".env.phase3 Redis configuration"
    if grep -q "REDIS_URL=" .env.phase3; then
        pass
    else
        fail "Redis not configured in .env.phase3"
    fi
fi

# ============================================================================
# Test Connections
# ============================================================================
print_header "Connection Tests"

print_check "PostgreSQL connection"
if [ -f ".env.phase3" ]; then
    DB_URL=$(grep "DATABASE_URL=" .env.phase3 | cut -d'=' -f2)
    if [ -n "$DB_URL" ] && command -v psql &> /dev/null; then
        if psql "$DB_URL" -c "SELECT 1" &> /dev/null; then
            pass
        else
            fail "Cannot connect to PostgreSQL. Check DATABASE_URL in .env.phase3"
        fi
    else
        warn "Cannot test: psql not found or DATABASE_URL not set"
    fi
else
    warn "Cannot test: .env.phase3 not found"
fi

print_check "Redis connection"
if [ -f ".env.phase3" ]; then
    REDIS_URL=$(grep "REDIS_URL=" .env.phase3 | cut -d'=' -f2)
    if [ -n "$REDIS_URL" ] && command -v redis-cli &> /dev/null; then
        REDIS_HOST=$(echo "$REDIS_URL" | sed 's/redis:\/\///' | cut -d':' -f1)
        REDIS_PORT=$(echo "$REDIS_URL" | sed 's/redis:\/\///' | cut -d':' -f2 | cut -d'/' -f1)
        if redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" ping &> /dev/null; then
            pass
        else
            fail "Cannot connect to Redis. Check REDIS_URL in .env.phase3"
        fi
    else
        warn "Cannot test: redis-cli not found or REDIS_URL not set"
    fi
else
    warn "Cannot test: .env.phase3 not found"
fi

# ============================================================================
# Check Documentation
# ============================================================================
print_header "Phase 3 Documentation"

print_check "Phase 3 Sprint 0 plan"
if [ -f "PHASE_3_SPRINT_0.md" ]; then
    pass
else
    fail "PHASE_3_SPRINT_0.md not found"
fi

print_check "Phase 3 documentation structure"
if [ -d "docs/phase3" ]; then
    pass
    if [ -f "docs/phase3/README.md" ]; then
        info "README.md exists"
    fi
    if [ -d "docs/phase3/adr" ]; then
        ADR_COUNT=$(ls -1 docs/phase3/adr/*.md 2>/dev/null | wc -l)
        info "ADRs: $ADR_COUNT"
    fi
    if [ -d "docs/phase3/specs" ]; then
        SPEC_COUNT=$(ls -1 docs/phase3/specs/*.md 2>/dev/null | wc -l)
        info "Specs: $SPEC_COUNT"
    fi
else
    fail "docs/phase3/ directory not found"
fi

# ============================================================================
# Summary
# ============================================================================
echo
print_header "Verification Summary"

echo -e "  ${GREEN}Passed:${NC}   $PASSED"
echo -e "  ${RED}Failed:${NC}   $FAILED"
echo -e "  ${YELLOW}Warnings:${NC} $WARNINGS"
echo

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ Environment verification PASSED!${NC}"
    echo -e "${GREEN}   You're ready to start Phase 3 development.${NC}"
    echo
    echo "Next steps:"
    echo "  1. Review PHASE_3_SPRINT_0.md for sprint objectives"
    echo "  2. Set up any missing optional components (if warnings)"
    echo "  3. Read docs/phase3/specs/MULTI_TENANCY_SPEC.md"
    echo "  4. Pick up a Sprint 0 task and start coding!"
    exit 0
else
    echo -e "${RED}❌ Environment verification FAILED!${NC}"
    echo -e "${RED}   Please fix the failed checks above before starting development.${NC}"
    echo
    echo "Common fixes:"
    echo "  • Install missing software using package manager (brew/apt/choco)"
    echo "  • Start required services (PostgreSQL, Redis)"
    echo "  • Run 'pip install -r services/prompt-api/requirements.txt'"
    echo "  • Run 'cd apps/dashboard && npm install'"
    echo "  • Copy .env.phase3.example to .env.phase3 and configure"
    exit 1
fi
