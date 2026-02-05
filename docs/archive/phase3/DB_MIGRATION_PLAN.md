# Database Migration Plan: SQLite to PostgreSQL
## Unified AI Toolbox v2.0 - Phase 3

**Status:** Draft  
**Owner:** Backend Team  
**Last Updated:** December 2025  
**Version:** 1.0

---

## Executive Summary

This document outlines the migration strategy from SQLite to PostgreSQL for the Unified AI Toolbox v2.0. The migration is required to support multi-tenancy, improved performance, and production-scale deployments.

## Migration Objectives

### Primary Goals
- ✅ Migrate all data from SQLite to PostgreSQL with zero data loss
- ✅ Implement multi-tenancy support with Row-Level Security (RLS)
- ✅ Minimize downtime during migration (target: < 1 hour)
- ✅ Maintain backward compatibility during transition period
- ✅ Establish PostgreSQL as primary database for Phase 3+

### Success Criteria
- All data successfully migrated and validated
- RLS policies enforced on all tenant-scoped tables
- Application functions correctly with PostgreSQL
- Performance equal to or better than SQLite
- Rollback plan tested and ready

---

## Current State Analysis

### SQLite Database Structure

**Current Databases:**
1. **prompts.db** - Main application database
   - prompts (templates, versions)
   - agents (definitions, configurations)
   - runs (execution history)
   - audit_logs (activity tracking)
   
2. **auth.db** - Authentication database
   - users
   - sessions
   - api_keys
   
3. **audit.db** - Audit trail database
   - request_logs
   - action_logs

**Total Data Volume (Estimated):**
- Prompts: ~500 records, ~5 MB
- Agents: ~50 records, ~500 KB
- Users: ~20 records, ~100 KB
- Audit logs: ~10,000 records, ~50 MB
- **Total:** ~55 MB

### Limitations of Current Setup
- ❌ No native multi-tenancy support
- ❌ Limited concurrent write performance
- ❌ No connection pooling
- ❌ Limited full-text search capabilities
- ❌ No row-level security
- ❌ Single-file bottleneck for backups

---

## Target PostgreSQL Schema

### Database Consolidation
Consolidate 3 SQLite databases into 1 PostgreSQL database with proper schemas:

```
unified_dev (database)
├── public (schema) - Core application tables
├── auth (schema) - Authentication tables
└── audit (schema) - Audit trail tables
```

### Schema Additions for Multi-Tenancy

**New Table: tenants**
```sql
CREATE TABLE public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    plan VARCHAR(50) NOT NULL DEFAULT 'free',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    billing_email VARCHAR(255),
    settings JSONB DEFAULT '{}'::jsonb,
    
    CONSTRAINT valid_slug CHECK (slug ~ '^[a-z0-9-]+$'),
    CONSTRAINT valid_plan CHECK (plan IN ('free', 'starter', 'professional', 'enterprise')),
    CONSTRAINT valid_status CHECK (status IN ('active', 'suspended', 'inactive'))
);

CREATE INDEX idx_tenants_slug ON public.tenants(slug);
CREATE INDEX idx_tenants_status ON public.tenants(status);
```

**Modified Tables: Add tenant_id**
```sql
-- Add tenant_id to all existing tables
ALTER TABLE public.prompts 
    ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE public.agents 
    ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE public.runs 
    ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE auth.users 
    ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE auth.api_keys 
    ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE audit.request_logs 
    ADD COLUMN tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX idx_prompts_tenant ON public.prompts(tenant_id);
CREATE INDEX idx_agents_tenant ON public.agents(tenant_id);
CREATE INDEX idx_runs_tenant ON public.runs(tenant_id);
CREATE INDEX idx_users_tenant ON auth.users(tenant_id);
CREATE INDEX idx_api_keys_tenant ON auth.api_keys(tenant_id);
CREATE INDEX idx_request_logs_tenant ON audit.request_logs(tenant_id);
```

### Row-Level Security Policies

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.request_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY tenant_isolation_prompts ON public.prompts
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_agents ON public.agents
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_runs ON public.runs
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_users ON auth.users
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_api_keys ON auth.api_keys
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE POLICY tenant_isolation_request_logs ON audit.request_logs
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Platform admin bypass (optional - use with caution)
CREATE POLICY platform_admin_bypass_prompts ON public.prompts
    USING (current_setting('app.user_role', true) = 'platform_admin');
```

---

## Migration Strategy

### Phase 0: Preparation (Week -1)

**Tasks:**
- [x] Document current schema
- [x] Set up PostgreSQL development environment
- [ ] Create migration scripts
- [ ] Set up test PostgreSQL instance
- [ ] Create data validation scripts
- [ ] Establish backup procedures

**Deliverables:**
- Migration scripts in `scripts/migrations/`
- Test environment ready
- Validation checklist

### Phase 1: Schema Creation (Week 0, Day 1)

**Tasks:**
1. Create PostgreSQL database
   ```bash
   createdb -U unified_user unified_dev
   ```

2. Run schema creation scripts
   ```bash
   psql -U unified_user -d unified_dev -f scripts/migrations/001-create-schemas.sql
   psql -U unified_user -d unified_dev -f scripts/migrations/002-create-tables.sql
   psql -U unified_user -d unified_dev -f scripts/migrations/003-create-indexes.sql
   ```

3. Verify schema
   ```bash
   psql -U unified_user -d unified_dev -f scripts/migrations/validate-schema.sql
   ```

**Rollback:** Drop database and recreate

### Phase 2: Default Tenant Setup (Week 0, Day 1)

**Tasks:**
1. Create default tenant for existing data
   ```sql
   INSERT INTO public.tenants (id, slug, name, plan, status)
   VALUES (
       'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
       'default',
       'Default Tenant',
       'enterprise',
       'active'
   );
   ```

2. Verify tenant creation
   ```sql
   SELECT * FROM public.tenants WHERE slug = 'default';
   ```

**Rollback:** Delete tenant record

### Phase 3: Data Migration (Week 0, Day 2-3)

**Migration Script:**
```python
#!/usr/bin/env python3
"""
Migration script: SQLite to PostgreSQL
"""
import sqlite3
import psycopg2
from psycopg2.extras import execute_batch
from datetime import datetime
import sys

DEFAULT_TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

def migrate_table(sqlite_conn, pg_conn, table_name, schema='public'):
    """Migrate a single table from SQLite to PostgreSQL."""
    print(f"Migrating {schema}.{table_name}...")
    
    # Get SQLite data
    sqlite_cur = sqlite_conn.cursor()
    sqlite_cur.execute(f"SELECT * FROM {table_name}")
    rows = sqlite_cur.fetchall()
    columns = [desc[0] for desc in sqlite_cur.description]
    
    if not rows:
        print(f"  No data in {table_name}")
        return 0
    
    # Add tenant_id to columns and values
    columns.append('tenant_id')
    
    # Prepare PostgreSQL insert
    pg_cur = pg_conn.cursor()
    placeholders = ','.join(['%s'] * len(columns))
    insert_sql = f"""
        INSERT INTO {schema}.{table_name} ({','.join(columns)})
        VALUES ({placeholders})
    """
    
    # Add tenant_id to each row
    rows_with_tenant = [tuple(row) + (DEFAULT_TENANT_ID,) for row in rows]
    
    # Batch insert
    execute_batch(pg_cur, insert_sql, rows_with_tenant, page_size=100)
    pg_conn.commit()
    
    print(f"  Migrated {len(rows)} rows")
    return len(rows)

def main():
    # Connect to SQLite
    sqlite_prompts = sqlite3.connect('./data/sqlite/prompts.db')
    sqlite_auth = sqlite3.connect('./data/sqlite/auth.db')
    sqlite_audit = sqlite3.connect('./data/sqlite/audit.db')
    
    # Connect to PostgreSQL
    pg_conn = psycopg2.connect(
        host='localhost',
        port=5432,
        database='unified_dev',
        user='unified_user',
        password='unified_dev'
    )
    
    try:
        # Migrate prompts.db tables
        migrate_table(sqlite_prompts, pg_conn, 'prompts', 'public')
        migrate_table(sqlite_prompts, pg_conn, 'agents', 'public')
        migrate_table(sqlite_prompts, pg_conn, 'runs', 'public')
        migrate_table(sqlite_prompts, pg_conn, 'audit_logs', 'audit')
        
        # Migrate auth.db tables
        migrate_table(sqlite_auth, pg_conn, 'users', 'auth')
        migrate_table(sqlite_auth, pg_conn, 'sessions', 'auth')
        migrate_table(sqlite_auth, pg_conn, 'api_keys', 'auth')
        
        # Migrate audit.db tables
        migrate_table(sqlite_audit, pg_conn, 'request_logs', 'audit')
        migrate_table(sqlite_audit, pg_conn, 'action_logs', 'audit')
        
        print("\n✅ Migration completed successfully!")
        
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        pg_conn.rollback()
        sys.exit(1)
    
    finally:
        sqlite_prompts.close()
        sqlite_auth.close()
        sqlite_audit.close()
        pg_conn.close()

if __name__ == '__main__':
    main()
```

**Execution:**
```bash
python scripts/migrations/migrate-sqlite-to-postgres.py
```

**Validation:**
```sql
-- Verify row counts match
SELECT 'prompts' as table_name, COUNT(*) as count FROM public.prompts
UNION ALL
SELECT 'agents', COUNT(*) FROM public.agents
UNION ALL
SELECT 'users', COUNT(*) FROM auth.users
UNION ALL
SELECT 'audit_logs', COUNT(*) FROM audit.request_logs;
```

**Rollback:** Truncate all tables, re-run migration

### Phase 4: Constraint Enforcement (Week 0, Day 4)

**Tasks:**
1. Make tenant_id NOT NULL
   ```sql
   ALTER TABLE public.prompts ALTER COLUMN tenant_id SET NOT NULL;
   ALTER TABLE public.agents ALTER COLUMN tenant_id SET NOT NULL;
   -- ... repeat for all tables
   ```

2. Add unique constraints where appropriate
   ```sql
   -- Email must be unique per tenant
   ALTER TABLE auth.users 
       ADD CONSTRAINT unique_email_per_tenant 
       UNIQUE (tenant_id, email);
   ```

**Rollback:** Drop constraints

### Phase 5: Enable RLS (Week 0, Day 5)

**Tasks:**
1. Enable RLS on all tables (see schema section above)
2. Test RLS policies
   ```sql
   -- Test as tenant 'default'
   SET app.current_tenant = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
   SELECT COUNT(*) FROM public.prompts;  -- Should return all records
   
   -- Test as non-existent tenant
   SET app.current_tenant = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
   SELECT COUNT(*) FROM public.prompts;  -- Should return 0
   ```

**Rollback:** Disable RLS on all tables

### Phase 6: Application Cutover (Week 1, Day 1)

**Tasks:**
1. Update `.env` to use PostgreSQL
   ```env
   DATABASE_TYPE=postgresql
   DATABASE_URL=postgresql://unified_user:password@localhost:5432/unified_dev
   ```

2. Deploy updated application code
3. Run smoke tests
4. Monitor for errors

**Rollback:** Revert `.env` to SQLite configuration

---

## Data Validation

### Validation Checklist

```bash
#!/bin/bash
# Data validation script

echo "Validating migration..."

# Compare row counts
echo "Checking row counts..."
python scripts/migrations/compare-row-counts.py

# Check for NULL tenant_ids
echo "Checking for NULL tenant_ids..."
psql -U unified_user -d unified_dev -c "
SELECT 
    'prompts' as table_name, 
    COUNT(*) FILTER (WHERE tenant_id IS NULL) as null_count 
FROM public.prompts
UNION ALL
SELECT 'agents', COUNT(*) FILTER (WHERE tenant_id IS NULL) FROM public.agents;
"

# Verify RLS is enabled
echo "Checking RLS status..."
psql -U unified_user -d unified_dev -c "
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname IN ('public', 'auth', 'audit');
"

# Test tenant isolation
echo "Testing tenant isolation..."
python scripts/migrations/test-rls-policies.py

echo "✅ Validation complete!"
```

---

## Performance Considerations

### Connection Pooling

**Configuration (SQLAlchemy):**
```python
from sqlalchemy import create_engine

engine = create_engine(
    DATABASE_URL,
    pool_size=20,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=3600,
    pool_pre_ping=True
)
```

### Indexes

**Critical Indexes:**
```sql
-- Tenant isolation performance
CREATE INDEX idx_prompts_tenant_created ON public.prompts(tenant_id, created_at DESC);
CREATE INDEX idx_runs_tenant_status ON public.runs(tenant_id, status);

-- Full-text search
CREATE INDEX idx_prompts_fts ON public.prompts 
    USING gin(to_tsvector('english', title || ' ' || description));

-- Audit log queries
CREATE INDEX idx_request_logs_tenant_timestamp ON audit.request_logs(tenant_id, timestamp DESC);
```

### Query Optimization

**Before (SQLite):**
```sql
SELECT * FROM prompts WHERE title LIKE '%search%';
```

**After (PostgreSQL):**
```sql
SELECT * FROM prompts 
WHERE tenant_id = current_setting('app.current_tenant')::uuid
  AND to_tsvector('english', title) @@ to_tsquery('english', 'search');
```

---

## Backup & Recovery

### Pre-Migration Backup

```bash
# Backup all SQLite databases
cp data/sqlite/prompts.db data/sqlite/prompts.db.backup-$(date +%Y%m%d)
cp data/sqlite/auth.db data/sqlite/auth.db.backup-$(date +%Y%m%d)
cp data/sqlite/audit.db data/sqlite/audit.db.backup-$(date +%Y%m%d)

# Verify backups
ls -lh data/sqlite/*.backup*
```

### PostgreSQL Backups

```bash
# Full database backup
pg_dump -U unified_user -d unified_dev -F c -f backups/unified_dev-$(date +%Y%m%d-%H%M%S).dump

# Restore from backup
pg_restore -U unified_user -d unified_dev -c backups/unified_dev-YYYYMMDD-HHMMSS.dump
```

---

## Rollback Plan

### Immediate Rollback (During Migration)

If migration fails during execution:

1. **Stop application**
   ```bash
   docker-compose down
   ```

2. **Drop PostgreSQL database**
   ```bash
   dropdb -U unified_user unified_dev
   ```

3. **Revert configuration**
   ```bash
   git checkout .env
   ```

4. **Restart with SQLite**
   ```bash
   docker-compose up -d
   ```

### Post-Migration Rollback (After Cutover)

If issues discovered after cutover:

1. **Immediate:** Switch `.env` back to SQLite
2. **Verify:** SQLite backups are intact
3. **Restore:** Application using SQLite
4. **Analyze:** Root cause of failure
5. **Plan:** Re-migration with fixes

**Time to Rollback:** < 15 minutes

---

## Testing Strategy

### Pre-Migration Testing

1. **Schema Validation:**
   - Verify all tables created correctly
   - Check all constraints are in place
   - Validate indexes exist

2. **Migration Script Testing:**
   - Test on copy of production SQLite data
   - Verify row counts match
   - Check data integrity

3. **RLS Testing:**
   - Test tenant isolation
   - Verify no cross-tenant data leakage
   - Test admin bypass (if implemented)

### Post-Migration Testing

1. **Functional Testing:**
   - Create new prompt
   - Update existing prompt
   - Delete prompt
   - User authentication
   - API key validation

2. **Performance Testing:**
   - Load test with 100 concurrent users
   - Measure query response times
   - Compare with SQLite baseline

3. **Integration Testing:**
   - Run full test suite
   - Verify all APIs working
   - Check webhook functionality

---

## Timeline

| Week | Phase | Activities | Downtime |
|------|-------|-----------|----------|
| -1 | Preparation | Scripts, testing, backups | None |
| 0 Day 1 | Schema Setup | Create DB, schemas, default tenant | None |
| 0 Day 2-3 | Data Migration | Copy data, validate | None |
| 0 Day 4 | Constraints | Add NOT NULL, unique constraints | None |
| 0 Day 5 | RLS | Enable row-level security | None |
| 1 Day 1 | Cutover | Switch application to PostgreSQL | ~1 hour |
| 1 Day 2-5 | Monitoring | Watch for issues, optimize | None |

**Total Downtime:** ~1 hour (during cutover)

---

## Monitoring Post-Migration

### Metrics to Watch

1. **Database Performance:**
   - Connection pool utilization
   - Query execution times
   - Cache hit ratio
   - Lock wait times

2. **Application Performance:**
   - API response times
   - Error rates
   - Request throughput

3. **Resource Utilization:**
   - CPU usage
   - Memory usage
   - Disk I/O
   - Network throughput

### Alerting Rules

```yaml
# PostgreSQL connection pool exhaustion
- alert: PostgresConnectionPoolFull
  expr: postgres_connections_used / postgres_connections_max > 0.9
  for: 5m
  annotations:
    summary: "PostgreSQL connection pool nearly exhausted"

# Slow queries
- alert: PostgresSlowQueries
  expr: postgres_query_duration_seconds > 5
  for: 1m
  annotations:
    summary: "PostgreSQL queries taking >5 seconds"

# RLS policy violations
- alert: PostgresRLSViolations
  expr: rate(postgres_rls_violations_total[5m]) > 0
  annotations:
    summary: "Row-level security policy violations detected"
```

---

## Success Metrics

### Migration Success

- ✅ All data migrated with 0% loss
- ✅ Row counts match between SQLite and PostgreSQL
- ✅ RLS policies enforced on all tables
- ✅ Application functions correctly
- ✅ No increase in error rates
- ✅ Downtime < 1 hour

### Performance Success

- ✅ API response times ≤ SQLite baseline
- ✅ Query execution times < 100ms (P95)
- ✅ Connection pool utilization < 80%
- ✅ Zero RLS policy violations

---

## Lessons Learned

*To be filled in after migration completion*

---

## References

- [PostgreSQL Row-Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [SQLAlchemy Connection Pooling](https://docs.sqlalchemy.org/en/14/core/pooling.html)
- [psycopg2 Documentation](https://www.psycopg.org/docs/)
- [Multi-Tenancy Specification](./specs/MULTI_TENANCY_SPEC.md)
- [ADR-001: Multi-Tenancy Approach](./adr/001-multi-tenancy.md)

---

**Document Owner:** Backend Team  
**Review Date:** Post-Migration  
**Status:** Ready for Execution
