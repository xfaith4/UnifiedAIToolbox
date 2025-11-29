# Phase 3 Development Environment Setup
## Unified AI Toolbox v2.0

**Version**: 1.0  
**Last Updated**: November 2025

---

## Overview

This guide covers setting up the development environment for Phase 3 features, which require additional infrastructure beyond the v1.5 setup.

## Prerequisites

### From Phase 1.5 (Already Installed)
- Node.js 18+
- Python 3.12+
- PowerShell 7.4+
- Docker 24.0+
- Git 2.40+

### New for Phase 3
- PostgreSQL 15+
- Redis 7+
- Kubernetes (kind or minikube)
- kubectl CLI
- Helm 3+

---

## PostgreSQL Setup

### Option 1: Docker (Recommended)

```bash
# Start PostgreSQL with Docker Compose
docker compose -f docker-compose.phase3.yml up -d postgres

# Or standalone:
docker run -d \
  --name postgres-unified \
  -p 5432:5432 \
  -e POSTGRES_USER=unified \
  -e POSTGRES_PASSWORD=unified_dev \
  -e POSTGRES_DB=unified_toolbox \
  -v postgres_data:/var/lib/postgresql/data \
  postgres:15

# Verify connection
docker exec -it postgres-unified psql -U unified -d unified_toolbox -c "SELECT version();"
```

### Option 2: Native Installation

**macOS (Homebrew):**
```bash
brew install postgresql@15
brew services start postgresql@15

# Create database
createdb unified_toolbox
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql-15

# Start service
sudo systemctl start postgresql

# Create user and database
sudo -u postgres createuser -s unified
sudo -u postgres createdb unified_toolbox -O unified
```

**Windows:**
1. Download from https://www.postgresql.org/download/windows/
2. Run installer, set password
3. Add to PATH: `C:\Program Files\PostgreSQL\15\bin`

### Verify PostgreSQL

```bash
# Connect to database
psql -h localhost -U unified -d unified_toolbox

# Test RLS support
CREATE TABLE test_rls (id serial, tenant_id uuid, data text);
ALTER TABLE test_rls ENABLE ROW LEVEL SECURITY;
DROP TABLE test_rls;
```

---

## Redis Setup

### Option 1: Docker (Recommended)

```bash
# Start Redis with Docker Compose
docker compose -f docker-compose.phase3.yml up -d redis

# Or standalone:
docker run -d \
  --name redis-unified \
  -p 6379:6379 \
  redis:7 \
  redis-server --appendonly yes

# Verify connection
docker exec -it redis-unified redis-cli ping
# Should return: PONG
```

### Option 2: Native Installation

**macOS:**
```bash
brew install redis
brew services start redis
redis-cli ping
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis
redis-cli ping
```

**Windows:**
Use WSL2 or Docker (native Redis on Windows is not officially supported).

### Verify Redis

```bash
redis-cli
> SET test "hello"
> GET test
> DEL test
> quit
```

---

## Kubernetes Setup

### Option 1: kind (Kubernetes in Docker)

**Installation:**
```bash
# macOS
brew install kind

# Linux
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-linux-amd64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/kind

# Windows (PowerShell)
choco install kind
```

**Create Cluster:**
```bash
# Using project configuration
kind create cluster --name unified-dev --config=docs/phase3/k8s/kind-config.yaml

# Or simple cluster
kind create cluster --name unified-dev

# Verify
kubectl cluster-info --context kind-unified-dev
```

### Option 2: minikube

**Installation:**
```bash
# macOS
brew install minikube

# Linux
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube

# Windows
choco install minikube
```

**Start Cluster:**
```bash
minikube start --driver=docker --cpus=4 --memory=8192

# Verify
kubectl cluster-info
```

### kubectl Installation

```bash
# macOS
brew install kubectl

# Linux
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/

# Windows
choco install kubernetes-cli

# Verify
kubectl version --client
```

### Helm Installation

```bash
# macOS
brew install helm

# Linux
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Windows
choco install kubernetes-helm

# Verify
helm version
```

---

## Environment Configuration

### Phase 3 Environment Variables

Copy the Phase 3 template:
```bash
cp .env.phase3.example .env.phase3
```

Required variables:
```env
# PostgreSQL
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=unified
POSTGRES_PASSWORD=unified_dev
POSTGRES_DB=unified_toolbox

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Multi-Tenancy
ENABLE_MULTI_TENANCY=true
DEFAULT_TENANT_ID=default-tenant

# Kubernetes (local development)
KUBECONFIG=~/.kube/config
K8S_NAMESPACE=unified-toolbox
```

---

## Docker Compose (Phase 3)

The `docker-compose.phase3.yml` file includes all Phase 3 services:

```bash
# Start core services
docker compose -f docker-compose.phase3.yml up -d postgres redis

# Start with development tools
docker compose -f docker-compose.phase3.yml --profile tools up -d

# Start with monitoring
docker compose -f docker-compose.phase3.yml --profile monitoring up -d

# Start everything
docker compose -f docker-compose.phase3.yml --profile tools --profile monitoring up -d
```

**Available Services:**

| Service | Port | Profile |
|---------|------|---------|
| PostgreSQL | 5432 | (core) |
| Redis | 6379 | (core) |
| pgAdmin | 5050 | tools |
| Redis Commander | 8081 | tools |
| Prometheus | 9090 | monitoring |
| Grafana | 3001 | monitoring |

---

## Verification Script

Run the verification script to check your environment:

```bash
./scripts/verify-phase3-env.sh
```

Expected output:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Phase 3 Environment Verification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[✓] Docker installed (24.0.x)
[✓] PostgreSQL accessible on localhost:5432
[✓] Redis accessible on localhost:6379
[✓] kubectl installed (v1.28.x)
[✓] kind/minikube cluster running
[✓] Helm installed (v3.13.x)
[✓] .env.phase3 configured

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Environment verification PASSED!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Development Workflow

### 1. Start Infrastructure

```bash
# Start PostgreSQL and Redis
docker compose -f docker-compose.phase3.yml up -d

# Start Kubernetes (if needed)
kind create cluster --name unified-dev
```

### 2. Run Migrations

```bash
# Apply database migrations
cd Orchestration/UnifiedPromptApp/services/prompt-api
python -m alembic upgrade head
```

### 3. Start Development Servers

```bash
# Terminal 1: API
cd Orchestration/UnifiedPromptApp/services/prompt-api
python app.py

# Terminal 2: Dashboard
cd apps/dashboard
npm run dev
```

### 4. Run Tests

```bash
# Dashboard tests
cd apps/dashboard && npm run test

# API tests (with PostgreSQL)
cd Orchestration/UnifiedPromptApp/services/prompt-api
DATABASE_URL=postgresql://unified:unified_dev@localhost/unified_toolbox pytest
```

---

## Troubleshooting

### PostgreSQL Connection Issues

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Check logs
docker logs postgres-unified

# Test connection
psql -h localhost -U unified -d unified_toolbox -c "SELECT 1"
```

### Redis Connection Issues

```bash
# Check if Redis is running
docker ps | grep redis

# Test connection
redis-cli ping
```

### Kubernetes Issues

```bash
# Check cluster status
kubectl cluster-info

# Check nodes
kubectl get nodes

# Delete and recreate cluster
kind delete cluster --name unified-dev
kind create cluster --name unified-dev
```

### Port Conflicts

If ports are already in use:
```bash
# Find process using port
lsof -i :5432  # PostgreSQL
lsof -i :6379  # Redis

# Kill process (if safe)
kill -9 <PID>
```

---

## IDE Setup

### VS Code Extensions (Recommended)

- Docker
- Kubernetes
- PostgreSQL (by Chris Kolkman)
- Redis (by cweijan)
- Helm Intellisense

### Settings

Add to `.vscode/settings.json`:
```json
{
  "editor.formatOnSave": true,
  "python.envFile": "${workspaceFolder}/.env.phase3",
  "terminal.integrated.env.linux": {
    "DATABASE_URL": "postgresql://unified:unified_dev@localhost/unified_toolbox"
  }
}
```

---

## Next Steps

1. Review [Multi-Tenancy Specification](../specs/MULTI_TENANCY_SPEC.md)
2. Read [ADR-001: Multi-Tenancy Approach](../adr/001-multi-tenancy.md)
3. Start with Sprint 0 tasks

---

**Need help?** Check GitHub Issues or contact the development team.
