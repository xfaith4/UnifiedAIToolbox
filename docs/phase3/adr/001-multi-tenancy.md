# ADR-001: Multi-Tenancy Architecture Approach

**ADR Number**: 001  
**Title**: Multi-Tenancy Architecture Approach  
**Status**: Proposed  
**Date**: 2025-11-29

---

## Context

The Unified AI Toolbox v2.0 needs to support multiple organizations (tenants) on a single deployment. Each tenant must have:

- Isolated data (prompts, agents, settings)
- Independent user management
- Configurable resource quotas
- Billing separation

We need to decide on the technical approach for implementing multi-tenancy.

## Decision Drivers

- **Data Isolation**: Tenants must not access each other's data
- **Cost Efficiency**: Single deployment should serve multiple tenants
- **Scalability**: Solution must scale to 100+ tenants
- **Complexity**: Implementation should be maintainable
- **Migration**: Must support migration from current single-tenant model
- **Performance**: Minimal overhead for tenant context

## Considered Options

### Option 1: Separate Databases per Tenant

**Description**: Each tenant gets their own database instance.

**Pros**:
- Complete data isolation
- Easy per-tenant backup/restore
- Simple tenant deletion

**Cons**:
- High operational overhead
- Database connection pooling complexity
- Difficult to query across tenants
- Higher infrastructure cost

### Option 2: Shared Database with Schema Separation

**Description**: Single database with separate schema per tenant.

**Pros**:
- Good isolation within single database
- Easier management than separate databases
- Native PostgreSQL support

**Cons**:
- Schema migration complexity
- Still requires per-tenant schema management
- Connection routing complexity

### Option 3: Shared Database with Row-Level Security (RLS)

**Description**: Single database and schema with PostgreSQL RLS policies for tenant isolation.

**Pros**:
- Single schema to maintain
- Built-in PostgreSQL security
- Efficient connection pooling
- Simpler migration path
- Cross-tenant analytics possible (admin only)

**Cons**:
- Requires PostgreSQL (no SQLite)
- RLS policy maintenance
- Must ensure tenant context is always set
- Potential for misconfiguration

### Option 4: Application-Level Isolation

**Description**: Single database with tenant filtering done entirely in application code.

**Pros**:
- Database agnostic
- Simple implementation

**Cons**:
- Security relies on application code
- Easy to introduce bugs
- No database-level protection
- Higher risk of data leakage

## Decision

**We will use Option 3: Shared Database with Row-Level Security (RLS).**

This approach provides the best balance of:
- Strong security (database-enforced)
- Operational efficiency (single schema)
- Migration simplicity (add tenant_id to tables)
- Performance (efficient queries with proper indexing)

## Implementation Approach

### 1. Database Changes

```sql
-- Add tenant_id to all tables
ALTER TABLE prompts ADD COLUMN tenant_id UUID NOT NULL;
ALTER TABLE agents ADD COLUMN tenant_id UUID NOT NULL;
ALTER TABLE users ADD COLUMN tenant_id UUID NOT NULL;

-- Create index for performance
CREATE INDEX idx_prompts_tenant ON prompts(tenant_id);

-- Enable RLS
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY tenant_isolation ON prompts
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

### 2. Tenant Context

```python
# Middleware to set tenant context
async def tenant_context_middleware(request: Request, call_next):
    tenant_id = extract_tenant_from_request(request)
    if tenant_id:
        async with db.connection() as conn:
            await conn.execute(
                "SET app.current_tenant = $1", tenant_id
            )
    response = await call_next(request)
    return response
```

### 3. Tenant Identification

- **Primary**: Subdomain (tenant.app.example.com)
- **Fallback**: Header (X-Tenant-ID)
- **API**: Extracted from JWT claims

## Consequences

### Positive

- Strong data isolation enforced at database level
- Single codebase and schema to maintain
- Efficient resource utilization
- Clear audit trail per tenant
- Supports future cross-tenant analytics

### Negative

- Requires migration from SQLite to PostgreSQL
- RLS policies need careful testing
- Must ensure tenant context is set for all queries
- Slightly more complex connection handling

### Neutral

- Team needs to learn PostgreSQL RLS
- Existing tests need tenant context updates

## Migration Path

1. **Phase 1**: Add tenant_id column (nullable)
2. **Phase 2**: Populate tenant_id for existing data (default tenant)
3. **Phase 3**: Make tenant_id required
4. **Phase 4**: Enable RLS policies
5. **Phase 5**: Add tenant management APIs

## Testing Strategy

```python
def test_tenant_isolation():
    """Verify tenants cannot access each other's data."""
    # Create prompts for tenant A
    prompt_a = create_prompt(tenant_id="tenant-a", title="A's prompt")
    
    # Create prompts for tenant B
    prompt_b = create_prompt(tenant_id="tenant-b", title="B's prompt")
    
    # Query as tenant A - should only see A's prompts
    with tenant_context("tenant-a"):
        prompts = list_prompts()
        assert len(prompts) == 1
        assert prompts[0].title == "A's prompt"
    
    # Query as tenant B - should only see B's prompts
    with tenant_context("tenant-b"):
        prompts = list_prompts()
        assert len(prompts) == 1
        assert prompts[0].title == "B's prompt"
```

## Related ADRs

- ADR-002: Database Migration Strategy (planned)
- ADR-003: Authentication Updates (planned)

## References

- [PostgreSQL Row-Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Multi-Tenancy Patterns](https://docs.microsoft.com/en-us/azure/architecture/patterns/multi-tenancy)

---

**Author**: Technical Lead  
**Reviewers**: Backend Team, Security Team  
**Approved By**: [Pending]  
**Approved Date**: [Pending]
