# Multi-Tenancy Technical Specification
## Unified AI Toolbox Phase 3 - Stream 1

**Version:** 1.0  
**Status:** Draft  
**Last Updated:** November 18, 2025  
**Owner:** Backend Team

---

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Database Design](#database-design)
4. [API Changes](#api-changes)
5. [Authentication & Authorization](#authentication--authorization)
6. [Tenant Management](#tenant-management)
7. [Resource Quotas](#resource-quotas)
8. [Migration Strategy](#migration-strategy)
9. [Testing Strategy](#testing-strategy)
10. [Security Considerations](#security-considerations)

---

## Overview

### Goals
- Enable SaaS deployment with complete tenant isolation
- Support 100+ tenants on single deployment
- Maintain current performance characteristics
- Ensure zero cross-tenant data leakage
- Provide tenant self-service capabilities

### Non-Goals (Phase 3)
- White-labeling/custom branding per tenant
- Tenant-specific feature flags (coming in Phase 4)
- Multi-region deployment
- Tenant migration between instances

### Success Metrics
- Support 100+ active tenants
- Tenant provisioning < 5 minutes
- Zero cross-tenant security incidents
- No performance degradation vs. single-tenant

---

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Load Balancer                         │
│              (Subdomain-based routing)                   │
└────────────┬───────────────────────────────────────┬────┘
             │                                        │
   ┌─────────▼─────────┐                 ┌──────────▼─────────┐
   │  tenant1.app.com  │                 │  tenant2.app.com   │
   │  (Tenant Context) │                 │  (Tenant Context)  │
   └─────────┬─────────┘                 └──────────┬─────────┘
             │                                       │
             └────────────┬──────────────────────────┘
                          │
                  ┌───────▼────────┐
                  │   API Gateway   │
                  │ (Tenant Middleware)│
                  └───────┬────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                 │
    ┌────▼─────┐    ┌────▼─────┐    ┌────▼─────┐
    │  FastAPI  │    │  FastAPI  │    │  FastAPI  │
    │ Instance 1│    │ Instance 2│    │ Instance 3│
    └────┬─────┘    └────┬─────┘    └────┬─────┘
         │                │                 │
         └────────────────┼────────────────┘
                          │
              ┌───────────┴───────────┐
              │                        │
        ┌─────▼──────┐        ┌──────▼──────┐
        │ PostgreSQL  │        │   Redis     │
        │  (RLS)      │        │ (Tenant keys)│
        └─────┬──────┘        └─────────────┘
              │
     ┌────────┴────────┐
     │ Tenant Schemas  │
     │  - tenant_1     │
     │  - tenant_2     │
     │  - tenant_3     │
     └─────────────────┘
```

### Components

#### 1. Tenant Context Middleware
- Extracts tenant identifier from request (subdomain or URL path)
- Validates tenant exists and is active
- Injects tenant context into request state
- Sets up database connection with tenant context

#### 2. Database Layer
- PostgreSQL with Row-Level Security
- Per-tenant schemas for critical data
- Shared tables for system data
- Automatic tenant_id filtering

#### 3. Caching Layer
- Redis with tenant-prefixed keys
- Tenant-scoped cache invalidation
- Shared cache for system data

#### 4. Storage Layer
- Tenant-specific S3/GCS prefixes
- Quota enforcement
- Automatic cleanup on tenant deletion

---

## Database Design

### Schema Strategy

**Approach:** Hybrid schema isolation
- **Critical data:** Per-tenant schemas (prompts, API keys, user data)
- **Shared data:** System tables (feature flags, system config)
- **Tenant metadata:** Centralized tenant table

### Tenant Registry Table

```sql
CREATE TABLE public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(63) NOT NULL UNIQUE,  -- Used in subdomain
    name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active, suspended, deleted
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP NULL,
    
    -- Subscription info
    plan VARCHAR(50) NOT NULL DEFAULT 'free',  -- free, starter, professional, enterprise
    billing_email VARCHAR(255),
    
    -- Resource quotas
    max_users INT NOT NULL DEFAULT 5,
    max_prompts INT NOT NULL DEFAULT 100,
    max_api_calls_per_month INT NOT NULL DEFAULT 10000,
    max_storage_gb DECIMAL(10,2) NOT NULL DEFAULT 1.0,
    
    -- Settings
    settings JSONB NOT NULL DEFAULT '{}',
    
    -- Audit
    created_by UUID REFERENCES public.users(id),
    
    CONSTRAINT valid_slug CHECK (slug ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'),
    CONSTRAINT valid_status CHECK (status IN ('active', 'suspended', 'deleted'))
);

CREATE INDEX idx_tenants_slug ON public.tenants(slug);
CREATE INDEX idx_tenants_status ON public.tenants(status);
```

### Per-Tenant Schema Tables

Each tenant gets a schema: `tenant_{tenant_id}`

**Prompts Table:**
```sql
CREATE TABLE tenant_{tenant_id}.prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    category VARCHAR(100),
    tags TEXT[],
    owner VARCHAR(100),
    version VARCHAR(20),
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES tenant_{tenant_id}.users(id),
    
    -- Full-text search
    search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(content, '')), 'C')
    ) STORED
);

CREATE INDEX idx_prompts_search ON tenant_{tenant_id}.prompts USING GIN(search_vector);
CREATE INDEX idx_prompts_category ON tenant_{tenant_id}.prompts(category);
CREATE INDEX idx_prompts_tags ON tenant_{tenant_id}.prompts USING GIN(tags);
```

**Users Table:**
```sql
CREATE TABLE tenant_{tenant_id}.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(20) NOT NULL DEFAULT 'user',  -- admin, user, readonly
    
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMP,
    
    settings JSONB NOT NULL DEFAULT '{}',
    
    CONSTRAINT valid_role CHECK (role IN ('admin', 'user', 'readonly'))
);

CREATE INDEX idx_users_email ON tenant_{tenant_id}.users(email);
CREATE INDEX idx_users_role ON tenant_{tenant_id}.users(role);
```

**API Keys Table:**
```sql
CREATE TABLE tenant_{tenant_id}.api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    provider VARCHAR(50) NOT NULL,  -- openai, anthropic, azure
    key_prefix VARCHAR(20) NOT NULL,  -- First few chars for identification
    encrypted_key TEXT NOT NULL,  -- Encrypted with tenant-specific key
    
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,
    
    created_by UUID REFERENCES tenant_{tenant_id}.users(id),
    
    CONSTRAINT valid_provider CHECK (provider IN ('openai', 'anthropic', 'azure'))
);
```

### Shared Tables

**System Configuration:**
```sql
CREATE TABLE public.system_config (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Feature Flags:**
```sql
CREATE TABLE public.feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Optional: per-plan or per-tenant overrides
    plan_overrides JSONB DEFAULT '{}',
    tenant_overrides JSONB DEFAULT '{}',
    
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Row-Level Security

**Enable RLS on all tenant-scoped tables:**
```sql
ALTER TABLE tenant_{tenant_id}.prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_{tenant_id}.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_{tenant_id}.api_keys ENABLE ROW LEVEL SECURITY;
```

**Create RLS policies:**
```sql
-- Users can only see data in their own tenant
CREATE POLICY tenant_isolation ON tenant_{tenant_id}.prompts
    USING (true)  -- Enforced at connection level
    WITH CHECK (true);

-- System admin can see all data (for support)
CREATE POLICY system_admin_access ON tenant_{tenant_id}.prompts
    TO system_admin
    USING (true)
    WITH CHECK (true);
```

---

## API Changes

### Tenant Context Middleware

```python
# services/prompt-api/middleware/tenant.py

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
import re

class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Extract tenant from subdomain or path
        tenant_slug = self.extract_tenant(request)
        
        if not tenant_slug:
            raise HTTPException(status_code=400, detail="Tenant not specified")
        
        # Load tenant from database
        tenant = await self.get_tenant(tenant_slug)
        
        if not tenant or tenant.status != 'active':
            raise HTTPException(status_code=404, detail="Tenant not found")
        
        # Inject tenant context into request
        request.state.tenant = tenant
        
        # Set database context for RLS
        await self.set_database_context(tenant.id)
        
        response = await call_next(request)
        return response
    
    def extract_tenant(self, request: Request) -> str:
        # Try subdomain first: tenant.app.com
        host = request.headers.get("host", "")
        match = re.match(r'^([a-z0-9-]+)\.', host)
        if match:
            return match.group(1)
        
        # Fallback to path: /t/{tenant}/...
        path_match = re.match(r'^/t/([a-z0-9-]+)/', request.url.path)
        if path_match:
            return path_match.group(1)
        
        return None
```

### Updated API Endpoints

**All existing endpoints automatically tenant-scoped:**
```
GET  /prompts              -> Filtered by tenant
POST /prompts              -> Created in tenant context
GET  /prompts/{id}         -> Only accessible if in tenant
PUT  /prompts/{id}         -> Only editable if in tenant
DELETE /prompts/{id}       -> Only deletable if in tenant
```

**New tenant management endpoints:**
```
POST   /admin/tenants           -> Create new tenant (system admin only)
GET    /admin/tenants           -> List all tenants (system admin only)
GET    /admin/tenants/{id}      -> Get tenant details
PUT    /admin/tenants/{id}      -> Update tenant
DELETE /admin/tenants/{id}      -> Soft delete tenant

GET    /tenant/info             -> Current tenant info
PUT    /tenant/settings         -> Update tenant settings
GET    /tenant/usage            -> Current usage stats
GET    /tenant/quotas           -> Current quota limits
```

---

## Authentication & Authorization

### JWT Token Changes

**Current token payload:**
```json
{
  "sub": "user_id",
  "email": "user@example.com",
  "role": "admin"
}
```

**New token payload (with tenant):**
```json
{
  "sub": "user_id",
  "email": "user@example.com",
  "tenant_id": "tenant_uuid",
  "tenant_slug": "acme-corp",
  "role": "admin",  // Role within tenant
  "system_role": null  // Only set for system admins
}
```

### Role Hierarchy

**Per-Tenant Roles:**
- `admin` - Full access within tenant
- `user` - Standard user access
- `readonly` - Read-only access

**System Roles:**
- `system_admin` - Can access all tenants (for support)
- `billing_admin` - Can manage billing for all tenants

---

## Tenant Management

### Tenant Provisioning Flow

1. **Create Tenant Record**
   - Generate tenant UUID
   - Create slug from name
   - Set default quotas based on plan
   - Set status to 'provisioning'

2. **Create Tenant Schema**
   - Execute: `CREATE SCHEMA tenant_{id}`
   - Create all tables in schema
   - Apply RLS policies
   - Create indexes

3. **Create Default Admin User**
   - Generate secure password
   - Create user in tenant schema
   - Set role to 'admin'
   - Send welcome email with credentials

4. **Activate Tenant**
   - Set status to 'active'
   - Return tenant details

**Target time:** < 5 minutes for full provisioning

### Tenant Deletion Flow

1. **Soft Delete (Default)**
   - Set status to 'deleted'
   - Set deleted_at timestamp
   - Disable all user access
   - Keep data for 30 days (grace period)

2. **Hard Delete (After grace period)**
   - Export tenant data (backup)
   - Drop tenant schema
   - Delete tenant record
   - Remove from caches
   - Delete file storage

---

## Resource Quotas

### Quota Types

```python
# services/prompt-api/models/quotas.py

class TenantQuotas:
    max_users: int
    max_prompts: int
    max_api_calls_per_month: int
    max_storage_gb: float
    max_concurrent_requests: int
    max_file_size_mb: float

# Default quotas by plan
PLAN_QUOTAS = {
    'free': TenantQuotas(
        max_users=5,
        max_prompts=100,
        max_api_calls_per_month=10000,
        max_storage_gb=1.0,
        max_concurrent_requests=5,
        max_file_size_mb=10
    ),
    'starter': TenantQuotas(
        max_users=10,
        max_prompts=500,
        max_api_calls_per_month=50000,
        max_storage_gb=10.0,
        max_concurrent_requests=20,
        max_file_size_mb=50
    ),
    'professional': TenantQuotas(
        max_users=50,
        max_prompts=5000,
        max_api_calls_per_month=500000,
        max_storage_gb=100.0,
        max_concurrent_requests=100,
        max_file_size_mb=100
    ),
    'enterprise': TenantQuotas(
        max_users=None,  # Unlimited
        max_prompts=None,
        max_api_calls_per_month=None,
        max_storage_gb=None,
        max_concurrent_requests=500,
        max_file_size_mb=500
    )
}
```

### Quota Enforcement

```python
# Check before creating resource
async def check_quota(tenant: Tenant, resource_type: str):
    current_usage = await get_current_usage(tenant, resource_type)
    quota = get_quota_for_plan(tenant.plan, resource_type)
    
    if quota is not None and current_usage >= quota:
        raise QuotaExceededError(
            f"Tenant has exceeded {resource_type} quota: {current_usage}/{quota}"
        )
```

---

## Migration Strategy

### Phase 1: Development (Sprint 1)
- Set up PostgreSQL locally
- Create migration scripts
- Test with sample data
- Validate RLS policies

### Phase 2: Staging (Sprint 2)
- Migrate staging environment
- Test with production-like data
- Performance testing
- Security audit

### Phase 3: Production (Sprint 4)
- Schedule maintenance window (4 hours)
- Backup all SQLite data
- Run migration scripts
- Validate data integrity
- Switch to PostgreSQL
- Monitor for 24 hours
- Keep SQLite backup for 7 days

### Rollback Plan
- Keep SQLite databases intact
- Can switch back to SQLite if issues
- Automated health checks every 5 minutes
- Rollback decision within 2 hours

---

## Testing Strategy

### Unit Tests
- Tenant middleware functionality
- RLS policy enforcement
- Quota enforcement logic
- Tenant provisioning/deletion

### Integration Tests
- Multi-tenant API requests
- Cross-tenant isolation
- Cache key isolation
- File storage isolation

### Security Tests
- Attempt cross-tenant data access
- JWT manipulation tests
- Subdomain spoofing tests
- SQL injection with tenant context

### Performance Tests
- 100 tenants, 1000 requests/sec
- Database query performance with RLS
- Cache hit rates with tenant keys
- Memory usage with multiple tenants

### Load Tests
- Gradual ramp: 1 → 100 tenants over 1 hour
- Sustained load: 100 tenants, 500 req/sec for 2 hours
- Spike test: 0 → 100 tenants instantly

---

## Security Considerations

### Defense in Depth

1. **Application Layer**
   - Tenant middleware validates every request
   - JWT tokens include tenant_id
   - All queries include tenant_id filter

2. **Database Layer**
   - Row-Level Security as second barrier
   - Per-tenant schemas for critical data
   - Encrypted API keys

3. **Network Layer**
   - Subdomain isolation
   - Rate limiting per tenant
   - DDoS protection

### Security Audit Checklist

- [ ] No API endpoints bypass tenant middleware
- [ ] All database queries filtered by tenant
- [ ] RLS policies tested and verified
- [ ] JWT tokens properly signed and validated
- [ ] No cross-tenant data in logs
- [ ] No cross-tenant cache pollution
- [ ] File storage paths properly isolated
- [ ] Penetration testing completed
- [ ] Security code review completed
- [ ] Compliance requirements met (GDPR, SOC 2)

---

## Open Questions

1. **Tenant subdomain SSL certificates:**
   - Wildcard cert (*.app.com) or per-tenant?
   - Let's Encrypt automation?

2. **Tenant data retention:**
   - How long to keep deleted tenant data?
   - GDPR right-to-be-forgotten implications?

3. **Cross-tenant admin access:**
   - How do system admins access tenant data for support?
   - Audit logging requirements?

4. **Billing integration:**
   - Stripe integration timeline?
   - Manual billing for Phase 3?

---

## References

- ADR-001: Multi-Tenancy Architecture Approach
- [PostgreSQL Row-Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Multi-Tenant Data Architecture](https://docs.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/overview)

---

**Status:** Ready for architecture review  
**Next Steps:** 
1. Architecture review meeting
2. Get team feedback
3. Create implementation tickets
4. Begin Sprint 1 development
