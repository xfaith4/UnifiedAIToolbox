# Production Deployment Checklist

**Version:** 1.5 (Enterprise Ready)  
**Last Updated:** November 18, 2025  
**Status:** Ready for Production

---

## Overview

This checklist ensures all critical aspects are verified before deploying the Unified AI Toolbox to production. Complete each section in order, checking off items as they are validated.

**Estimated Time:** 2-4 hours for first deployment  
**Prerequisites:** Milestone 1.5 complete, infrastructure provisioned

---

## Phase 1: Pre-Deployment Preparation

### 1.1 Infrastructure Readiness

- [ ] **Server/VM provisioned** with minimum requirements:
  - CPU: 2+ cores
  - RAM: 4GB+ 
  - Storage: 20GB+ SSD
  - OS: Ubuntu 22.04 LTS / Debian 12 / RHEL 8+ (or compatible)

- [ ] **Domain name configured** (if applicable)
  - DNS A/AAAA records pointing to server
  - SSL certificate obtained (Let's Encrypt or commercial)
  - Reverse proxy configured (Nginx/Apache/Caddy)

- [ ] **Network configuration**
  - Firewall rules configured (allow 80, 443, block others)
  - Security groups configured (cloud providers)
  - Internal network access verified

- [ ] **Database backup strategy** defined
  - Backup location configured
  - Backup schedule set (daily recommended)
  - Restore procedure documented and tested

### 1.2 Dependencies Installed

- [ ] **Docker & Docker Compose** (recommended)
  - Docker version 24.0+
  - Docker Compose v2.20+
  - Docker daemon running

- [ ] **OR Manual Installation:**
  - [ ] Node.js 18+ installed
  - [ ] Python 3.12+ installed
  - [ ] PowerShell 7.4+ installed (optional)
  - [ ] Git installed

- [ ] **SSL/TLS certificates** installed (production only)
  - Certificate files in secure location
  - Certificate auto-renewal configured
  - Certificate permissions restricted (600)

### 1.3 Configuration Files

- [ ] **Environment file created** (`.env`)
  - Copied from `.env.example`
  - All required variables set
  - No placeholder values remaining

- [ ] **JWT_SECRET generated**
  - Minimum 32 characters
  - Cryptographically random
  - Stored securely
  ```bash
  python -c "import secrets; print(secrets.token_urlsafe(32))"
  ```

- [ ] **API keys configured**
  - OpenAI API key (if using OpenAI)
  - Anthropic API key (if using Claude)
  - GitHub token (for automation features)

- [ ] **Database configuration**
  - Database path configured
  - Directory permissions set (750)
  - Initial database created

### 1.4 Security Configuration

- [ ] **Strong passwords set**
  - Admin password changed from default
  - Minimum 12 characters
  - Mix of letters, numbers, symbols

- [ ] **HTTPS enforced** (production only)
  - HTTP redirects to HTTPS
  - HSTS header configured
  - SSL Labs rating A or higher

- [ ] **Firewall configured**
  - Only necessary ports open (80, 443)
  - SSH access restricted (key-only, specific IPs)
  - Rate limiting configured

- [ ] **Security headers enabled**
  - X-Content-Type-Options: nosniff
  - X-Frame-Options: DENY
  - X-XSS-Protection: 1; mode=block
  - Content-Security-Policy configured
  - Strict-Transport-Security (HTTPS only)

---

## Phase 2: Deployment Execution

### 2.1 Code Deployment

- [ ] **Repository cloned** to deployment directory
  ```bash
  git clone https://github.com/xfaith4/UnifiedAIToolbox.git
  cd UnifiedAIToolbox
  ```

- [ ] **Correct version checked out**
  ```bash
  git checkout main  # or specific release tag
  git log -1  # verify correct commit
  ```

- [ ] **Dependencies installed**
  
  **Docker method:**
  ```bash
  docker compose pull
  ```
  
  **Manual method:**
  ```bash
  # Backend
  cd services/prompt-api
  pip install -r requirements.txt
  
  # Frontend
  cd apps/dashboard
  npm install
  npm run build
  ```

- [ ] **Configuration verified**
  ```bash
  # Run verification script
  pwsh scripts/Verify-ProductionReadiness.ps1
  ```

### 2.2 Database Setup

- [ ] **Database initialized**
  ```bash
  # Will be auto-created on first run, or manually:
  python services/prompt-api/init_db.py
  ```

- [ ] **Database schema verified**
  ```bash
  sqlite3 data/sqlite/prompts.db ".schema"
  ```

- [ ] **Initial data loaded**
  ```bash
  # Index existing prompts
  pwsh -Command "Import-Module ./modules/PromptLibrary; Update-PromptIndex"
  ```

- [ ] **Admin user created**
  ```bash
  docker compose exec prompt-api python -c "from auth import create_default_admin; create_default_admin()"
  ```

### 2.3 Service Startup

- [ ] **Services started**
  
  **Docker method:**
  ```bash
  docker compose up -d
  ```
  
  **Manual method:**
  ```bash
  # Terminal 1: API
  cd services/prompt-api
  uvicorn app:app --host 0.0.0.0 --port 8000
  
  # Terminal 2: Dashboard (development mode)
  cd apps/dashboard
  npm run dev -- --host 0.0.0.0 --port 5173
  
  # OR serve production build with nginx/caddy
  ```

- [ ] **Service health verified**
  ```bash
  curl http://localhost:8000/health
  curl http://localhost:5173/
  ```

- [ ] **Logs checked for errors**
  ```bash
  docker compose logs -f  # Docker
  # OR check service logs in manual mode
  ```

---

## Phase 3: Post-Deployment Verification

### 3.1 Automated Tests

- [ ] **Run smoke tests**
  ```bash
  pwsh scripts/Test-DeploymentSmoke.ps1
  ```

- [ ] **Or Python smoke tests**
  ```bash
  pytest tests/test_deployment_smoke.py -v
  ```

- [ ] **All tests passing** (minimum 90% pass rate)

### 3.2 Manual Verification

- [ ] **Dashboard accessible**
  - Navigate to https://your-domain.com (or http://localhost:5173)
  - Dashboard loads without errors
  - No console errors in browser developer tools

- [ ] **Login working**
  - Can log in with admin credentials
  - JWT token received and stored
  - User profile displayed correctly

- [ ] **Core features functional**
  - [ ] Prompt search working
  - [ ] Prompt list displays
  - [ ] Navigation working
  - [ ] Dark mode toggle working (optional)

- [ ] **API endpoints responding**
  - Navigate to https://your-domain.com/docs
  - API documentation loads
  - Can test endpoints through Swagger UI

- [ ] **GitHub integration** (if configured)
  - [ ] Can search repositories
  - [ ] Can clone repositories
  - [ ] Codex swarm can run

- [ ] **Cost tracking working**
  - Cost summary displays
  - Budget status shows
  - Can view cost breakdown

### 3.3 Performance Verification

- [ ] **Response times acceptable**
  - API health: < 500ms
  - Search queries: < 200ms
  - Dashboard load: < 3s on 3G

- [ ] **Compression working**
  - Check Content-Encoding: gzip in response headers
  - Verify reduced transfer sizes

- [ ] **No memory leaks**
  - Monitor memory usage over 1 hour
  - Memory should stabilize, not continuously grow

### 3.4 Security Verification

- [ ] **Security scan passed**
  ```bash
  # Run CodeQL or other security scanner
  ```

- [ ] **No critical vulnerabilities**
  - Check dependency vulnerabilities
  - Review audit logs
  - Verify rate limiting working

- [ ] **Authentication enforced**
  - Cannot access protected routes without login
  - Settings page restricted to admin only
  - API requires valid JWT tokens

- [ ] **Security headers present**
  ```bash
  curl -I https://your-domain.com/
  ```
  - Verify all security headers present

---

## Phase 4: Monitoring & Maintenance Setup

### 4.1 Monitoring Configuration

- [ ] **Application logs configured**
  - Log rotation enabled (daily/weekly)
  - Log retention policy set (30-90 days)
  - Log levels appropriate (INFO in production)

- [ ] **Error tracking enabled**
  - Critical errors alert configured
  - Error log monitoring active
  - Notification channels set up

- [ ] **Performance monitoring**
  - API response times tracked
  - Database query performance monitored
  - Resource usage (CPU, RAM, disk) monitored

- [ ] **Uptime monitoring** (optional but recommended)
  - External monitoring service configured
  - Health check endpoint monitored
  - Alert thresholds set

### 4.2 Backup Verification

- [ ] **Backup script configured**
  ```bash
  # Example backup script
  #!/bin/bash
  DATE=$(date +%Y%m%d_%H%M%S)
  tar -czf backup_${DATE}.tar.gz data/sqlite/
  # Upload to backup location
  ```

- [ ] **Initial backup created and verified**
  ```bash
  # Test backup creation
  ./backup.sh
  # Verify backup file created and valid
  ```

- [ ] **Restore procedure tested**
  ```bash
  # Test restore on non-production system
  tar -xzf backup_YYYYMMDD_HHMMSS.tar.gz
  ```

- [ ] **Backup schedule configured**
  - Cron job or systemd timer set up
  - Backup retention policy defined
  - Off-site backup configured (recommended)

### 4.3 Documentation

- [ ] **Deployment documented**
  - Server details recorded (IP, hostname, location)
  - Configuration choices documented
  - Access credentials stored securely (password manager)

- [ ] **Runbook created**
  - Common operations documented
  - Troubleshooting steps listed
  - Emergency contacts listed

- [ ] **Team notified**
  - Deployment announcement sent
  - Access instructions provided
  - Support channels communicated

---

## Phase 5: Go-Live Validation

### 5.1 Final Checks

- [ ] **All checklist items completed**
- [ ] **No critical issues outstanding**
- [ ] **Team ready to support**
- [ ] **Rollback plan prepared** (if needed)

### 5.2 User Communication

- [ ] **Users notified of launch**
- [ ] **User documentation shared**
- [ ] **Training provided** (if applicable)
- [ ] **Feedback channels established**

### 5.3 Post-Launch Monitoring

- [ ] **Monitor for first 24 hours**
  - Check error rates every 2 hours
  - Review logs for issues
  - Monitor user activity

- [ ] **Week 1 review**
  - Analyze usage patterns
  - Review performance metrics
  - Collect user feedback
  - Address any issues

---

## Rollback Procedure

If critical issues arise after deployment:

### Quick Rollback (Docker)

```bash
# Stop services
docker compose down

# Revert to previous version
git checkout <previous-tag>

# Restore database backup
cp backup/prompts.db.backup data/sqlite/prompts.db

# Restart services
docker compose up -d
```

### Manual Rollback

```bash
# Stop services
systemctl stop prompt-api dashboard

# Revert code
git checkout <previous-tag>

# Restore database
cp backup/prompts.db.backup data/sqlite/prompts.db

# Restart services
systemctl start prompt-api dashboard
```

---

## Post-Deployment Notes

### Deployment Date
- **Date:** ________________
- **Time:** ________________
- **Deployed by:** ________________

### Deployment Details
- **Version:** ________________
- **Commit SHA:** ________________
- **Environment:** ________________

### Issues Encountered
_Record any issues and how they were resolved:_

---

### Next Steps After Deployment

1. **Week 1:** Monitor closely, gather initial feedback
2. **Week 2-4:** User acceptance testing, address bugs
3. **Month 2:** Review metrics, plan optimizations
4. **Month 3:** Plan Phase 3 features

### Key Resources

- **Production Deployment Guide:** [docs/PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md)
- **Security Guide:** [docs/SECURITY.md](SECURITY.md)
- **Performance Guide:** [docs/PERFORMANCE.md](PERFORMANCE.md)
- **Support:** GitHub Issues or your support channel

---

## Approval

**Checklist completed by:** ________________  
**Date:** ________________  
**Approved by:** ________________  
**Date:** ________________

---

**Status:** 
- [ ] Ready for Production
- [ ] Needs Review
- [ ] Blocked (specify reason): ________________

---

**Questions or issues?** Contact the development team or open a GitHub issue.
