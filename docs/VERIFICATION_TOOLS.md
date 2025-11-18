# Production Verification Tools Guide

**Version:** 1.5  
**Last Updated:** November 18, 2025  
**Purpose:** Quick reference for deployment verification tools

---

## Overview

The Unified AI Toolbox includes comprehensive verification tools to ensure production readiness and validate deployments. These tools bridge the gap between development completion and production deployment.

---

## Tools Summary

| Tool | Purpose | When to Use | Runtime |
|------|---------|-------------|---------|
| **Verify-ProductionReadiness.ps1** | Pre-deployment checks | Before deploying | 1-3 min |
| **Test-DeploymentSmoke.ps1** | Post-deployment validation | After deploying | 30-60 sec |
| **test_deployment_smoke.py** | CI/CD smoke tests | In automated pipelines | 30-60 sec |
| **DEPLOYMENT_CHECKLIST.md** | Step-by-step guide | During deployment | N/A |

---

## 1. Pre-Deployment Verification

### Verify-ProductionReadiness.ps1

**Purpose:** Validates that the environment is ready for production deployment.

**Usage:**
```bash
# Full verification (recommended)
pwsh scripts/Verify-ProductionReadiness.ps1

# Skip test execution for quick check
pwsh scripts/Verify-ProductionReadiness.ps1 -SkipTests

# Skip performance benchmarks
pwsh scripts/Verify-ProductionReadiness.ps1 -SkipPerformance

# Skip both tests and performance
pwsh scripts/Verify-ProductionReadiness.ps1 -SkipTests -SkipPerformance
```

**What it checks:**
1. **Environment Configuration**
   - Node.js version (18+)
   - Python version (3.12+)
   - Docker availability
   - .env file existence and completeness
   - Required environment variables

2. **Security Configuration**
   - JWT_SECRET strength (32+ characters)
   - No development placeholders
   - File permissions on sensitive files
   - HTTPS configuration reminder

3. **Database & Data**
   - SQLite database files exist
   - Prompt library has content
   - Database size validation

4. **Dependencies & Build**
   - Python packages installed
   - Node modules installed
   - Production builds exist

5. **Test Suites (optional)**
   - PowerShell tests passing
   - Python tests passing

6. **Service Health (if running)**
   - API responding
   - Dashboard accessible

7. **Documentation**
   - All required docs present

**Exit codes:**
- `0` - Ready or mostly ready (< 4 failures)
- `1` - Not ready (4+ failures)

**Example output:**
```
━━━ 1. Environment Configuration ━━━
  ✓ Environment file exists
  ✓ JWT_SECRET is set
  ✓ Node.js version - v20.10.0
  ✓ Python version - Python 3.12.0
  ⚠ Docker installed - optional but recommended

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRODUCTION READINESS SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✓ PASSED:   15 checks
  ⚠ WARNINGS: 3 checks
  ✗ FAILED:   0 checks

✓ PRODUCTION READY - System is ready for deployment
```

---

## 2. Post-Deployment Validation

### Test-DeploymentSmoke.ps1

**Purpose:** Validates that deployed services are functioning correctly.

**Usage:**
```bash
# Test local deployment
pwsh scripts/Test-DeploymentSmoke.ps1

# Test remote deployment
pwsh scripts/Test-DeploymentSmoke.ps1 `
  -ApiBaseUrl "https://api.example.com" `
  -DashboardUrl "https://app.example.com"

# Test with authentication
pwsh scripts/Test-DeploymentSmoke.ps1 `
  -AdminUsername "admin" `
  -AdminPassword "your-secure-password"
```

**What it tests:**
1. **API Health & Availability**
   - Root endpoint accessible
   - Health endpoint returns valid JSON
   - API documentation accessible
   - OpenAPI schema available

2. **Authentication System**
   - Auth status endpoint working
   - Login endpoint functional
   - Token generation working

3. **Prompt Management APIs**
   - List prompts endpoint
   - Search prompts endpoint
   - Valid JSON responses

4. **Cost Tracking & Analytics**
   - Cost summary endpoint
   - Budget status endpoint

5. **GitHub Integration**
   - Search endpoint available
   - Codex runs endpoint accessible

6. **Dashboard Frontend**
   - Dashboard loads
   - Contains app root element
   - JavaScript files load

7. **Performance**
   - API response time < 500ms
   - Search response time < 200ms
   - Response compression enabled

8. **Security Headers**
   - X-Content-Type-Options present
   - X-Frame-Options present
   - X-XSS-Protection present
   - CSP and HSTS (production)

**Exit codes:**
- `0` - All tests passed or mostly passed
- `1` - Multiple tests failed (3+)

**Example output:**
```
▶ 1. API Health & Availability
  ✓ API root endpoint accessible - 200
  ✓ Health endpoint returns valid JSON - healthy
  ✓ API documentation accessible
  ✓ OpenAPI schema available

▶ 7. Performance Checks
  ✓ API response time < 500ms - 127ms
  ✓ Search response time < 200ms - 43ms
  ✓ Response compression enabled - gzip

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SMOKE TEST SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Total Tests:  32
  Passed:       31
  Failed:       1
  Pass Rate:    96.9%

✓ ALL TESTS PASSED - Deployment is healthy
```

---

## 3. CI/CD Integration

### test_deployment_smoke.py

**Purpose:** Python/pytest version of smoke tests for CI/CD pipelines.

**Usage:**
```bash
# Run all smoke tests
pytest tests/test_deployment_smoke.py -v

# Run specific test class
pytest tests/test_deployment_smoke.py::TestAPIHealth -v

# Run with custom URL
API_BASE_URL=https://api.example.com pytest tests/test_deployment_smoke.py -v

# Generate JUnit XML report (for CI)
pytest tests/test_deployment_smoke.py --junit-xml=test-results.xml

# Run with coverage
pytest tests/test_deployment_smoke.py --cov=. --cov-report=html
```

**Environment variables:**
- `API_BASE_URL` - Base URL for API (default: http://localhost:8000)
- `DASHBOARD_URL` - Dashboard URL (default: http://localhost:5173)

**Test classes:**
- `TestAPIHealth` - API health and availability
- `TestAuthentication` - Authentication system
- `TestPromptManagement` - Prompt management APIs
- `TestCostTracking` - Cost tracking and analytics
- `TestGitHubIntegration` - GitHub integration
- `TestDashboard` - Dashboard frontend
- `TestPerformance` - Performance benchmarks
- `TestSecurityHeaders` - Security headers
- `TestEndToEnd` - End-to-end workflows

**Example output:**
```
tests/test_deployment_smoke.py::TestAPIHealth::test_api_root_accessible PASSED
tests/test_deployment_smoke.py::TestAPIHealth::test_health_endpoint PASSED
tests/test_deployment_smoke.py::TestAuthentication::test_auth_status_endpoint PASSED
tests/test_deployment_smoke.py::TestPerformance::test_api_response_time PASSED

========================= 32 passed in 2.54s =========================
```

---

## 4. Deployment Checklist

### DEPLOYMENT_CHECKLIST.md

**Purpose:** Comprehensive step-by-step deployment guide.

**Usage:** Follow the checklist phases in order:

1. **Phase 1: Pre-Deployment Preparation**
   - Infrastructure readiness
   - Dependencies installation
   - Configuration files
   - Security configuration

2. **Phase 2: Deployment Execution**
   - Code deployment
   - Database setup
   - Service startup

3. **Phase 3: Post-Deployment Verification**
   - Automated tests
   - Manual verification
   - Performance verification
   - Security verification

4. **Phase 4: Monitoring & Maintenance Setup**
   - Monitoring configuration
   - Backup verification
   - Documentation

5. **Phase 5: Go-Live Validation**
   - Final checks
   - User communication
   - Post-launch monitoring

**Features:**
- ✅ Checkbox format for tracking progress
- 🔄 Rollback procedures included
- 📝 Space for deployment notes
- ✍️ Approval signatures section

---

## Best Practices

### Before Deployment

1. **Run verification script** at least 24 hours before deployment
   ```bash
   pwsh scripts/Verify-ProductionReadiness.ps1
   ```

2. **Address all failures** - Don't deploy with failed checks

3. **Review warnings** - Warnings are acceptable but should be understood

4. **Test in staging** - Run all tools in staging environment first

### During Deployment

1. **Follow checklist** - Use DEPLOYMENT_CHECKLIST.md systematically

2. **Document as you go** - Fill in the checklist as you complete steps

3. **Keep backup ready** - Have rollback plan prepared

### After Deployment

1. **Run smoke tests immediately** after services start
   ```bash
   pwsh scripts/Test-DeploymentSmoke.ps1
   ```

2. **Monitor for 1 hour** - Watch logs and metrics closely

3. **Run tests again** after 24 hours to ensure stability

4. **Schedule weekly tests** to catch regressions early

---

## Troubleshooting

### Common Issues

**Issue:** Verification script reports "JWT_SECRET too short"
**Solution:** Generate a new 32+ character secret:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

**Issue:** Smoke tests fail with "Connection refused"
**Solution:** Ensure services are running:
```bash
docker compose ps
# or
ps aux | grep "uvicorn\|node"
```

**Issue:** "Dashboard dependencies" failed
**Solution:** Install npm dependencies:
```bash
cd apps/dashboard && npm install
```

**Issue:** Performance tests failing
**Solution:** Check server resources:
```bash
# CPU and memory usage
top
# Disk space
df -h
```

**Issue:** Security headers missing
**Solution:** Check reverse proxy configuration (Nginx/Apache/Caddy)

---

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Deploy to Production

on:
  push:
    branches: [ main ]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Verify Production Readiness
        run: |
          pwsh scripts/Verify-ProductionReadiness.ps1 -SkipTests
  
  deploy:
    needs: verify
    runs-on: ubuntu-latest
    steps:
      # ... deployment steps ...
  
  smoke-test:
    needs: deploy
    runs-on: ubuntu-latest
    steps:
      - name: Run Smoke Tests
        env:
          API_BASE_URL: ${{ secrets.PROD_API_URL }}
          DASHBOARD_URL: ${{ secrets.PROD_DASHBOARD_URL }}
        run: |
          pytest tests/test_deployment_smoke.py -v --junit-xml=results.xml
      
      - name: Publish Test Results
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: results.xml
```

---

## Additional Resources

### Documentation
- [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) - Full deployment guide
- [SECURITY.md](SECURITY.md) - Security best practices
- [PERFORMANCE.md](PERFORMANCE.md) - Performance optimization
- [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) - Step-by-step checklist

### Support
- **Issues:** https://github.com/xfaith4/UnifiedAIToolbox/issues
- **Discussions:** https://github.com/xfaith4/UnifiedAIToolbox/discussions

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Nov 18, 2025 | Initial release with all verification tools |

---

**Questions or feedback?** Open an issue or discussion on GitHub.
