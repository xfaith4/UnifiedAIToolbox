# Scripts Directory

## Unified AI Toolbox Automation Scripts

This directory contains automation scripts for deployment, testing, monitoring, and maintenance of the Unified AI Toolbox.

---

## Deployment Scripts

### 🔍 pre-deployment-check.sh

**Purpose**: Verify that all prerequisites are met before deploying to production.

**Usage**:

```bash
./scripts/pre-deployment-check.sh
```

**What it checks**:

- ✅ System requirements (CPU, RAM, disk space)
- ✅ Required software (Docker, Python, Node.js, Git)
- ✅ Network configuration (firewall, port availability)
- ✅ Environment variables (.env file, JWT secret, API keys)
- ✅ Database setup (SQLite files, integrity checks)
- ✅ Application build (dashboard dist/, API dependencies)
- ✅ Security configuration (SSL, nginx)
- ✅ External service connectivity (OpenAI, Anthropic, GitHub)
- ✅ Documentation completeness

**Exit codes**:

- `0` - All checks passed, ready for deployment
- `1` - One or more critical checks failed, cannot proceed

**Example output**:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Pre-Deployment Check Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Passed:   45
Failed:   0
Warnings: 3

✅ All pre-deployment checks PASSED
   System is ready for production deployment.
```

---

### 🧪 post-deployment-smoketest.sh

**Purpose**: Run smoke tests after deployment to verify system functionality.

**Usage**:

```bash
# Test local deployment
./scripts/post-deployment-smoketest.sh http://localhost

# Test production deployment
./scripts/post-deployment-smoketest.sh https://your-domain.com
```

**What it tests**:

- ✅ Basic connectivity (API health, dashboard)
- ✅ API endpoints (prompts, search, GitHub, auth)
- ✅ Response times (health <500ms, prompts <1000ms)
- ✅ Security headers (CSP, X-Frame-Options, etc.)
- ✅ CORS configuration
- ✅ Authentication (login endpoint)
- ✅ Database connectivity
- ✅ Rate limiting
- ✅ Log file creation
- ✅ Service health details
- ✅ Dashboard content
- ✅ Error handling (404, 405)

**Exit codes**:

- `0` - All smoke tests passed, system operational
- `1` - One or more tests failed, needs investigation

**Example output**:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Smoke Test Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Total Tests: 35
Passed:      35
Failed:      0
Success Rate: 100%

✅ All smoke tests PASSED
   System is operational and ready for use.
```

---

## Phase 3 Development Scripts

### 🔍 verify-phase3-env.sh ✨ **NEW**

**Purpose**: Verify Phase 3 development environment is properly set up.

**Usage**:

```bash
./scripts/verify-phase3-env.sh
```

**What it checks**:

- ✅ Milestone 1.5 prerequisites (Node.js, Python, Docker)
- ✅ Phase 3 new requirements (PostgreSQL, Redis, kubectl, Helm, kind)
- ✅ Python dependencies (FastAPI, SQLAlchemy, psycopg2, redis-py, Alembic, pytest)
- ✅ Node.js dependencies (dashboard node_modules)
- ✅ Configuration files (.env, .env.phase3)
- ✅ Connection tests (PostgreSQL, Redis)
- ✅ Phase 3 documentation (Sprint 0 plan, ADRs, specs)

**Exit codes**:

- `0` - Environment ready for Phase 3 development
- `1` - Critical components missing, cannot start development

**Example output**:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Verification Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Passed:   28
  Failed:   0
  Warnings: 5

✅ Environment verification PASSED!
   You're ready to start Phase 3 development.

Next steps:
  1. Review PHASE_3_SPRINT_0.md for sprint objectives
  2. Set up any missing optional components (if warnings)
  3. Read docs/phase3/specs/MULTI_TENANCY_SPEC.md
  4. Pick up a Sprint 0 task and start coding!
```

---

## Existing Scripts

---

## Swarms Engine

**Purpose**: Enable multi-agent “swarming” workflows (via the vendored `scripts/swarms` project) from the Web UI and orchestration scripts.

**Setup**:

```powershell
pwsh ./scripts/Setup-Swarms.ps1
```

This creates an isolated venv at `.uaitoolbox/swarms/.venv` and prints the python path; `Start-Toolbox.ps1` will auto-detect and set `SWARMS_PYTHON_BIN` for the Web UI and orchestration when available.

### Smoketest.ps1

**Purpose**: PowerShell module smoke test for local development.

**Usage**:

```powershell
pwsh ./Smoketest.ps1
```

**What it does**:

- Tests the PromptLibrary PowerShell module
- Renders a sample prompt artifact
- Validates module functionality

---

### Unified-Orchestration.ps1

**Purpose**: Run the orchestration pipeline directly.

**Canonical path**: `Orchestration/scripts/Unified-Orchestration.ps1`  
`scripts/Unified-Orchestration.ps1` is a compatibility shim that forwards to the canonical script.

**Usage**:

```powershell
pwsh ./Orchestration/scripts/Unified-Orchestration.ps1 `
  -RepoRoot $PWD `
  -GoalFile ./Goals/CurrentGoal.txt `
  -Model gpt-4o-mini `
  -MaxIterations 3 `
  -PassThreshold 7 `
  -CodexModel gpt-4o-mini
```

**Parameters**:

- `-RepoRoot`: Repository root directory
- `-GoalFile`: Path to goal file
- `-Model`: AI model to use
- `-MaxIterations`: Maximum orchestration iterations
- `-PassThreshold`: Success threshold
- `-CodexModel`: Model for Codex analysis
- `-SkipCodex`: Skip Codex analysis step

---

## Monitoring Scripts

### monitor.sh

**Purpose**: Health check script for production monitoring.

**Usage**:

```bash
# Manual run
./scripts/monitor.sh

# Automated via cron (every 5 minutes)
*/5 * * * * /opt/UnifiedAIToolbox/scripts/monitor.sh >> /var/log/unified-ai-health.log 2>&1
```

**What it monitors**:

- API health endpoint
- Dashboard availability
- Disk space usage
- Database file sizes
- Recent error count

**Output**:

```
=== Unified AI Toolbox Health Check ===

✓ API is healthy
✓ Dashboard is healthy
✓ Disk usage: 45%
✓ prompts.db: 2.3M
✓ auth.db: 48K
✓ audit.db: 156K

=== Log Summary (last hour) ===
Errors in last hour: 0
```

---

## Backup Scripts

### backup.sh

**Purpose**: Automated database backup with compression and retention.

**Usage**:

```bash
# Manual backup
./scripts/backup.sh

# Automated via cron (daily at 2 AM)
0 2 * * * /opt/UnifiedAIToolbox/scripts/backup.sh >> /var/log/unified-ai-backup.log 2>&1
```

**What it does**:

- Backs up all SQLite databases (prompts.db, auth.db, audit.db)
- Compresses backups with gzip
- Timestamps each backup
- Deletes backups older than 30 days
- Logs backup operations

**Backup location**: `/opt/backups/unified-ai-toolbox/`

**Restore procedure**:

```bash
# Stop services
sudo systemctl stop unified-ai-api
sudo systemctl stop unified-ai-dashboard

# Restore database
gunzip -c /opt/backups/unified-ai-toolbox/prompts_20251118_020000.db.gz > /opt/UnifiedAIToolbox/data/prompts.db

# Verify integrity
sqlite3 /opt/UnifiedAIToolbox/data/prompts.db "PRAGMA integrity_check;"

# Restart services
sudo systemctl start unified-ai-api
sudo systemctl start unified-ai-dashboard
```

---

## Best Practices

### Before Deployment

1. Run `pre-deployment-check.sh` to verify readiness
2. Review all warnings and failures
3. Fix any critical issues
4. Document any deviations from ideal configuration

### After Deployment

1. Run `post-deployment-smoketest.sh` immediately
2. Monitor logs for the first 24 hours
3. Set up automated monitoring with `monitor.sh`
4. Configure automated backups with `backup.sh`
5. Test restore procedure within first week

### Regular Maintenance

1. Review monitoring logs weekly
2. Check backup completion daily
3. Test restore procedure monthly
4. Update scripts as system evolves
5. Document any script customizations

---

## Adding New Scripts

When adding new scripts to this directory:

1. **Make executable**: `chmod +x scripts/your-script.sh`
2. **Add shebang**: `#!/bin/bash` or `#!/usr/bin/env pwsh`
3. **Add header comment** with:
   - Purpose
   - Usage
   - Author (optional)
   - Date
4. **Use colors** for output (see existing scripts for examples)
5. **Exit codes**: 0 for success, 1 for failure
6. **Update this README** with script documentation

---

## Troubleshooting

### Script won't run

```bash
# Check if executable
ls -la scripts/your-script.sh

# Make executable
chmod +x scripts/your-script.sh
```

### Permission denied

```bash
# Run with sudo if needed
sudo ./scripts/your-script.sh

# Or change ownership
sudo chown $USER:$USER scripts/your-script.sh
```

### Scripts not found in cron

```bash
# Use absolute paths in crontab
/opt/UnifiedAIToolbox/scripts/backup.sh

# Or set PATH in crontab
PATH=/usr/local/bin:/usr/bin:/bin
```

---

## Contributing

If you create a useful script for the Unified AI Toolbox:

1. Add it to this directory
2. Document it in this README
3. Test it thoroughly
4. Consider adding automated tests
5. Submit a pull request

---

## Support

For issues with scripts:

- Check script logs for error messages
- Review documentation above
- Open an issue on GitHub
- Contact the DevOps team

---

**Last Updated**: November 18, 2025
**Scripts Version**: 1.0
**Compatible with**: Unified AI Toolbox v1.5+
