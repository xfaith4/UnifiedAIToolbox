# API v2.0 Specification
## Unified AI Toolbox - Phase 3 Multi-Tenancy

**Status:** Draft  
**Owner:** API Team  
**Last Updated:** December 2025  
**Version:** 2.0.0

---

## Overview

This document specifies the changes to the Unified AI Toolbox API for v2.0, primarily focused on multi-tenancy support, enhanced authentication, and new tenant management endpoints.

## Breaking Changes from v1.5

### 1. Tenant Context Required

All API requests (except authentication and public endpoints) now require tenant context:

**v1.5 (Single-Tenant):**
```http
GET /api/prompts
Authorization: Bearer <token>
```

**v2.0 (Multi-Tenant):**
```http
GET /api/prompts
Authorization: Bearer <token>
X-Tenant-ID: tenant-slug-or-id
```

### 2. JWT Token Changes

**v1.5 Token Payload:**
```json
{
  "sub": "user-id",
  "email": "user@example.com",
  "role": "user",
  "exp": 1234567890
}
```

**v2.0 Token Payload:**
```json
{
  "sub": "user-id",
  "email": "user@example.com",
  "tenant_id": "tenant-uuid",
  "tenant_slug": "acme-corp",
  "role": "user",
  "plan": "professional",
  "exp": 1234567890
}
```

### 3. Response Changes

All responses now include `tenant_id` field:

**v1.5 Response:**
```json
{
  "id": "prompt-123",
  "title": "My Prompt",
  "content": "..."
}
```

**v2.0 Response:**
```json
{
  "id": "prompt-123",
  "tenant_id": "tenant-uuid",
  "title": "My Prompt",
  "content": "..."
}
```

---

## Tenant Identification Methods

### 1. Subdomain (Primary)

```
https://acme-corp.unified-toolbox.com/api/prompts
```

Tenant extracted from subdomain `acme-corp`.

### 2. URL Path (Alternative)

```
https://unified-toolbox.com/t/acme-corp/api/prompts
```

Tenant extracted from path prefix `/t/acme-corp`.

### 3. Header (Fallback)

```http
GET /api/prompts
X-Tenant-ID: acme-corp
Authorization: Bearer <token>
```

Tenant extracted from `X-Tenant-ID` header.

### Priority Order

1. Subdomain
2. URL path
3. Header
4. JWT token claim

---

## New Endpoints

### Tenant Management

#### Create Tenant

```http
POST /api/v2/tenants
Content-Type: application/json
Authorization: Bearer <platform-admin-token>

{
  "slug": "acme-corp",
  "name": "Acme Corporation",
  "billing_email": "billing@acme.com",
  "plan": "professional"
}
```

**Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "slug": "acme-corp",
  "name": "Acme Corporation",
  "billing_email": "billing@acme.com",
  "plan": "professional",
  "status": "active",
  "created_at": "2025-12-22T00:00:00Z",
  "settings": {}
}
```

#### Get Tenant

```http
GET /api/v2/tenants/{tenant_id}
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "slug": "acme-corp",
  "name": "Acme Corporation",
  "billing_email": "billing@acme.com",
  "plan": "professional",
  "status": "active",
  "created_at": "2025-12-22T00:00:00Z",
  "updated_at": "2025-12-22T00:00:00Z",
  "settings": {
    "features": {
      "semantic_search": true,
      "advanced_analytics": false
    }
  },
  "quota": {
    "max_users": 50,
    "max_prompts": 5000,
    "max_api_calls_month": 500000,
    "max_storage_gb": 100.0
  },
  "usage": {
    "users": 12,
    "prompts": 234,
    "api_calls_month": 45678,
    "storage_gb": 2.5
  }
}
```

#### Update Tenant

```http
PATCH /api/v2/tenants/{tenant_id}
Content-Type: application/json
Authorization: Bearer <tenant-admin-token>

{
  "name": "Acme Corp",
  "billing_email": "finance@acme.com",
  "settings": {
    "features": {
      "semantic_search": true
    }
  }
}
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "slug": "acme-corp",
  "name": "Acme Corp",
  "billing_email": "finance@acme.com",
  "plan": "professional",
  "status": "active",
  "updated_at": "2025-12-22T01:00:00Z"
}
```

#### List Tenants (Platform Admin Only)

```http
GET /api/v2/tenants?page=1&per_page=20&status=active
Authorization: Bearer <platform-admin-token>
```

**Response (200 OK):**
```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "slug": "acme-corp",
      "name": "Acme Corporation",
      "plan": "professional",
      "status": "active",
      "created_at": "2025-12-22T00:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "per_page": 20,
  "pages": 1
}
```

#### Suspend Tenant (Platform Admin Only)

```http
POST /api/v2/tenants/{tenant_id}/suspend
Authorization: Bearer <platform-admin-token>

{
  "reason": "Payment overdue"
}
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "suspended",
  "suspended_at": "2025-12-22T02:00:00Z",
  "suspend_reason": "Payment overdue"
}
```

### Quota Management

#### Get Tenant Quotas

```http
GET /api/v2/tenants/{tenant_id}/quotas
Authorization: Bearer <token>
```

**Response (200 OK):**
```json
{
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "plan": "professional",
  "limits": {
    "max_users": 50,
    "max_prompts": 5000,
    "max_api_calls_month": 500000,
    "max_storage_gb": 100.0,
    "max_concurrent_requests": 100
  },
  "usage": {
    "users": 12,
    "prompts": 234,
    "api_calls_month": 45678,
    "storage_gb": 2.5,
    "concurrent_requests": 5
  },
  "remaining": {
    "users": 38,
    "prompts": 4766,
    "api_calls_month": 454322,
    "storage_gb": 97.5,
    "concurrent_requests": 95
  },
  "period": {
    "start": "2025-12-01T00:00:00Z",
    "end": "2026-01-01T00:00:00Z"
  }
}
```

#### Update Tenant Quotas (Platform Admin Only)

```http
PATCH /api/v2/tenants/{tenant_id}/quotas
Content-Type: application/json
Authorization: Bearer <platform-admin-token>

{
  "max_users": 100,
  "max_prompts": 10000
}
```

---

## Modified Endpoints

### Authentication

#### Login

**Endpoint:** `POST /api/v2/auth/login`

**Request:**
```json
{
  "email": "user@acme.com",
  "password": "secure-password",
  "tenant_slug": "acme-corp"
}
```

**Response (200 OK):**
```json
{
  "access_token": "eyJhbGc...",
  "refresh_token": "eyJhbGc...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "user": {
    "id": "user-uuid",
    "email": "user@acme.com",
    "tenant_id": "tenant-uuid",
    "tenant_slug": "acme-corp",
    "role": "user"
  }
}
```

#### Register

**Endpoint:** `POST /api/v2/auth/register`

**Request:**
```json
{
  "email": "newuser@acme.com",
  "password": "secure-password",
  "tenant_slug": "acme-corp",
  "invite_code": "abc123"
}
```

**Response (201 Created):**
```json
{
  "id": "user-uuid",
  "email": "newuser@acme.com",
  "tenant_id": "tenant-uuid",
  "tenant_slug": "acme-corp",
  "role": "user",
  "created_at": "2025-12-22T00:00:00Z"
}
```

### Prompts

All prompt endpoints now automatically filter by tenant context.

#### List Prompts

**Endpoint:** `GET /api/v2/prompts`

```http
GET /api/v2/prompts?page=1&per_page=20
Authorization: Bearer <token>
X-Tenant-ID: acme-corp
```

**Response (200 OK):**
```json
{
  "items": [
    {
      "id": "prompt-uuid",
      "tenant_id": "tenant-uuid",
      "title": "Code Review Prompt",
      "description": "Prompt for code reviews",
      "content": "Review this code...",
      "tags": ["code", "review"],
      "created_by": "user-uuid",
      "created_at": "2025-12-22T00:00:00Z",
      "updated_at": "2025-12-22T00:00:00Z"
    }
  ],
  "total": 234,
  "page": 1,
  "per_page": 20,
  "pages": 12
}
```

#### Create Prompt

**Endpoint:** `POST /api/v2/prompts`

**Request:**
```json
{
  "title": "New Prompt",
  "description": "Description",
  "content": "Prompt content...",
  "tags": ["tag1", "tag2"]
}
```

**Response (201 Created):**
```json
{
  "id": "prompt-uuid",
  "tenant_id": "tenant-uuid",
  "title": "New Prompt",
  "description": "Description",
  "content": "Prompt content...",
  "tags": ["tag1", "tag2"],
  "created_by": "user-uuid",
  "created_at": "2025-12-22T00:00:00Z"
}
```

**Note:** `tenant_id` is automatically set from request context.

### Users

#### List Users (Tenant Scope)

**Endpoint:** `GET /api/v2/users`

```http
GET /api/v2/users?role=user
Authorization: Bearer <tenant-admin-token>
X-Tenant-ID: acme-corp
```

**Response (200 OK):**
```json
{
  "items": [
    {
      "id": "user-uuid",
      "email": "user@acme.com",
      "tenant_id": "tenant-uuid",
      "role": "user",
      "status": "active",
      "created_at": "2025-12-22T00:00:00Z"
    }
  ],
  "total": 12,
  "page": 1,
  "per_page": 20
}
```

#### Invite User

**Endpoint:** `POST /api/v2/users/invite`

**Request:**
```json
{
  "email": "newuser@acme.com",
  "role": "user",
  "message": "Welcome to our team!"
}
```

**Response (201 Created):**
```json
{
  "invite_id": "invite-uuid",
  "email": "newuser@acme.com",
  "tenant_id": "tenant-uuid",
  "role": "user",
  "invite_code": "abc123def456",
  "expires_at": "2025-12-29T00:00:00Z",
  "created_at": "2025-12-22T00:00:00Z"
}
```

---

## Error Responses

### New Error Codes

#### 400 Bad Request - Missing Tenant Context

```json
{
  "error": "missing_tenant_context",
  "message": "Tenant context is required for this endpoint",
  "details": "Provide tenant via subdomain, URL path, or X-Tenant-ID header"
}
```

#### 403 Forbidden - Quota Exceeded

```json
{
  "error": "quota_exceeded",
  "message": "Tenant quota exceeded",
  "quota": "max_prompts",
  "limit": 5000,
  "current": 5000,
  "details": "Upgrade your plan to create more prompts"
}
```

#### 403 Forbidden - Tenant Suspended

```json
{
  "error": "tenant_suspended",
  "message": "Tenant account is suspended",
  "tenant_id": "tenant-uuid",
  "reason": "Payment overdue",
  "details": "Contact support to reactivate your account"
}
```

#### 403 Forbidden - Cross-Tenant Access

```json
{
  "error": "cross_tenant_access",
  "message": "Cannot access resources from another tenant",
  "requested_tenant": "tenant-a",
  "user_tenant": "tenant-b"
}
```

---

## Rate Limiting

### Per-Tenant Rate Limits

Rate limits are enforced per tenant based on plan:

| Plan | Requests/Minute | Burst |
|------|----------------|-------|
| Free | 60 | 120 |
| Starter | 120 | 240 |
| Professional | 600 | 1200 |
| Enterprise | 3000 | 6000 |

**Rate Limit Headers:**
```http
X-RateLimit-Limit: 600
X-RateLimit-Remaining: 599
X-RateLimit-Reset: 1234567890
X-RateLimit-Tenant: acme-corp
```

**Rate Limit Exceeded (429):**
```json
{
  "error": "rate_limit_exceeded",
  "message": "Too many requests",
  "limit": 600,
  "reset_at": "2025-12-22T00:01:00Z",
  "retry_after": 60
}
```

---

## Authentication & Authorization

### JWT Token Generation

```python
from datetime import datetime, timedelta
import jwt

def create_access_token(user, tenant):
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "tenant_id": str(tenant.id),
        "tenant_slug": tenant.slug,
        "role": user.role,
        "plan": tenant.plan,
        "exp": datetime.utcnow() + timedelta(hours=1)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")
```

### Tenant Context Middleware

```python
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware

class TenantContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Extract tenant from subdomain, path, or header
        tenant_slug = extract_tenant(request)
        
        if not tenant_slug and not is_public_endpoint(request.url.path):
            raise HTTPException(400, "Missing tenant context")
        
        # Resolve tenant and set context
        tenant = await get_tenant_by_slug(tenant_slug)
        if not tenant:
            raise HTTPException(404, "Tenant not found")
        
        if tenant.status == "suspended":
            raise HTTPException(403, "Tenant suspended")
        
        # Set PostgreSQL session variable for RLS
        await db.execute(
            "SET app.current_tenant = :tenant_id",
            {"tenant_id": str(tenant.id)}
        )
        
        # Add tenant to request state
        request.state.tenant = tenant
        
        response = await call_next(request)
        return response
```

---

## Migration Guide for API Clients

### Updating Client Code

**v1.5 Client:**
```javascript
const response = await fetch('https://api.unified-toolbox.com/api/prompts', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

**v2.0 Client:**
```javascript
const response = await fetch('https://acme-corp.unified-toolbox.com/api/prompts', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'X-Tenant-ID': 'acme-corp'  // Optional if using subdomain
  }
});
```

### SDK Updates

**Python SDK v2.0:**
```python
from unified_toolbox import Client

# Initialize with tenant
client = Client(
    api_key="your-api-key",
    tenant_slug="acme-corp"
)

# All requests automatically include tenant context
prompts = client.prompts.list()
```

**JavaScript SDK v2.0:**
```javascript
import { UnifiedToolbox } from '@unified-toolbox/sdk';

const client = new UnifiedToolbox({
  apiKey: 'your-api-key',
  tenantSlug: 'acme-corp'
});

const prompts = await client.prompts.list();
```

---

## Backward Compatibility

### v1.5 Endpoints (Deprecated)

Old v1.5 endpoints remain available for 6 months:

```
/api/prompts  →  /api/v2/prompts (with default tenant)
/api/agents   →  /api/v2/agents (with default tenant)
/api/users    →  /api/v2/users (with default tenant)
```

**Deprecation Warning Header:**
```http
X-API-Deprecated: true
X-API-Deprecated-Endpoint: /api/prompts
X-API-Deprecated-Replacement: /api/v2/prompts
X-API-Deprecated-Sunset: 2026-06-22T00:00:00Z
```

### Default Tenant Behavior

If tenant context is not provided, requests use "default" tenant for backward compatibility.

**Warning:** This behavior is deprecated and will be removed in v2.1.

---

## API Versioning Strategy

### Version Header

```http
GET /api/v2/prompts
Accept: application/vnd.unified-toolbox.v2+json
```

### URL-Based Versioning

```
/api/v1/prompts  (deprecated)
/api/v2/prompts  (current)
/api/v3/prompts  (future)
```

---

## OpenAPI Specification

Full OpenAPI 3.0 specification available at:
```
https://api.unified-toolbox.com/openapi.json
```

Interactive documentation:
```
https://api.unified-toolbox.com/docs
```

---

## Testing

### Integration Tests

```python
import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_tenant_isolation():
    """Test that tenants cannot access each other's data."""
    async with AsyncClient() as client:
        # Create prompt as tenant A
        response_a = await client.post(
            "https://tenant-a.example.com/api/v2/prompts",
            headers={"Authorization": f"Bearer {token_a}"},
            json={"title": "Tenant A Prompt"}
        )
        assert response_a.status_code == 201
        
        # Try to access as tenant B
        response_b = await client.get(
            "https://tenant-b.example.com/api/v2/prompts",
            headers={"Authorization": f"Bearer {token_b}"}
        )
        prompts = response_b.json()["items"]
        
        # Should not see tenant A's prompts
        assert len([p for p in prompts if p["title"] == "Tenant A Prompt"]) == 0
```

---

## Performance Considerations

### Caching Strategy

```python
# Cache tenant configuration
@cache(ttl=3600, key="tenant:{tenant_slug}")
async def get_tenant(tenant_slug: str):
    return await db.query(Tenant).filter_by(slug=tenant_slug).first()

# Cache quota data
@cache(ttl=300, key="tenant:{tenant_id}:quota")
async def get_tenant_quota(tenant_id: str):
    return await calculate_quota_usage(tenant_id)
```

### Database Query Optimization

```sql
-- Ensure tenant_id is always first in WHERE clause for index usage
SELECT * FROM prompts 
WHERE tenant_id = $1 
  AND created_at > $2
ORDER BY created_at DESC
LIMIT 20;

-- Use covering index for common queries
CREATE INDEX idx_prompts_tenant_created 
ON prompts (tenant_id, created_at DESC) 
INCLUDE (title, description);
```

---

## Security Considerations

### Input Validation

- Validate tenant_slug format: `^[a-z0-9-]+$`
- Maximum length: 50 characters
- Reserved slugs: `api`, `www`, `admin`, `app`, `docs`

### Rate Limiting Implementation

```python
from fastapi import Request
from fastapi_limiter.depends import RateLimiter

@app.get("/api/v2/prompts")
@limiter.limit(get_rate_limit)
async def list_prompts(request: Request):
    tenant = request.state.tenant
    # Rate limit based on tenant plan
    return await prompt_service.list(tenant.id)

def get_rate_limit(request: Request) -> str:
    tenant = request.state.tenant
    limits = {
        "free": "60/minute",
        "starter": "120/minute",
        "professional": "600/minute",
        "enterprise": "3000/minute"
    }
    return limits.get(tenant.plan, "60/minute")
```

---

## Support & Contact

- **API Documentation:** https://docs.unified-toolbox.com/api/v2
- **Support:** api-support@unified-toolbox.com
- **GitHub Issues:** https://github.com/unified-toolbox/api/issues

---

**Document Version:** 2.0.0  
**Last Updated:** December 2025  
**Next Review:** March 2026
