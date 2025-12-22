# Phase 3 Metrics & Monitoring Specification
## Unified AI Toolbox v2.0

**Status:** Draft  
**Owner:** DevOps / Backend Lead  
**Last Updated:** December 2025  
**Version:** 1.0

---

## Executive Summary

This document defines the metrics, monitoring, and observability strategy for Phase 3 (Multi-Tenancy & Kubernetes) of the Unified AI Toolbox, including success metrics, SLOs, dashboards, and alerting rules.

## Objectives

### Primary Goals
- **Visibility:** Complete observability across all system components
- **Performance:** Track and optimize application performance
- **Reliability:** Maintain high availability and reliability
- **Cost:** Monitor and optimize resource usage
- **Security:** Detect and respond to security incidents
- **Tenant Isolation:** Ensure multi-tenancy works correctly

---

## Success Metrics

### Sprint 0 (Foundation)

| Metric | Target | Status |
|--------|--------|--------|
| Documentation Complete | 100% | ✅ 100% |
| Dev Environment Setup | 100% | ✅ 100% |
| Infrastructure Ready | 100% | ⏳ 80% |
| Team Onboarded | 100% | ⏳ 0% |

### Sprint 1 (Multi-Tenancy Core)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Tenant Isolation | 100% | RLS tests passing |
| Data Migration | 100% | All data migrated successfully |
| API Tenant Context | 100% | All endpoints tenant-aware |
| Performance Baseline | ±5% | Compare with v1.5 |

### Overall Phase 3 Success Criteria

| Metric | Target | Description |
|--------|--------|-------------|
| Multi-tenant Support | ✅ | 100+ tenants supported |
| Zero Data Leakage | ✅ | No cross-tenant access |
| Migration Success | ✅ | 0% data loss |
| Performance | ✅ | < 5% regression |
| Availability | 99.9% | < 43 minutes downtime/month |

---

## Key Performance Indicators (KPIs)

### Application Performance

#### API Response Time
```prometheus
# P50 (median)
histogram_quantile(0.50, rate(http_request_duration_seconds_bucket[5m]))

# P95
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# P99
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
```

**Targets:**
- P50: < 100ms
- P95: < 500ms
- P99: < 1000ms

#### Throughput
```prometheus
# Requests per second
rate(http_requests_total[5m])
```

**Targets:**
- Development: > 100 rps
- Staging: > 500 rps
- Production: > 1000 rps

#### Error Rate
```prometheus
# Error rate percentage
sum(rate(http_requests_total{status=~"5.."}[5m])) 
/ 
sum(rate(http_requests_total[5m])) * 100
```

**Targets:**
- < 0.1% (99.9% success rate)

### Database Performance

#### Query Duration
```prometheus
# P95 query duration
histogram_quantile(0.95, rate(postgres_query_duration_seconds_bucket[5m]))
```

**Targets:**
- P95: < 100ms
- P99: < 500ms

#### Connection Pool
```prometheus
# Connection pool utilization
postgres_connections_active / postgres_connections_max * 100
```

**Targets:**
- < 80% utilization
- > 10% headroom

#### Cache Hit Ratio
```prometheus
# Redis cache hit ratio
redis_cache_hits / (redis_cache_hits + redis_cache_misses) * 100
```

**Targets:**
- > 80% cache hit ratio

### Multi-Tenancy Metrics

#### Tenant Activity
```prometheus
# Active tenants in last 24h
count(count_over_time(tenant_api_requests_total[24h]) > 0)
```

#### Tenant Resource Usage
```prometheus
# Storage per tenant
sum by (tenant_id) (tenant_storage_bytes)

# API calls per tenant
sum by (tenant_id) (rate(tenant_api_requests_total[1h]))
```

#### Quota Utilization
```prometheus
# Quota usage percentage
(tenant_quota_used / tenant_quota_limit) * 100
```

**Alert Threshold:** > 90%

#### Tenant Isolation Violations
```prometheus
# Cross-tenant access attempts
rate(tenant_isolation_violations_total[5m])
```

**Target:** 0 violations

### System Resources

#### CPU Usage
```prometheus
# Node CPU usage
100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# Container CPU usage
rate(container_cpu_usage_seconds_total[5m])
```

**Targets:**
- Average: < 70%
- Peak: < 90%

#### Memory Usage
```prometheus
# Node memory usage
(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) 
/ node_memory_MemTotal_bytes * 100

# Container memory usage
container_memory_usage_bytes / container_spec_memory_limit_bytes * 100
```

**Targets:**
- Average: < 75%
- Peak: < 90%

#### Disk Usage
```prometheus
# Disk usage percentage
(node_filesystem_size_bytes - node_filesystem_avail_bytes) 
/ node_filesystem_size_bytes * 100
```

**Targets:**
- < 80% usage

### Kubernetes Metrics

#### Pod Health
```prometheus
# Running pods
count(kube_pod_status_phase{phase="Running"})

# Failed pods
count(kube_pod_status_phase{phase="Failed"})
```

#### Deployment Status
```prometheus
# Ready replicas ratio
kube_deployment_status_replicas_available 
/ kube_deployment_spec_replicas
```

**Target:** 100% (all replicas ready)

#### HPA Status
```prometheus
# Current vs desired replicas
kube_horizontalpodautoscaler_status_current_replicas
kube_horizontalpodautoscaler_status_desired_replicas
```

---

## Service Level Objectives (SLOs)

### Availability

**SLO:** 99.9% uptime (43.2 minutes downtime/month)

**Measurement:**
```prometheus
# Availability percentage
(
  sum(rate(http_requests_total{status!~"5.."}[30d])) 
  / 
  sum(rate(http_requests_total[30d]))
) * 100
```

**Error Budget:** 0.1% = 43.2 minutes/month

### Latency

**SLO:** 95% of requests < 500ms

**Measurement:**
```prometheus
# P95 latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[30d]))
```

### Throughput

**SLO:** Handle 1000 rps at P95 < 500ms

**Measurement:**
```prometheus
# Requests per second
rate(http_requests_total[5m])

# With latency constraint
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{le="0.5"}[5m]))
```

---

## Metric Instrumentation

### FastAPI Application Metrics

```python
from prometheus_client import Counter, Histogram, Gauge
from prometheus_fastapi_instrumentator import Instrumentator

# Custom metrics
tenant_requests = Counter(
    'tenant_api_requests_total',
    'Total API requests per tenant',
    ['tenant_id', 'tenant_slug', 'method', 'endpoint']
)

tenant_request_duration = Histogram(
    'tenant_api_request_duration_seconds',
    'Request duration per tenant',
    ['tenant_id', 'tenant_slug', 'endpoint'],
    buckets=[0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0]
)

tenant_quota_usage = Gauge(
    'tenant_quota_usage',
    'Tenant quota usage',
    ['tenant_id', 'quota_type']
)

tenant_storage = Gauge(
    'tenant_storage_bytes',
    'Tenant storage usage in bytes',
    ['tenant_id']
)

rls_violations = Counter(
    'tenant_isolation_violations_total',
    'Row-level security policy violations',
    ['tenant_id', 'table']
)

# Auto-instrumentation
instrumentator = Instrumentator()
instrumentator.instrument(app).expose(app, endpoint="/metrics")
```

### Middleware for Tenant Metrics

```python
from fastapi import Request
import time

@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    start_time = time.time()
    
    # Get tenant context
    tenant = getattr(request.state, 'tenant', None)
    
    # Process request
    response = await call_next(request)
    
    # Record metrics
    if tenant:
        duration = time.time() - start_time
        
        tenant_requests.labels(
            tenant_id=tenant.id,
            tenant_slug=tenant.slug,
            method=request.method,
            endpoint=request.url.path
        ).inc()
        
        tenant_request_duration.labels(
            tenant_id=tenant.id,
            tenant_slug=tenant.slug,
            endpoint=request.url.path
        ).observe(duration)
    
    return response
```

### Database Metrics

```python
from prometheus_client import Histogram
from sqlalchemy import event
from sqlalchemy.engine import Engine

query_duration = Histogram(
    'postgres_query_duration_seconds',
    'PostgreSQL query duration',
    ['query_type'],
    buckets=[0.001, 0.01, 0.1, 0.5, 1.0, 5.0]
)

@event.listens_for(Engine, "before_cursor_execute")
def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    context._query_start_time = time.time()

@event.listens_for(Engine, "after_cursor_execute")
def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    duration = time.time() - context._query_start_time
    
    # Determine query type
    query_type = statement.strip().split()[0].upper()
    
    query_duration.labels(query_type=query_type).observe(duration)
```

### Redis Metrics

```python
from prometheus_client import Counter, Histogram

redis_operations = Counter(
    'redis_operations_total',
    'Redis operations',
    ['operation', 'status']
)

redis_latency = Histogram(
    'redis_operation_duration_seconds',
    'Redis operation duration',
    ['operation'],
    buckets=[0.001, 0.01, 0.1, 0.5, 1.0]
)

class MetricsRedisClient:
    def __init__(self, redis_client):
        self.client = redis_client
    
    async def get(self, key):
        start = time.time()
        try:
            result = await self.client.get(key)
            redis_operations.labels(operation='get', status='success').inc()
            return result
        except Exception:
            redis_operations.labels(operation='get', status='error').inc()
            raise
        finally:
            redis_latency.labels(operation='get').observe(time.time() - start)
```

---

## Grafana Dashboards

### Dashboard 1: System Overview

**Panels:**
1. **API Throughput** (Graph)
   - Requests per second
   - By tenant (top 10)

2. **Response Time** (Graph)
   - P50, P95, P99 latency
   - 5-minute rolling average

3. **Error Rate** (Gauge)
   - Current error rate
   - Target: < 0.1%

4. **Active Tenants** (Single Stat)
   - Count of active tenants (last 24h)

5. **Resource Usage** (Graph)
   - CPU, Memory, Disk
   - By node/pod

6. **Database Performance** (Graph)
   - Query duration P95
   - Connection pool usage

### Dashboard 2: Multi-Tenancy

**Panels:**
1. **Tenant Activity** (Table)
   - Tenant name
   - API calls/hour
   - Storage usage
   - Active users

2. **Quota Utilization** (Bar Graph)
   - Per tenant quota usage
   - By quota type (users, prompts, API calls, storage)

3. **Tenant Growth** (Graph)
   - New tenants over time
   - Cumulative total

4. **Isolation Violations** (Graph)
   - RLS violations over time
   - By table

5. **Top Tenants by Usage** (Table)
   - API calls
   - Storage
   - Active users

### Dashboard 3: SLO Tracking

**Panels:**
1. **Availability SLO** (Gauge)
   - Current: 99.9%
   - Error budget remaining

2. **Latency SLO** (Graph)
   - P95 latency
   - SLO threshold (500ms)

3. **Error Budget Burn** (Graph)
   - Error budget consumption rate
   - Projection

4. **Incident History** (Table)
   - Recent incidents
   - Impact on SLO

### Dashboard 4: Kubernetes

**Panels:**
1. **Cluster Overview**
   - Node count
   - Pod count
   - Resource requests vs limits

2. **Pod Status** (Pie Chart)
   - Running, Pending, Failed

3. **HPA Status** (Graph)
   - Current vs desired replicas
   - By deployment

4. **Node Resources** (Graph)
   - CPU/Memory per node
   - Available capacity

5. **PVC Usage** (Table)
   - Volume name
   - Size
   - Usage %

---

## Alerting Rules

### Critical Alerts (Page Immediately)

#### High Error Rate
```yaml
- alert: HighErrorRate
  expr: |
    (sum(rate(http_requests_total{status=~"5.."}[5m])) 
    / sum(rate(http_requests_total[5m]))) * 100 > 1
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "High error rate detected"
    description: "Error rate is {{ $value }}% (threshold: 1%)"
```

#### API Down
```yaml
- alert: APIDown
  expr: up{job="unified-api"} == 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "API is down"
    description: "API instance {{ $labels.instance }} is unreachable"
```

#### Database Connection Pool Exhausted
```yaml
- alert: DatabasePoolExhausted
  expr: |
    (postgres_connections_active / postgres_connections_max) > 0.95
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Database connection pool nearly exhausted"
    description: "Connection pool usage: {{ $value }}%"
```

#### Tenant Isolation Violation
```yaml
- alert: TenantIsolationViolation
  expr: rate(tenant_isolation_violations_total[5m]) > 0
  for: 1m
  labels:
    severity: critical
  annotations:
    summary: "Tenant isolation violation detected"
    description: "{{ $value }} violations/second detected"
```

### Warning Alerts (Notify Team)

#### High Response Time
```yaml
- alert: HighResponseTime
  expr: |
    histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 0.5
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "High API response time"
    description: "P95 latency is {{ $value }}s (threshold: 0.5s)"
```

#### High CPU Usage
```yaml
- alert: HighCPUUsage
  expr: |
    100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "High CPU usage on {{ $labels.instance }}"
    description: "CPU usage is {{ $value }}%"
```

#### Tenant Quota Warning
```yaml
- alert: TenantQuotaWarning
  expr: |
    (tenant_quota_used / tenant_quota_limit) * 100 > 80
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Tenant {{ $labels.tenant_slug }} approaching quota limit"
    description: "Quota usage: {{ $value }}% for {{ $labels.quota_type }}"
```

#### Disk Space Low
```yaml
- alert: DiskSpaceLow
  expr: |
    (node_filesystem_avail_bytes / node_filesystem_size_bytes) * 100 < 20
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Low disk space on {{ $labels.instance }}"
    description: "Only {{ $value }}% remaining"
```

### Informational Alerts

#### New Tenant Created
```yaml
- alert: NewTenantCreated
  expr: increase(tenant_created_total[1h]) > 0
  labels:
    severity: info
  annotations:
    summary: "New tenant(s) created"
    description: "{{ $value }} tenant(s) created in last hour"
```

#### Slow Query Detected
```yaml
- alert: SlowQuery
  expr: |
    histogram_quantile(0.99, rate(postgres_query_duration_seconds_bucket[5m])) > 5
  for: 5m
  labels:
    severity: info
  annotations:
    summary: "Slow database queries detected"
    description: "P99 query duration: {{ $value }}s"
```

---

## Log Aggregation

### Structured Logging Format

```python
import structlog

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

# Usage
logger.info(
    "api_request",
    tenant_id=tenant.id,
    tenant_slug=tenant.slug,
    method=request.method,
    path=request.url.path,
    duration_ms=duration * 1000,
    status_code=response.status_code,
    user_id=user.id if user else None
)
```

### Log Queries (Examples)

**High error rate per tenant:**
```
level:error tenant_id:* | count by tenant_slug
```

**Slow requests:**
```
duration_ms:>1000 | avg duration_ms by endpoint
```

**Tenant isolation attempts:**
```
message:"cross_tenant_access" | count by tenant_slug
```

---

## Monitoring Stack Setup

### Prometheus Configuration

See `docs/phase3/monitoring/prometheus.yml`

### Grafana Setup

```bash
# Install Grafana
helm install grafana grafana/grafana \
  --namespace monitoring \
  --set persistence.enabled=true \
  --set persistence.size=10Gi

# Get admin password
kubectl get secret --namespace monitoring grafana \
  -o jsonpath="{.data.admin-password}" | base64 --decode

# Port forward
kubectl port-forward --namespace monitoring svc/grafana 3000:80
```

### Alert Manager Configuration

```yaml
route:
  receiver: 'team-notifications'
  group_by: ['alertname', 'severity']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  
  routes:
  - match:
      severity: critical
    receiver: 'pagerduty'
  - match:
      severity: warning
    receiver: 'slack'

receivers:
- name: 'team-notifications'
  slack_configs:
  - api_url: '<slack-webhook-url>'
    channel: '#alerts'

- name: 'pagerduty'
  pagerduty_configs:
  - service_key: '<pagerduty-key>'

- name: 'slack'
  slack_configs:
  - api_url: '<slack-webhook-url>'
    channel: '#warnings'
```

---

## Testing Metrics

### Load Testing

```bash
# Install k6
brew install k6  # or appropriate package manager

# Run load test
k6 run scripts/load-test.js

# Expected output includes:
# - requests/s
# - response time percentiles
# - error rate
```

**Load Test Script:**
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },  // Ramp up
    { duration: '5m', target: 100 },  // Stay at 100
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'],  // P95 < 500ms
    'http_req_failed': ['rate<0.01'],    // Error rate < 1%
  },
};

export default function() {
  let response = http.get('https://api.unified-toolbox.com/api/prompts', {
    headers: {
      'Authorization': `Bearer ${__ENV.API_TOKEN}`,
      'X-Tenant-ID': 'test-tenant',
    },
  });
  
  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  
  sleep(1);
}
```

---

## Continuous Improvement

### Monthly Review

1. **Review SLO Performance**
   - Are we meeting targets?
   - Adjust if needed

2. **Analyze Top Issues**
   - Most frequent alerts
   - Common failure patterns

3. **Capacity Planning**
   - Review growth trends
   - Plan for scaling

4. **Cost Optimization**
   - Identify waste
   - Optimize resources

### Quarterly Review

1. **Update Dashboards**
   - Add new panels
   - Remove obsolete metrics

2. **Refine Alerts**
   - Reduce noise
   - Add missing alerts

3. **Performance Tuning**
   - Database optimization
   - Cache tuning

---

## References

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Site Reliability Engineering Book](https://sre.google/books/)
- [The Four Golden Signals](https://sre.google/sre-book/monitoring-distributed-systems/)

---

**Document Owner:** DevOps Team  
**Review Cycle:** Monthly  
**Next Review:** January 2026
