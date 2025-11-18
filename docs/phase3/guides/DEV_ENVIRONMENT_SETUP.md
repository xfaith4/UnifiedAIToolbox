# Phase 3 Development Environment Setup Guide
## Unified AI Toolbox v2.0

**Version:** 1.0  
**Last Updated:** November 18, 2025  
**Target:** Developers joining Phase 3

---

## Overview

This guide helps you set up a complete Phase 3 development environment including:
- PostgreSQL database
- Redis cache
- Kubernetes (local)
- All Phase 3 dependencies

**Estimated setup time:** 30-60 minutes

---

## Prerequisites

Ensure you have completed Milestone 1.5 environment setup first:
- ✅ Node.js 18+
- ✅ Python 3.12+
- ✅ Docker & Docker Compose
- ✅ PowerShell 7.4+ (optional)
- ✅ Git

---

## Phase 3 Additional Requirements

### 1. PostgreSQL (Development)

**Option A: Docker (Recommended)**
```bash
docker run --name unified-postgres \
  -e POSTGRES_DB=unified_dev \
  -e POSTGRES_USER=unified_user \
  -e POSTGRES_PASSWORD=dev_password_change_me \
  -p 5432:5432 \
  -v postgres_data:/var/lib/postgresql/data \
  -d postgres:15

# Verify it's running
docker ps | grep unified-postgres
```

**Option B: Native Installation**
```bash
# Ubuntu/Debian
sudo apt install postgresql-15 postgresql-contrib

# macOS
brew install postgresql@15
brew services start postgresql@15

# Windows
# Download from: https://www.postgresql.org/download/windows/
```

### 2. Redis (Development)

**Option A: Docker (Recommended)**
```bash
docker run --name unified-redis \
  -p 6379:6379 \
  -v redis_data:/data \
  -d redis:7-alpine

# Verify it's running
docker exec unified-redis redis-cli ping
# Should output: PONG
```

**Option B: Native Installation**
```bash
# Ubuntu/Debian
sudo apt install redis-server
sudo systemctl start redis

# macOS
brew install redis
brew services start redis

# Windows
# Download from: https://github.com/microsoftarchive/redis/releases
```

### 3. Kubernetes (Local Development)

**Option A: kind (Kubernetes in Docker) - Recommended**
```bash
# Install kind
# macOS
brew install kind

# Linux
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-linux-amd64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/kind

# Windows
curl.exe -Lo kind-windows-amd64.exe https://kind.sigs.k8s.io/dl/v0.20.0/kind-windows-amd64
Move-Item .\kind-windows-amd64.exe c:\local\bin\kind.exe

# Create development cluster
kind create cluster --name unified-dev --config=docs/phase3/k8s/kind-config.yaml

# Verify
kubectl cluster-info --context kind-unified-dev
```

**Option B: minikube**
```bash
# Install minikube
# macOS
brew install minikube

# Linux
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube

# Start cluster
minikube start --cpus=4 --memory=8192

# Verify
kubectl get nodes
```

### 4. kubectl (Kubernetes CLI)
```bash
# macOS
brew install kubectl

# Linux
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# Windows
choco install kubernetes-cli

# Verify
kubectl version --client
```

### 5. Helm (Kubernetes Package Manager)
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

### 1. Create Phase 3 .env File

```bash
cd /path/to/UnifiedAIToolbox
cp .env.example .env.phase3
```

**Edit .env.phase3:**
```bash
# Phase 3 Development Environment

# Database (PostgreSQL)
DATABASE_TYPE=postgresql
DATABASE_URL=postgresql://unified_user:dev_password_change_me@localhost:5432/unified_dev
DATABASE_POOL_SIZE=20
DATABASE_MAX_OVERFLOW=10

# Legacy SQLite (for migration testing)
SQLITE_PATH=./data/sqlite/prompts.db

# Redis
REDIS_URL=redis://localhost:6379/0
REDIS_MAX_CONNECTIONS=50

# Multi-tenancy
DEFAULT_TENANT_SLUG=default
TENANT_SUBDOMAIN_ENABLED=true
TENANT_URL_PATH_ENABLED=true

# JWT Authentication
JWT_SECRET_KEY=dev_secret_key_change_in_production_please
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
JWT_REFRESH_TOKEN_EXPIRE_DAYS=7

# AI Providers (use existing keys)
OPENAI_API_KEY=your_openai_key_here
ANTHROPIC_API_KEY=your_anthropic_key_here
GITHUB_TOKEN=your_github_token_here

# Feature Flags
FEATURE_MULTI_TENANCY=true
FEATURE_KUBERNETES_DEPLOYMENT=true
FEATURE_ADVANCED_ANALYTICS=false

# Development Settings
DEBUG=true
LOG_LEVEL=DEBUG
CORS_ORIGINS=http://localhost:5173,http://localhost:3000
ENVIRONMENT=development

# Storage (local for dev)
STORAGE_TYPE=local
STORAGE_PATH=./data/storage
STORAGE_MAX_SIZE_MB=1000

# Monitoring
PROMETHEUS_ENABLED=true
PROMETHEUS_PORT=9090
```

### 2. Initialize PostgreSQL Database

```bash
# Create database schema
cd services/prompt-api
python scripts/init_database.py --env=development

# Or use psql directly
psql -h localhost -U unified_user -d unified_dev -f data/sqlite/schema-postgres.sql

# Verify tables created
psql -h localhost -U unified_user -d unified_dev -c "\dt public.*"
```

### 3. Load Sample Data

```bash
# Load sample tenants and users
python scripts/load_sample_data.py --tenants=3 --users-per-tenant=5

# Or use SQL
psql -h localhost -U unified_user -d unified_dev -f scripts/sample_data.sql
```

### 4. Verify Environment

```bash
# Run environment verification script
./scripts/verify-phase3-env.sh

# Expected output:
# ✓ PostgreSQL connection: OK
# ✓ Redis connection: OK
# ✓ Kubernetes cluster: OK (kind-unified-dev)
# ✓ kubectl configured: OK
# ✓ Helm installed: OK
# ✓ Python dependencies: OK
# ✓ Node dependencies: OK
```

---

## IDE Setup

### VS Code Extensions (Recommended)

```json
{
  "recommendations": [
    // Existing extensions
    "ms-python.python",
    "ms-python.vscode-pylance",
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    
    // Phase 3 additions
    "ms-kubernetes-tools.vscode-kubernetes-tools",
    "ms-azuretools.vscode-docker",
    "ms-vscode.powershell",
    "mtxr.sqltools",
    "mtxr.sqltools-driver-pg",
    "hashicorp.terraform"
  ]
}
```

### Database Client

**Option 1: SQLTools (VS Code)**
```json
{
  "sqltools.connections": [
    {
      "name": "Unified Dev",
      "driver": "PostgreSQL",
      "server": "localhost",
      "port": 5432,
      "database": "unified_dev",
      "username": "unified_user",
      "password": "dev_password_change_me"
    }
  ]
}
```

**Option 2: TablePlus / DBeaver / pgAdmin**
- Download from respective websites
- Configure connection with above credentials

---

## Development Workflow

### 1. Start All Services (Docker Compose)

```bash
# Phase 3 development stack
docker compose -f docker-compose.phase3.yml up -d

# Check status
docker compose -f docker-compose.phase3.yml ps

# View logs
docker compose -f docker-compose.phase3.yml logs -f
```

### 2. Run API Server (Development Mode)

```bash
cd services/prompt-api

# Install dependencies (first time)
pip install -r requirements.txt
pip install -r requirements-dev.txt

# Run with hot reload
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Or with environment file
uvicorn main:app --reload --env-file ../../.env.phase3
```

### 3. Run Dashboard (Development Mode)

```bash
cd apps/dashboard

# Install dependencies (first time)
npm install

# Run with hot reload
npm run dev

# Access at: http://localhost:5173
```

### 4. Run Tests

```bash
# Backend tests
cd services/prompt-api
pytest tests/ -v

# With coverage
pytest tests/ -v --cov=. --cov-report=html

# Frontend tests
cd apps/dashboard
npm test

# E2E tests
npm run test:e2e
```

### 5. Database Migrations

```bash
cd services/prompt-api

# Create new migration
alembic revision -m "Add tenant support to prompts table"

# Run migrations
alembic upgrade head

# Rollback last migration
alembic downgrade -1

# View migration history
alembic history
```

---

## Kubernetes Development

### 1. Deploy to Local Cluster

```bash
# Build Docker images
docker build -t unified-api:dev -f services/prompt-api/Dockerfile .
docker build -t unified-dashboard:dev -f apps/dashboard/Dockerfile .

# Load images into kind
kind load docker-image unified-api:dev --name unified-dev
kind load docker-image unified-dashboard:dev --name unified-dev

# Deploy with Helm
helm install unified ./charts/unified-toolbox \
  --values ./charts/unified-toolbox/values-dev.yaml \
  --namespace unified-dev \
  --create-namespace

# Check deployment status
kubectl get pods -n unified-dev
kubectl get svc -n unified-dev
```

### 2. Access Services in Kubernetes

```bash
# Port forward API
kubectl port-forward -n unified-dev svc/unified-api 8000:8000

# Port forward Dashboard
kubectl port-forward -n unified-dev svc/unified-dashboard 5173:80

# Port forward PostgreSQL (if in cluster)
kubectl port-forward -n unified-dev svc/postgresql 5432:5432
```

### 3. View Logs

```bash
# API logs
kubectl logs -n unified-dev -l app=unified-api -f

# Dashboard logs
kubectl logs -n unified-dev -l app=unified-dashboard -f

# All logs
kubectl logs -n unified-dev --all-containers -f
```

---

## Troubleshooting

### PostgreSQL Connection Issues

```bash
# Check if PostgreSQL is running
docker ps | grep postgres
# or
sudo systemctl status postgresql

# Test connection
psql -h localhost -U unified_user -d unified_dev -c "SELECT 1"

# Check logs
docker logs unified-postgres
```

### Redis Connection Issues

```bash
# Check if Redis is running
docker ps | grep redis

# Test connection
redis-cli -h localhost -p 6379 ping

# Check logs
docker logs unified-redis
```

### Kubernetes Issues

```bash
# Check cluster status
kubectl cluster-info

# Check node status
kubectl get nodes

# Describe problem pod
kubectl describe pod <pod-name> -n unified-dev

# Check events
kubectl get events -n unified-dev --sort-by='.lastTimestamp'
```

### Database Migration Issues

```bash
# Check current version
alembic current

# View pending migrations
alembic heads

# Stamp database to specific version (manual fix)
alembic stamp head

# Reset database (CAUTION: destroys data)
python scripts/reset_database.py --confirm
```

---

## Performance Optimization

### PostgreSQL Tuning (Development)

```sql
-- Add to postgresql.conf or set at runtime
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = '0.9';
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = '100';
ALTER SYSTEM SET random_page_cost = '1.1';
ALTER SYSTEM SET effective_io_concurrency = '200';

-- Reload configuration
SELECT pg_reload_conf();
```

### Redis Configuration

```bash
# Edit redis.conf
maxmemory 256mb
maxmemory-policy allkeys-lru
```

---

## Next Steps

Once your environment is set up:

1. **Read technical specifications:**
   - [MULTI_TENANCY_SPEC.md](../specs/MULTI_TENANCY_SPEC.md)
   - [K8S_ARCHITECTURE.md](../specs/K8S_ARCHITECTURE.md) (coming soon)

2. **Review ADRs:**
   - [ADR-001: Multi-Tenancy Approach](../adr/001-multi-tenancy-approach.md)

3. **Join team channels:**
   - Slack: #phase3-dev
   - Daily standup: 9:00 AM

4. **Pick up your first ticket:**
   - Check Sprint 1 backlog
   - Self-assign a starter task
   - Ask questions in Slack

---

## Support

**Having issues?**
- Check the troubleshooting section above
- Search existing issues in GitHub
- Ask in #phase3-dev Slack channel
- Create a ticket if it's a bug

**Documentation feedback:**
- This guide is a living document
- Submit PRs to improve it
- Report unclear sections

---

**Environment setup complete!** 🎉  
**Ready to build Phase 3!** 🚀
