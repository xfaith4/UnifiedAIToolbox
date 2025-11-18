# ADR-001: Multi-Tenancy Architecture Approach

**Status:** Proposed  
**Date:** 2025-11-18  
**Deciders:** Technical Lead, Backend Team, DevOps Team  
**Tags:** multi-tenancy, architecture, database, security

---

## Context

Phase 3 introduces multi-tenancy to enable SaaS deployment of the Unified AI Toolbox. We need to decide on the architecture approach that balances:
- **Data isolation** for security and compliance
- **Resource efficiency** to minimize costs
- **Scalability** to support 100+ tenants
- **Performance** to maintain current SLAs
- **Operational complexity** to keep maintenance manageable

Current system (Milestone 1.5):
- Single-tenant architecture
- SQLite database per environment
- No tenant concept in API or database
- All users share the same data store

---

## Decision

We will implement a **shared database with row-level security (RLS)** approach using PostgreSQL, combined with **tenant-scoped API contexts**.

**Key Components:**

1. **Database Layer:**
   - Migrate from SQLite to PostgreSQL
   - Add `tenant_id` column to all tenant-specific tables
   - Implement PostgreSQL Row-Level Security policies
   - Use separate schemas per tenant for maximum isolation
   - Shared tables: system config, feature flags, metrics

2. **API Layer:**
   - Add tenant context middleware (extracted from JWT/subdomain)
   - All queries automatically filtered by tenant_id
   - Tenant-scoped caching keys in Redis
   - Admin API for cross-tenant operations

3. **Authentication:**
   - JWT tokens include tenant_id claim
   - Subdomain-based tenant identification (tenant.unified-ai.com)
   - Fallback to tenant slug in URL path (/t/{tenant}/api/...)

4. **Storage:**
   - Tenant-specific file storage paths (S3/GCS prefixes)
   - Shared storage for system resources
   - Per-tenant storage quotas enforced

---

## Consequences

### Positive
- **Cost-effective:** Single database cluster serves all tenants
- **Easy to manage:** One deployment, centralized monitoring
- **Good performance:** Shared resources, connection pooling
- **PostgreSQL RLS:** Built-in security at database level
- **Schema isolation:** Critical data completely separated
- **Scalable:** Can support 100s of tenants on single cluster
- **Cross-tenant analytics:** Possible with admin access
- **Simplified backups:** Single backup process for all data

### Negative
- **Noisy neighbor risk:** One tenant can impact others if not properly limited
- **Migration complexity:** Moving from SQLite to PostgreSQL is significant work
- **Testing complexity:** Need to test cross-tenant isolation thoroughly
- **Query overhead:** Tenant_id filter on every query adds small overhead
- **Schema management:** More complex with per-tenant schemas

### Neutral
- **Different from current architecture:** Requires significant refactoring
- **Requires PostgreSQL expertise:** Team needs to learn PostgreSQL-specific features
- **More moving parts:** Redis, PostgreSQL vs just SQLite

---

## Alternatives Considered

### Alternative 1: Database Per Tenant
**Approach:** Each tenant gets their own PostgreSQL database

**Pros:**
- Complete data isolation
- No cross-tenant performance impact
- Easy to backup/restore individual tenants
- Can scale individual tenants independently

**Cons:**
- Higher operational complexity (100+ databases to manage)
- Expensive: Need connection pool per database
- Harder to do cross-tenant analytics
- Schema migrations complex (need to run on all databases)
- Resource overhead (100+ database instances)

**Why not chosen:** Operational complexity and cost outweigh benefits for our scale

### Alternative 2: Separate Deployment Per Tenant
**Approach:** Each tenant gets their own complete infrastructure stack

**Pros:**
- Complete isolation (network, compute, storage)
- Can customize per tenant
- Ultimate security and compliance
- Easy to scale individual tenants

**Cons:**
- Extremely expensive at scale
- Very high operational overhead
- Difficult to maintain consistency
- Slow tenant provisioning (need to deploy entire stack)
- Not suitable for small-medium tenants

**Why not chosen:** Too expensive and complex for Phase 3. May revisit for enterprise tier in Phase 4

### Alternative 3: Shared Database without RLS
**Approach:** Single database with application-level filtering only

**Pros:**
- Simplest to implement
- Best performance (no RLS overhead)
- Easy to understand

**Cons:**
- Security risk: Application bug could leak cross-tenant data
- No defense in depth
- Harder to audit
- Compliance concerns

**Why not chosen:** Security risk too high for production SaaS deployment

---

## Implementation Notes

### Phase 1: Database Migration (Sprint 1-2)
1. Set up PostgreSQL development environment
2. Create migration scripts from SQLite to PostgreSQL
3. Add tenant_id columns to all tables
4. Create PostgreSQL schemas per tenant
5. Implement RLS policies
6. Test data migration with production-like data

### Phase 2: API Layer (Sprint 2-3)
1. Create tenant middleware for API
2. Update all database queries to be tenant-scoped
3. Add tenant context to authentication
4. Implement subdomain routing
5. Add tenant management API endpoints

### Phase 3: Testing & Validation (Sprint 3-4)
1. Write comprehensive tenant isolation tests
2. Perform security audit of tenant boundaries
3. Load test with multiple tenants
4. Verify no cross-tenant data leakage
5. Test tenant creation/deletion workflows

### Migration Path
- **Phase 3 Sprint 1-2:** Development/staging environments
- **Sprint 3:** Customer UAT environment
- **Sprint 4:** Production deployment with migration window
- **Rollback plan:** Keep SQLite working in parallel for first 2 sprints

### Dependencies
- PostgreSQL 15+ (for improved RLS performance)
- Connection pooling (PgBouncer or similar)
- Redis for tenant-scoped caching
- Database migration tool (Alembic)

---

## Related Decisions

- ADR-002: PostgreSQL vs MySQL (to be written)
- ADR-003: Tenant identification strategy (to be written)
- ADR-004: Data retention and tenant deletion (to be written)

---

## References

- [PostgreSQL Row-Level Security Documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Multi-Tenancy Architecture Patterns](https://docs.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/overview)
- [Shared Database vs Database Per Tenant](https://www.codeproject.com/Articles/5295341/Multi-Tenant-Architecture-for-SaaS-Applications)
- Phase 3 Planning: Stream 1 (Multi-Tenancy & SaaS Ready)
