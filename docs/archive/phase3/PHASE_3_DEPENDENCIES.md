# Phase 3 Dependencies Analysis
## Unified AI Toolbox v2.0

**Status:** Draft  
**Owner:** Backend Lead / DevOps  
**Last Updated:** December 2025  
**Version:** 1.0

---

## Executive Summary

This document analyzes all dependencies required for Phase 3 (Multi-Tenancy & Kubernetes) of the Unified AI Toolbox, including evaluation of libraries, tools, and frameworks needed for successful implementation.

## Analysis Criteria

### Evaluation Factors
- **Compatibility:** Works with existing stack (Python 3.12+, Node 18+)
- **Maturity:** Stable, well-maintained, production-ready
- **Community:** Active development, good documentation
- **Security:** Regular updates, vulnerability management
- **Performance:** Meets performance requirements
- **License:** Compatible with project license

---

## Python Backend Dependencies

### Current Dependencies (v1.5)

**Core Framework:**
- `fastapi==0.104.1` - Web framework
- `uvicorn[standard]==0.24.0` - ASGI server
- `pydantic==2.5.0` - Data validation

**Database:**
- `sqlalchemy==2.0.23` - ORM
- `aiosqlite==0.19.0` - Async SQLite driver

**AI Providers:**
- `openai==1.3.7` - OpenAI API client
- `anthropic==0.7.7` - Anthropic API client

### New Dependencies for Phase 3

#### 1. PostgreSQL Support ✅ **RECOMMENDED**

**Option A: psycopg2-binary (Recommended)**
```toml
psycopg2-binary = "^2.9.9"
```
- ✅ Most mature PostgreSQL adapter
- ✅ Excellent performance
- ✅ Wide community support
- ❌ Requires PostgreSQL client libraries

**Option B: asyncpg**
```toml
asyncpg = "^0.29.0"
```
- ✅ Pure async implementation
- ✅ Excellent performance
- ✅ Native Python
- ❌ Different API from psycopg2

**Decision: psycopg2-binary**
- Reason: Better SQLAlchemy integration, wider ecosystem support

#### 2. Database Migrations ✅ **REQUIRED**

**Alembic**
```toml
alembic = "^1.13.0"
```
- ✅ Official SQLAlchemy migration tool
- ✅ Version control for schema
- ✅ Supports multiple environments
- ✅ Excellent documentation

**Alternatives Considered:**
- yoyo-migrations: Less mature
- Django migrations: Requires Django

#### 3. Redis Client ✅ **REQUIRED**

**redis-py**
```toml
redis = "^5.0.1"
```
- ✅ Official Redis Python client
- ✅ Async support (redis.asyncio)
- ✅ Connection pooling
- ✅ Cluster support

**Alternatives Considered:**
- aioredis: Merged into redis-py 4.2+
- walrus: Limited features

#### 4. Caching Layer ✅ **RECOMMENDED**

**aiocache**
```toml
aiocache = "^0.12.2"
```
- ✅ Async caching library
- ✅ Multiple backends (Redis, memory)
- ✅ Serialization support
- ✅ TTL management

#### 5. Background Tasks ⏳ **OPTIONAL**

**Celery**
```toml
celery = "^5.3.4"
redis = "^5.0.1"  # Already included
```
- ✅ Industry standard
- ✅ Redis broker support
- ✅ Task scheduling
- ❌ Additional complexity

**Decision: Defer to Phase 4**
- Reason: Can use FastAPI background tasks initially

#### 6. Multi-Tenancy Library ⏳ **EVALUATE**

**Option A: Custom Implementation (Recommended)**
- ✅ Full control over implementation
- ✅ No additional dependencies
- ✅ Tailored to our needs
- ❌ More development effort

**Option B: django-tenants**
- ❌ Requires Django
- Not applicable

**Option C: sqlalchemy-utils**
```toml
sqlalchemy-utils = "^0.41.1"
```
- ✅ Utility functions for SQLAlchemy
- ✅ UUID type helpers
- ✅ Choice type support
- ⚠️ Not specifically for multi-tenancy

**Decision: Custom Implementation + sqlalchemy-utils**
- Reason: Better control, use utils for helpers

#### 7. Authentication Enhancements ✅ **REQUIRED**

**python-jose (JWT)**
```toml
python-jose[cryptography] = "^3.3.0"
```
- ✅ JWT encoding/decoding
- ✅ Cryptographic signing
- ✅ Multiple algorithms

**passlib (Password Hashing)**
```toml
passlib[bcrypt] = "^1.7.4"
```
- ✅ Password hashing utilities
- ✅ bcrypt support
- ✅ Migration from old hashes

#### 8. API Rate Limiting ✅ **REQUIRED**

**slowapi**
```toml
slowapi = "^0.1.9"
```
- ✅ FastAPI-specific
- ✅ Redis backend support
- ✅ Per-route limits
- ✅ Custom key functions

**Alternatives:**
- fastapi-limiter: Similar features
- Decision: Either works, slowapi has better docs

#### 9. Monitoring & Metrics ✅ **REQUIRED**

**prometheus-client**
```toml
prometheus-client = "^0.19.0"
```
- ✅ Official Prometheus client
- ✅ FastAPI integration
- ✅ Custom metrics

**prometheus-fastapi-instrumentator**
```toml
prometheus-fastapi-instrumentator = "^6.1.0"
```
- ✅ Auto-instrumentation
- ✅ Common metrics included
- ✅ Easy setup

#### 10. Structured Logging ✅ **RECOMMENDED**

**structlog**
```toml
structlog = "^23.2.0"
```
- ✅ Structured logging
- ✅ JSON output
- ✅ Context management
- ✅ Excellent for multi-tenancy

---

## JavaScript Frontend Dependencies

### Current Dependencies (v1.5)

**Framework:**
- `react@18.2.0`
- `react-dom@18.2.0`
- `vite@5.0.0`

**UI Components:**
- `@radix-ui/react-*` - UI primitives
- `lucide-react@0.292.0` - Icons

### New Dependencies for Phase 3

#### 1. Tenant Switcher Component ✅ **CUSTOM**

No additional dependencies needed - build custom component using existing Radix UI primitives.

#### 2. State Management Enhancement ⏳ **EVALUATE**

**Current:** React Context API

**Option: Zustand**
```json
"zustand": "^4.4.7"
```
- ✅ Lightweight
- ✅ No boilerplate
- ✅ TypeScript support
- ⚠️ Another state library

**Decision: Defer**
- Reason: Context API sufficient for now

#### 3. API Client Updates ✅ **EXISTING**

Continue using `fetch` with custom hooks. No new dependencies needed.

---

## DevOps & Infrastructure Dependencies

### 1. Kubernetes Tools ✅ **REQUIRED**

**kubectl**
- Version: 1.28+
- Purpose: Cluster management
- Installation: Native binary

**Helm**
- Version: 3.13+
- Purpose: Package management
- Installation: Native binary

**kind (Kubernetes in Docker)**
- Version: 0.20+
- Purpose: Local development
- Installation: Native binary

**Alternatives:**
- minikube: More features, heavier
- k3s: Production-ready, single binary

**Decision: kind for dev, cloud-managed for prod**

### 2. Container Registry ✅ **REQUIRED**

**Options:**
- Docker Hub (free tier available)
- GitHub Container Registry (GHCR) ✅ **RECOMMENDED**
- AWS ECR
- Azure ACR
- GCP Artifact Registry

**Decision: GitHub Container Registry**
- Reason: Free, integrated with GitHub Actions

### 3. Helm Chart Dependencies ✅ **EVALUATE**

**Bitnami Charts** (for PostgreSQL, Redis)
```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
```
- ✅ Well-maintained
- ✅ Production-ready
- ✅ Configurable

**Prometheus Stack**
```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
```
- ✅ Complete monitoring stack
- ✅ Grafana included
- ✅ Service discovery

### 4. CI/CD Tools ✅ **EXISTING**

**GitHub Actions** (already in use)
- ✅ Free for public repos
- ✅ Integrated with GitHub
- ✅ Marketplace actions

No changes needed.

---

## Development Tools

### 1. Database Management ✅ **RECOMMENDED**

**pgAdmin**
- Version: Latest
- Purpose: PostgreSQL GUI
- Deployment: Docker container (already in docker-compose.phase3.yml)

**Redis Commander**
- Version: Latest
- Purpose: Redis GUI
- Deployment: Docker container (already in docker-compose.phase3.yml)

### 2. API Testing ✅ **EXISTING**

**pytest**
```toml
pytest = "^7.4.3"
pytest-asyncio = "^0.21.1"
httpx = "^0.25.2"  # For async API testing
```
- Already in use
- No changes needed

### 3. Code Quality ✅ **EXISTING**

**Python:**
- `black` - Code formatter
- `flake8` - Linter
- `mypy` - Type checker

**JavaScript:**
- `eslint` - Linter
- `prettier` - Formatter
- `typescript` - Type checker

All already in use.

---

## Security Tools

### 1. Vulnerability Scanning ✅ **RECOMMENDED**

**Safety**
```toml
safety = "^2.3.5"
```
- ✅ Checks Python dependencies
- ✅ CVE database
- ✅ CI integration

**npm audit**
- Built into npm
- Already available

### 2. Secret Management ⏳ **EVALUATE**

**Option A: Environment Variables (Current)**
- ✅ Simple
- ✅ Kubernetes secrets
- ❌ No rotation
- ❌ Manual management

**Option B: HashiCorp Vault**
- ✅ Secret rotation
- ✅ Audit logging
- ✅ Dynamic secrets
- ❌ Operational overhead

**Option C: Cloud Provider Secrets**
- AWS Secrets Manager
- Azure Key Vault
- GCP Secret Manager

**Decision: Start with Kubernetes Secrets, migrate to cloud provider later**

### 3. Authentication Libraries ✅ **REQUIRED**

Already covered in Python dependencies:
- python-jose (JWT)
- passlib (password hashing)

---

## Updated Requirements Files

### requirements.txt (Phase 3)

```txt
# Core Framework
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0
pydantic-settings==2.1.0

# Database - PostgreSQL
sqlalchemy==2.0.23
psycopg2-binary==2.9.9
alembic==1.13.0
sqlalchemy-utils==0.41.1

# Database - SQLite (for migration compatibility)
aiosqlite==0.19.0

# Caching - Redis
redis==5.0.1
aiocache==0.12.2

# Authentication & Security
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
cryptography==41.0.7

# Rate Limiting
slowapi==0.1.9

# Monitoring & Metrics
prometheus-client==0.19.0
prometheus-fastapi-instrumentator==6.1.0

# Logging
structlog==23.2.0

# AI Providers (existing)
openai==1.3.7
anthropic==0.7.7

# HTTP Client
httpx==0.25.2

# Utilities
python-dotenv==1.0.0
pyyaml==6.0.1

# Development
pytest==7.4.3
pytest-asyncio==0.21.1
black==23.12.0
flake8==6.1.0
mypy==1.7.1
safety==2.3.5
```

### package.json (Dashboard - Phase 3)

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@radix-ui/react-select": "^2.0.0",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-toast": "^1.1.5",
    "lucide-react": "^0.292.0",
    "clsx": "^2.0.0",
    "tailwindcss": "^3.3.6"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@typescript-eslint/eslint-plugin": "^6.13.2",
    "@typescript-eslint/parser": "^6.13.2",
    "@vitejs/plugin-react": "^4.2.1",
    "eslint": "^8.55.0",
    "eslint-plugin-react": "^7.33.2",
    "prettier": "^3.1.0",
    "typescript": "^5.3.3",
    "vite": "^5.0.0"
  }
}
```

---

## Dependency Security Analysis

### High Priority - Update Immediately

None currently identified. All dependencies are up-to-date.

### Medium Priority - Update in Next Sprint

- Monitor for security advisories
- Regular `safety check` and `npm audit`

### Deprecated Dependencies

None. All dependencies are actively maintained.

---

## License Compatibility

### Project License
MIT License

### All Dependencies
✅ All dependencies are MIT or compatible licenses:
- MIT
- BSD
- Apache 2.0
- ISC

No GPL dependencies that would affect licensing.

---

## Installation Instructions

### Python Environment

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Verify installation
python -c "import psycopg2; import redis; import fastapi; print('✅ All imports successful')"
```

### Node Environment

```bash
# Install dependencies
cd apps/dashboard
npm install

# Verify installation
npm list --depth=0
```

### Infrastructure Tools

```bash
# Install kubectl (Linux)
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/

# Install Helm
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash

# Install kind
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-linux-amd64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/kind

# Verify
kubectl version --client
helm version
kind version
```

---

## Maintenance Plan

### Regular Updates

**Monthly:**
- Check for security updates
- Run `safety check` and `npm audit`
- Update patch versions

**Quarterly:**
- Review new major/minor versions
- Test compatibility
- Update dependencies

**Annually:**
- Major version upgrades
- Dependency audit
- Remove unused dependencies

### Monitoring

**Dependabot Configuration** (`.github/dependabot.yml`):
```yaml
version: 2
updates:
  - package-ecosystem: "pip"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    
  - package-ecosystem: "npm"
    directory: "/apps/dashboard"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
```

---

## Risk Assessment

### High Risk
- None identified

### Medium Risk
- **PostgreSQL driver (psycopg2):** Native dependency requires PostgreSQL client libraries
  - Mitigation: Use Docker for consistent environment
  
- **Redis client:** Network dependency, must handle failures gracefully
  - Mitigation: Implement circuit breakers, fallback to non-cached paths

### Low Risk
- **Multiple authentication libraries:** Ensure consistent security practices
  - Mitigation: Follow established patterns, regular security audits

---

## Alternative Considerations

### Vector Database (Phase 4)

For semantic search capabilities:

**Option A: pgvector**
```toml
pgvector = "^0.2.3"
```
- ✅ PostgreSQL extension
- ✅ No additional service
- ✅ SQL queries
- ❌ Limited features

**Option B: Pinecone**
- ✅ Managed service
- ✅ Excellent performance
- ❌ Cost
- ❌ External dependency

**Option C: Weaviate**
- ✅ Self-hosted
- ✅ Full-featured
- ❌ Operational overhead

**Recommendation: Defer to Phase 4, start with pgvector**

---

## Cost Analysis

### Development Tools (Free)
- All Python packages: Free (OSS)
- All JavaScript packages: Free (OSS)
- kubectl, Helm, kind: Free (OSS)
- Docker: Free (Community Edition)

### Infrastructure (Monthly Estimate)
- PostgreSQL (managed): $20-50
- Redis (managed): $15-30
- Kubernetes (managed): $70-150
- Container Registry (GHCR): Free
- **Total:** $105-230/month for staging/production

### Development (No Cost)
- Local Docker containers
- kind for Kubernetes
- Free tier services

---

## Recommendations

### Immediate (Sprint 0)
1. ✅ Add psycopg2-binary for PostgreSQL
2. ✅ Add redis-py for caching
3. ✅ Add Alembic for migrations
4. ✅ Add prometheus-client for metrics
5. ✅ Add slowapi for rate limiting

### Short-term (Sprint 1-2)
1. ⏳ Set up Dependabot
2. ⏳ Configure safety checks in CI
3. ⏳ Document dependency update process

### Long-term (Phase 4)
1. ⏳ Evaluate Celery for background tasks
2. ⏳ Consider vector database for semantic search
3. ⏳ Implement secret rotation with cloud provider

---

## References

- [Python Package Index (PyPI)](https://pypi.org/)
- [npm Registry](https://www.npmjs.com/)
- [Snyk Vulnerability Database](https://snyk.io/vuln/)
- [GitHub Advisory Database](https://github.com/advisories)

---

**Document Owner:** Backend Lead  
**Review Cycle:** Quarterly  
**Next Review:** March 2026
