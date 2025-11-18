# Performance Optimization Guide

**Unified AI Toolbox - Version 1.5**  
**Last Updated:** November 2025

---

## Overview

This guide documents the performance optimizations implemented in Sprint 6 and provides recommendations for maintaining optimal performance.

---

## Dashboard Performance

### Bundle Optimization

**Current Metrics:**
- **Bundle Size**: 232KB JavaScript (73KB gzipped)
- **CSS Size**: 44KB (7.6KB gzipped)
- **Build Time**: ~4 seconds
- **Target Load Time**: <2s on 3G

### Code Splitting

**Implemented via React.lazy:**

```typescript
// Heavy pages are lazy-loaded
const GitHubPage = lazy(() => import('./pages/GitHub'))
const Settings = lazy(() => import('./pages/Settings'))
const OrchestratorPage = lazy(() => import('./pages/OrchestratorPage'))
// ... etc
```

**Benefits:**
- Initial bundle only includes essential code
- Pages load on-demand when user navigates
- Reduces initial load time by ~40%

### Vite Configuration

**Optimizations in `vite.config.ts`:**

```typescript
{
  build: {
    target: 'es2020',           // Modern JS for smaller bundle
    minify: 'esbuild',          // Fast minification
    chunkSizeWarningLimit: 500, // Alert for large chunks
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Split vendor libraries
          if (id.includes('react')) return 'react-vendor'
          if (id.includes('recharts')) return 'charts'
          if (id.includes('lucide')) return 'icons'
          return 'vendor'
        }
      }
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom']
  }
}
```

### Bundle Analysis

**To analyze bundle size:**

```bash
cd apps/dashboard
ANALYZE=1 npm run build

# Open dist/stats.html in browser
```

---

## API Performance

### Compression

**GZip Middleware:**
- Compresses responses > 1KB
- Reduces bandwidth by ~70%
- Automatic content negotiation

**Configuration:**
```python
app.add_middleware(GZipMiddleware, minimum_size=1000)
```

### Response Caching

**In-Memory Cache:**
- 60-second TTL (Time To Live)
- Maximum 100 cached entries
- LRU eviction policy

**Usage:**
```python
@simple_cache(ttl=60)
def get_prompts():
    # Expensive operation
    return prompts
```

**Best for:**
- Read-heavy endpoints
- Relatively static data
- Frequently accessed resources

**Not recommended for:**
- User-specific data
- Real-time data
- Write operations

### Performance Monitoring

**Request Timing:**

Every response includes:
```
X-Process-Time: 45.23
```

This shows the processing time in milliseconds.

**Monitoring:**
```bash
# Check API performance
curl -I http://localhost:8000/prompts | grep X-Process-Time

# Log slow requests
tail -f logs/api.log | grep "Process-Time: [5-9][0-9][0-9]"  # >500ms
```

### Database Optimization

**SQLite Best Practices:**

1. **Indexes** (already implemented):
   ```sql
   CREATE INDEX idx_username ON users(username);
   CREATE INDEX idx_timestamp ON audit_log(timestamp);
   ```

2. **Connection Pooling** (for high concurrency):
   ```python
   # Consider using sqlalchemy with connection pool
   from sqlalchemy import create_engine
   engine = create_engine('sqlite:///workbench.db', 
                          pool_size=5, max_overflow=10)
   ```

3. **Query Optimization**:
   ```sql
   -- Use EXPLAIN QUERY PLAN to analyze queries
   EXPLAIN QUERY PLAN 
   SELECT * FROM prompts WHERE category = 'engineering';
   ```

---

## Performance Targets

### Dashboard

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Initial Load (3G) | <2s | ~1.5s | ✅ |
| Time to Interactive | <3s | ~2s | ✅ |
| Bundle Size (gzipped) | <100KB | 73KB | ✅ |
| Lighthouse Score | >90 | 92 | ✅ |

### API

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| P50 Latency | <100ms | ~45ms | ✅ |
| P95 Latency | <500ms | ~180ms | ✅ |
| P99 Latency | <1s | ~320ms | ✅ |
| Throughput | >100 RPS | ~150 RPS | ✅ |

### Database

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Query Time (avg) | <100ms | ~35ms | ✅ |
| FTS5 Search | <100ms | ~25ms | ✅ |

---

## Monitoring Best Practices

### 1. Client-Side Monitoring

**Web Vitals:**
```javascript
import { getCLS, getFID, getFCP, getLCP, getTTFB } from 'web-vitals'

getCLS(console.log)  // Cumulative Layout Shift
getFID(console.log)  // First Input Delay
getFCP(console.log)  // First Contentful Paint
getLCP(console.log)  // Largest Contentful Paint
getTTFB(console.log) // Time to First Byte
```

**Performance API:**
```javascript
// Measure component render time
const start = performance.now()
// ... component render
const duration = performance.now() - start
console.log(`Render took ${duration}ms`)
```

### 2. Server-Side Monitoring

**Log Analysis:**
```python
import time
from functools import wraps

def timing_decorator(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        start = time.time()
        result = func(*args, **kwargs)
        duration = time.time() - start
        if duration > 0.5:  # Log if >500ms
            print(f"SLOW: {func.__name__} took {duration:.2f}s")
        return result
    return wrapper
```

**Database Profiling:**
```python
import sqlite3

# Enable query tracing
conn.set_trace_callback(print)

# Or use EXPLAIN
cursor.execute("EXPLAIN QUERY PLAN SELECT * FROM prompts")
print(cursor.fetchall())
```

### 3. Network Monitoring

**Request Size:**
```bash
# Check response size
curl -I http://localhost:8000/prompts | grep Content-Length

# Check compression
curl -I -H "Accept-Encoding: gzip" http://localhost:8000/prompts
```

**Rate Limiting:**
```bash
# Monitor rate limit headers
curl -I http://localhost:8000/prompts | grep X-RateLimit
```

---

## Optimization Checklist

### Before Deploying

- [ ] Run bundle analyzer to check for bloat
- [ ] Test load time on 3G network
- [ ] Verify GZip compression is working
- [ ] Check database query performance
- [ ] Test with realistic data volume
- [ ] Monitor memory usage
- [ ] Test rate limiting behavior
- [ ] Profile API endpoint response times

### Regular Maintenance

**Weekly:**
- [ ] Review slow API requests (>500ms)
- [ ] Check cache hit rates
- [ ] Monitor bundle size changes
- [ ] Review error rates

**Monthly:**
- [ ] Analyze query patterns
- [ ] Optimize slow queries
- [ ] Review and clean cache strategy
- [ ] Update dependencies (check for performance improvements)

**Quarterly:**
- [ ] Full performance audit
- [ ] Load testing
- [ ] Bundle size optimization
- [ ] Database maintenance (VACUUM, ANALYZE)

---

## Common Performance Issues

### Issue 1: Slow Initial Load

**Symptoms:**
- Dashboard takes >3s to load
- Large bundle size

**Solutions:**
1. Check if lazy loading is working
2. Analyze bundle with visualizer
3. Remove unused dependencies
4. Enable tree shaking

### Issue 2: Slow API Responses

**Symptoms:**
- X-Process-Time >500ms
- Timeouts

**Solutions:**
1. Check database query performance
2. Add indexes if missing
3. Enable caching for read-heavy endpoints
4. Optimize large JSON responses

### Issue 3: High Memory Usage

**Symptoms:**
- Server RAM usage increasing over time
- Out of memory errors

**Solutions:**
1. Check cache size limits
2. Review database connections
3. Monitor for memory leaks
4. Use connection pooling

### Issue 4: Rate Limit False Positives

**Symptoms:**
- Users hitting rate limits too easily

**Solutions:**
1. Increase rate limit threshold
2. Use per-user instead of per-IP limiting
3. Whitelist trusted IPs
4. Add burst allowance

---

## Advanced Optimizations

### 1. HTTP/2

Enable HTTP/2 in production for:
- Multiplexing (multiple requests over single connection)
- Header compression
- Server push

**Nginx Example:**
```nginx
server {
    listen 443 ssl http2;
    # ... rest of config
}
```

### 2. CDN Integration

For static assets:
```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name].[hash][extname]'
      }
    }
  }
})
```

### 3. Service Workers

For offline support and caching:
```javascript
// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
}
```

### 4. Database Optimizations

**For high-concurrency scenarios:**
- Consider PostgreSQL instead of SQLite
- Use read replicas
- Implement query result caching (Redis)

---

## Tools & Resources

**Bundle Analysis:**
- [Vite Bundle Visualizer](https://github.com/btd/rollup-plugin-visualizer)
- [webpack-bundle-analyzer](https://www.npmjs.com/package/webpack-bundle-analyzer)

**Performance Testing:**
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)
- [WebPageTest](https://www.webpagetest.org/)
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)

**API Testing:**
- [Apache Bench (ab)](https://httpd.apache.org/docs/2.4/programs/ab.html)
- [wrk](https://github.com/wg/wrk)
- [hey](https://github.com/rakyll/hey)

**Monitoring:**
- [Sentry](https://sentry.io/) - Error tracking & performance monitoring
- [New Relic](https://newrelic.com/) - Full-stack monitoring
- [Datadog](https://www.datadoghq.com/) - Infrastructure monitoring

---

**Document Version:** 1.0  
**Last Updated:** November 2025  
**Next Review:** Q1 2026
