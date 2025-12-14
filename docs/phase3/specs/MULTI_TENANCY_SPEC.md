# Multi-Tenancy Specification
## Unified AI Toolbox v2.0

**Status**: Draft  
**Owner**: Architecture  
**Last Updated**: December 2025

---

## Objectives
- Provide secure tenant isolation for all platform data
- Keep a clear migration path from the existing single-tenant SQLite setup
- Standardize how tenant context flows through API, background jobs, and storage
- Enable per-tenant quotas, observability, and operational guardrails

---

## Architecture Overview
- **Application**: FastAPI backend with tenant-aware middleware
- **Data**: PostgreSQL 15+ with Row-Level Security (RLS) enforcing `tenant_id`
- **Cache**: Redis 7 with tenant-prefixed keys for isolation
- **Orchestration**: Kubernetes (kind/minikube locally) with per-tenant namespaces optional for later phases
- **Ingress**: Subdomain-based tenant routing (primary) with header-based fallback (`X-Tenant-ID`)

---

## Data Model
- **tenants**: `id (uuid PK)`, `slug (unique)`, `name`, `plan`, `status`, `created_at`, `billing_email`
- **users**: add `tenant_id (uuid FK tenants.id)`, enforce composite unique `(tenant_id, email)`
- **prompts / agents / audit_logs / api_keys**: add required `tenant_id`, index `tenant_id`, and enable RLS
- **tenant_settings**: per-tenant configuration flags and feature availability
- **quotas**: per-plan defaults with overrides (`max_users`, `max_prompts`, `max_api_calls_month`, `max_storage_gb`, `max_concurrent_requests`)
- **migrations**: Alembic-managed; every table gains `tenant_id NOT NULL` before enabling RLS

### RLS Policies
```sql
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON prompts
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

---

## Tenant Context & Request Flow
1. **Identification**  
   - Primary: subdomain (`{tenant}.toolbox.local`)  
   - Secondary: URL path prefix (`/t/{tenant}/...`)  
   - Fallback: `X-Tenant-ID` header for automation use-cases
2. **Propagation**  
   - FastAPI middleware extracts tenant slug → resolves to tenant UUID → sets `app.current_tenant` per DB connection
   - Background jobs (Celery) receive `tenant_id` in payload and set the same DB session variable
3. **Defaults**  
   - `DEFAULT_TENANT_SLUG` used only for local dev or migration backfills; disabled in production.

---

## API Surface (v2.0 additions)
- **Tenant Management**: `POST /api/tenants`, `GET /api/tenants`, `PATCH /api/tenants/{id}`, `POST /api/tenants/{id}/suspend`
- **Context Requirement**: All mutating endpoints require tenant context; responses include `tenant_id`.
- **Headers**: `X-Tenant-ID` accepted; requests without context return `400` unless explicitly marked public.
- **Dashboards**: dashboard/webapp forward tenant slug from subdomain to API header.

---

## Authentication & Authorization
- JWT includes `tenant_id`, `role`, and optional `plan`.
- Admin (cross-tenant) actions restricted to `platform_admin` role and audited separately.
- Session middleware sets `app.current_tenant`; RLS plus route-level RBAC prevents cross-tenant reads.

---

## Caching & Background Jobs
- Redis keys follow `tenant:{tenant_id}:{domain}:{key}` to avoid leakage.
- Celery queues use `tenant-{slug}` naming for isolation of long-running jobs.
- Invalidation routines accept `tenant_id` to clear scoped cache entries.

---

## Resource Quotas
- Default plan limits align with `.env.phase3.example` (`Free`, `Starter`, `Professional`, `Enterprise`).
- Enforcement points:
  - Pre-request middleware checks concurrent request caps.
  - Database triggers enforce storage/API call counters where applicable.
  - Rate limiting configured per tenant (Redis buckets).

---

## Migration Strategy (SQLite → PostgreSQL)
1. Add nullable `tenant_id` columns via Alembic; backfill `DEFAULT_TENANT_SLUG`.
2. Migrate data from SQLite into PostgreSQL with the new tenant columns populated.
3. Make `tenant_id` non-nullable and create indexes.
4. Enable RLS policies on tenant-scoped tables.
5. Update application configuration to use `DATABASE_TYPE=postgresql` and cut over dashboards/services.
6. Decommission SQLite usage after validation and backups.

---

## Observability
- **Metrics**: `tenant_request_total`, `tenant_request_duration_seconds`, `tenant_quota_remaining`, `tenant_cache_hits_total`
- **Logs**: Structured logs include `tenant_id`, `request_id`, and `actor`.
- **Tracing**: Span attributes carry `tenant_id` for distributed traces.
- **Dashboards**: Grafana panels for per-tenant traffic, error rates, and quota burn-down.

---

## Testing & Validation
- Unit tests for tenant extraction middleware and RLS policy enforcement.
- Integration tests for tenant CRUD, quota enforcement, and cache scoping.
- Migration tests validating backfill and RLS enablement.
- Smoke tests using `docker-compose.phase3.yml` + `.env.phase3` to verify PostgreSQL/Redis connectivity.

---

## Risks & Mitigations
- **RLS misconfiguration** → Add negative tests and peer review for every policy.
- **Default tenant misuse** → Disable default tenant in production; alert if used.
- **Quota bypass** → Enforce limits server-side (not only UI) and log overruns.
- **Cross-tenant admin actions** → Require explicit `platform_admin` role and audit events.

---

## Open Questions
- Do we allow temporary cross-tenant support roles? (Proposed: gated via time-bound tokens)
- Should we introduce per-tenant encryption keys in Phase 3 or defer to Phase 4?

