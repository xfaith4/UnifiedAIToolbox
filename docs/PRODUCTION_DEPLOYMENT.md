# Production Deployment Guide
## Unified AI Toolbox v1.5 (Enterprise Ready)

**Last Updated**: November 18, 2025  
**Version**: 1.5  
**Status**: Production Ready

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Deployment Options](#deployment-options)
4. [Security Configuration](#security-configuration)
5. [Database Setup](#database-setup)
6. [Monitoring & Logging](#monitoring--logging)
7. [Backup & Recovery](#backup--recovery)
8. [Scaling Considerations](#scaling-considerations)
9. [Troubleshooting](#troubleshooting)
10. [Maintenance](#maintenance)

---

## Prerequisites

### System Requirements

**Minimum**
- CPU: 2 cores
- RAM: 4 GB
- Disk: 20 GB
- OS: Ubuntu 20.04+ / Windows Server 2019+ / macOS 12+

**Recommended**
- CPU: 4+ cores
- RAM: 8+ GB
- Disk: 50+ GB SSD
- OS: Ubuntu 22.04 LTS

### Software Requirements

**Required**
- Docker 24.0+ & Docker Compose 2.20+
- Node.js 18+ (for dashboard)
- Python 3.12+ (for API)
- Git 2.40+

**Optional**
- PowerShell 7.4+ (for automation scripts)
- .NET 8 SDK (for desktop app)
- nginx or Apache (for reverse proxy)

### Network Requirements

**Inbound Ports**
- 5173: Dashboard (development)
- 8000: API service
- 3000: Web portal (optional)
- 80/443: HTTP/HTTPS (with reverse proxy)

**Outbound Access**
- api.openai.com (port 443) - OpenAI API
- api.anthropic.com (port 443) - Anthropic API
- api.github.com (port 443) - GitHub API
- github.com (port 443) - Repository cloning

---

## Environment Setup

### 1. Clone Repository

```bash
# Production server
cd /opt
git clone https://github.com/xfaith4/UnifiedAIToolbox.git
cd UnifiedAIToolbox
```

### 2. Create Environment File

Create `.env` file in the root directory:

```bash
# Copy from example
cp .env.example .env

# Edit with your values
nano .env
```

### 3. Required Environment Variables

```bash
# ====================
# Authentication
# ====================
JWT_SECRET_KEY=<GENERATE-STRONG-SECRET-KEY>
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

# ====================
# AI Providers
# ====================
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Cost limits (USD per day)
OPENAI_DAILY_BUDGET=100
ANTHROPIC_DAILY_BUDGET=100

# ====================
# GitHub Integration
# ====================
GITHUB_TOKEN=ghp_...
GITHUB_CLONE_DIR=/tmp/github-clones

# ====================
# Database Paths
# ====================
DATABASE_PATH=/opt/UnifiedAIToolbox/data/prompts.db
AUTH_DATABASE_PATH=/opt/UnifiedAIToolbox/data/auth.db
AUDIT_DATABASE_PATH=/opt/UnifiedAIToolbox/data/audit.db

# ====================
# CORS Configuration
# ====================
CORS_ORIGINS=https://your-domain.com,https://www.your-domain.com

# ====================
# Security
# ====================
RATE_LIMIT_PER_MINUTE=100
ENABLE_AUDIT_LOGGING=true

# ====================
# Production Settings
# ====================
ENVIRONMENT=production
LOG_LEVEL=INFO
```

### 4. Generate JWT Secret Key

```bash
# Using Python
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Using OpenSSL
openssl rand -base64 32

# Use this value for JWT_SECRET_KEY
```

### 5. Set Proper Permissions

```bash
# Protect .env file
chmod 600 .env

# Create data directory
mkdir -p data
chmod 755 data
```

---

## Deployment Options

### Option 1: Docker Compose (Recommended)

**Advantages**: Isolated, reproducible, easy rollback  
**Best For**: Production deployments, cloud VMs

#### Step 1: Build Images

```bash
# Build all services
docker compose build

# Or build specific services
docker compose build dashboard
docker compose build prompt-api
```

#### Step 2: Start Services

```bash
# Start all services in background
docker compose up -d

# View logs
docker compose logs -f

# Check status
docker compose ps
```

#### Step 3: Verify Deployment

```bash
# Check health endpoints
curl http://localhost:8000/health
curl http://localhost:5173/

# View service logs
docker compose logs prompt-api
docker compose logs dashboard
```

#### Step 4: Create Admin User

```bash
# Enter API container
docker compose exec prompt-api bash

# Create admin user
python -c "
from auth import create_user
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')
hashed = pwd_context.hash('your-secure-password')
create_user('admin', 'admin@example.com', hashed, 'admin')
"

# Exit container
exit
```

### Option 2: Manual Deployment

**Advantages**: More control, easier debugging  
**Best For**: Development, small deployments

#### Step 1: Install Dependencies

```bash
# Backend
cd services/prompt-api
pip install -r requirements.txt

# Frontend
cd ../../apps/dashboard
npm install
npm run build
```

#### Step 2: Initialize Databases

```bash
# Create databases
cd /opt/UnifiedAIToolbox
python -c "
import sqlite3
from pathlib import Path

# Create data directory
Path('data').mkdir(exist_ok=True)

# Initialize databases
for db_name in ['prompts.db', 'auth.db', 'audit.db']:
    db_path = Path('data') / db_name
    conn = sqlite3.connect(db_path)
    conn.close()
    print(f'Created {db_path}')
"
```

#### Step 3: Run Migrations

```bash
# Execute schema scripts
cd /opt/UnifiedAIToolbox
sqlite3 data/prompts.db < data/sqlite/schema.sql
```

#### Step 4: Start Services

```bash
# Terminal 1: API Service
cd services/prompt-api
uvicorn app:app --host 0.0.0.0 --port 8000 --workers 4

# Terminal 2: Dashboard (production build)
cd apps/dashboard
python -m http.server 5173 --directory dist
```

### Option 3: Systemd Services

**Advantages**: Auto-restart, system integration  
**Best For**: Linux servers

#### Create API Service

```bash
sudo nano /etc/systemd/system/unified-ai-api.service
```

```ini
[Unit]
Description=Unified AI Toolbox API
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/UnifiedAIToolbox/services/prompt-api
Environment="PATH=/usr/local/bin:/usr/bin:/bin"
EnvironmentFile=/opt/UnifiedAIToolbox/.env
ExecStart=/usr/bin/uvicorn app:app --host 0.0.0.0 --port 8000 --workers 4
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

#### Create Dashboard Service

```bash
sudo nano /etc/systemd/system/unified-ai-dashboard.service
```

```ini
[Unit]
Description=Unified AI Toolbox Dashboard
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/UnifiedAIToolbox/apps/dashboard
ExecStart=/usr/bin/python3 -m http.server 5173 --directory dist
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

#### Enable and Start Services

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable services (start on boot)
sudo systemctl enable unified-ai-api
sudo systemctl enable unified-ai-dashboard

# Start services
sudo systemctl start unified-ai-api
sudo systemctl start unified-ai-dashboard

# Check status
sudo systemctl status unified-ai-api
sudo systemctl status unified-ai-dashboard
```

---

## Security Configuration

### 1. HTTPS with nginx

#### Install nginx

```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx
```

#### Configure nginx

```bash
sudo nano /etc/nginx/sites-available/unified-ai-toolbox
```

```nginx
# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS configuration
server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    # SSL certificates (certbot will add these)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # API proxy
    location /api/ {
        proxy_pass http://localhost:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Dashboard
    location / {
        proxy_pass http://localhost:5173/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### Enable Site and Get Certificate

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/unified-ai-toolbox /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Get SSL certificate
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Reload nginx
sudo systemctl reload nginx
```

### 2. Firewall Configuration

```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Verify
sudo ufw status
```

### 3. Fail2Ban for Brute Force Protection

```bash
# Install fail2ban
sudo apt install fail2ban

# Create custom jail for API
sudo nano /etc/fail2ban/jail.local
```

```ini
[unified-ai-api]
enabled = true
port = 8000
filter = unified-ai-api
logpath = /opt/UnifiedAIToolbox/logs/api.log
maxretry = 5
bantime = 3600
findtime = 600
```

Create filter:

```bash
sudo nano /etc/fail2ban/filter.d/unified-ai-api.conf
```

```ini
[Definition]
failregex = ^.*"POST /auth/login.*" 401.*<HOST>.*$
ignoreregex =
```

Restart fail2ban:

```bash
sudo systemctl restart fail2ban
sudo fail2ban-client status unified-ai-api
```

---

## Database Setup

### 1. Initialize Databases

```bash
cd /opt/UnifiedAIToolbox

# Create schema
sqlite3 data/prompts.db < data/sqlite/schema.sql

# Verify tables
sqlite3 data/prompts.db "SELECT name FROM sqlite_master WHERE type='table';"
```

### 2. Create Admin User

```bash
cd services/prompt-api
python -c "
from auth import get_db, create_default_admin
create_default_admin()
print('Admin user created')
"
```

### 3. Set Database Permissions

```bash
# Owner: www-data (or your service user)
sudo chown www-data:www-data data/*.db

# Permissions: Read/write for owner
chmod 600 data/*.db

# Directory permissions
chmod 755 data/
```

### 4. Enable WAL Mode (Performance)

```bash
# Enable Write-Ahead Logging for better concurrency
sqlite3 data/prompts.db "PRAGMA journal_mode=WAL;"
sqlite3 data/auth.db "PRAGMA journal_mode=WAL;"
sqlite3 data/audit.db "PRAGMA journal_mode=WAL;"
```

---

## Monitoring & Logging

### 1. Application Logs

#### Configure Logging

Edit `services/prompt-api/app.py`:

```python
import logging
from logging.handlers import RotatingFileHandler

# Create logs directory
os.makedirs('logs', exist_ok=True)

# Configure rotating file handler
handler = RotatingFileHandler(
    'logs/api.log',
    maxBytes=10485760,  # 10MB
    backupCount=10
)
handler.setFormatter(logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
))

logger = logging.getLogger()
logger.addHandler(handler)
logger.setLevel(logging.INFO)
```

#### View Logs

```bash
# Real-time tail
tail -f /opt/UnifiedAIToolbox/services/prompt-api/logs/api.log

# Last 100 lines
tail -n 100 /opt/UnifiedAIToolbox/services/prompt-api/logs/api.log

# Search for errors
grep ERROR /opt/UnifiedAIToolbox/services/prompt-api/logs/api.log
```

### 2. Health Checks

```bash
# API health
curl http://localhost:8000/health

# Dashboard health
curl http://localhost:5173/

# Check all services
curl http://localhost:8000/auth/status
```

### 3. Monitoring Script

Create `/opt/UnifiedAIToolbox/scripts/monitor.sh`:

```bash
#!/bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "=== Unified AI Toolbox Health Check ==="
echo ""

# Check API
if curl -sf http://localhost:8000/health > /dev/null; then
    echo -e "${GREEN}✓${NC} API is healthy"
else
    echo -e "${RED}✗${NC} API is down"
fi

# Check Dashboard
if curl -sf http://localhost:5173/ > /dev/null; then
    echo -e "${GREEN}✓${NC} Dashboard is healthy"
else
    echo -e "${RED}✗${NC} Dashboard is down"
fi

# Check disk space
DISK_USAGE=$(df -h /opt/UnifiedAIToolbox | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -lt 80 ]; then
    echo -e "${GREEN}✓${NC} Disk usage: ${DISK_USAGE}%"
else
    echo -e "${RED}✗${NC} Disk usage: ${DISK_USAGE}% (high)"
fi

# Check database files
for db in prompts.db auth.db audit.db; do
    if [ -f "data/$db" ]; then
        SIZE=$(du -h "data/$db" | cut -f1)
        echo -e "${GREEN}✓${NC} $db: $SIZE"
    else
        echo -e "${RED}✗${NC} $db: missing"
    fi
done

echo ""
echo "=== Log Summary (last hour) ==="
if [ -f "services/prompt-api/logs/api.log" ]; then
    ERRORS=$(grep ERROR "services/prompt-api/logs/api.log" | grep "$(date -d '1 hour ago' '+%Y-%m-%d %H')" | wc -l)
    echo "Errors in last hour: $ERRORS"
fi
```

Make executable and run:

```bash
chmod +x /opt/UnifiedAIToolbox/scripts/monitor.sh
/opt/UnifiedAIToolbox/scripts/monitor.sh
```

### 4. Cron Job for Monitoring

```bash
# Add to crontab
crontab -e

# Run health check every 5 minutes
*/5 * * * * /opt/UnifiedAIToolbox/scripts/monitor.sh >> /var/log/unified-ai-health.log 2>&1
```

---

## Backup & Recovery

### 1. Database Backup Script

Create `/opt/UnifiedAIToolbox/scripts/backup.sh`:

```bash
#!/bin/bash

# Configuration
BACKUP_DIR="/opt/backups/unified-ai-toolbox"
DATA_DIR="/opt/UnifiedAIToolbox/data"
RETENTION_DAYS=30

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Backup each database
for db in prompts.db auth.db audit.db; do
    if [ -f "$DATA_DIR/$db" ]; then
        # Create backup
        sqlite3 "$DATA_DIR/$db" ".backup '$BACKUP_DIR/${db%.db}_$TIMESTAMP.db'"
        
        # Compress
        gzip "$BACKUP_DIR/${db%.db}_$TIMESTAMP.db"
        
        echo "Backed up: $db"
    fi
done

# Cleanup old backups
find "$BACKUP_DIR" -name "*.db.gz" -mtime +$RETENTION_DAYS -delete

echo "Backup completed: $TIMESTAMP"
```

Make executable:

```bash
chmod +x /opt/UnifiedAIToolbox/scripts/backup.sh
```

### 2. Automated Daily Backup

```bash
# Add to crontab
crontab -e

# Run backup daily at 2 AM
0 2 * * * /opt/UnifiedAIToolbox/scripts/backup.sh >> /var/log/unified-ai-backup.log 2>&1
```

### 3. Restore from Backup

```bash
#!/bin/bash

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

echo "Restore completed"
```

### 4. Backup to Cloud (Optional)

```bash
# Using AWS S3
aws s3 sync /opt/backups/unified-ai-toolbox/ s3://your-bucket/unified-ai-backups/

# Using rsync to remote server
rsync -avz /opt/backups/unified-ai-toolbox/ user@backup-server:/backups/unified-ai/
```

---

## Scaling Considerations

### 1. Horizontal Scaling

For high traffic deployments:

- **Load Balancer**: nginx, HAProxy, or cloud load balancer
- **Multiple API instances**: Run with --workers parameter
- **Shared database**: Consider PostgreSQL for higher concurrency
- **Redis cache**: Add Redis for distributed caching
- **Session store**: External session management

### 2. Vertical Scaling

Resource recommendations by user count:

| Users | CPU | RAM | Storage |
|-------|-----|-----|---------|
| 1-50 | 2 cores | 4 GB | 20 GB |
| 50-200 | 4 cores | 8 GB | 50 GB |
| 200-500 | 8 cores | 16 GB | 100 GB |
| 500+ | Custom architecture recommended |

### 3. Database Optimization

```sql
-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompts(category);
CREATE INDEX IF NOT EXISTS idx_prompts_updated ON prompts(updated_utc);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);

-- Enable query optimization
PRAGMA optimize;
```

---

## Troubleshooting

### Common Issues

#### 1. API Not Starting

**Symptom**: API fails to start or crashes immediately

**Diagnosis**:
```bash
# Check logs
journalctl -u unified-ai-api -n 50

# Check if port is in use
sudo lsof -i :8000

# Verify environment variables
sudo systemctl show unified-ai-api | grep Environment
```

**Solutions**:
- Ensure all environment variables are set
- Check database file permissions
- Verify Python dependencies installed
- Check for port conflicts

#### 2. Authentication Fails

**Symptom**: Cannot login, 401 errors

**Diagnosis**:
```bash
# Check auth database
sqlite3 data/auth.db "SELECT * FROM users;"

# Check JWT secret
grep JWT_SECRET_KEY .env

# Check API logs
tail -f services/prompt-api/logs/api.log | grep auth
```

**Solutions**:
- Verify JWT_SECRET_KEY is set and consistent
- Ensure user exists in auth.db
- Check token expiration settings
- Clear browser localStorage

#### 3. Dashboard Not Loading

**Symptom**: White screen or 404 errors

**Diagnosis**:
```bash
# Check if dashboard service is running
curl http://localhost:5173/

# Check build
ls -la apps/dashboard/dist/

# Check browser console for errors
```

**Solutions**:
- Rebuild dashboard: `npm run build`
- Check CORS settings in API
- Verify nginx proxy configuration
- Check browser console for specific errors

#### 4. GitHub Integration Fails

**Symptom**: Cannot clone repos, API errors

**Diagnosis**:
```bash
# Check GitHub token
echo $GITHUB_TOKEN

# Test GitHub API access
curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user

# Check clone directory
ls -la /tmp/github-clones/
```

**Solutions**:
- Verify GITHUB_TOKEN is valid
- Check token permissions (repo access)
- Ensure clone directory exists and is writable
- Check network connectivity to github.com

#### 5. High Memory Usage

**Symptom**: System runs out of memory

**Diagnosis**:
```bash
# Check memory usage
free -h

# Check process memory
ps aux --sort=-%mem | head -10

# Check API workers
ps aux | grep uvicorn
```

**Solutions**:
- Reduce uvicorn workers
- Enable response compression
- Implement request rate limiting
- Add swap space
- Upgrade server RAM

---

## Maintenance

### Weekly Tasks

- [ ] Review audit logs for suspicious activity
- [ ] Check disk space usage
- [ ] Review error logs
- [ ] Verify backups are running
- [ ] Test restore procedure (monthly)

### Monthly Tasks

- [ ] Update dependencies
- [ ] Review security advisories
- [ ] Rotate logs
- [ ] Review and cleanup old GitHub clones
- [ ] Performance review

### Quarterly Tasks

- [ ] Update SSL certificates (automatic with certbot)
- [ ] Security audit
- [ ] Disaster recovery drill
- [ ] Capacity planning review

### Update Procedure

```bash
# 1. Backup current version
/opt/UnifiedAIToolbox/scripts/backup.sh

# 2. Pull latest changes
cd /opt/UnifiedAIToolbox
git fetch origin
git checkout v1.5.1  # or desired version

# 3. Update dependencies
cd services/prompt-api
pip install -r requirements.txt

cd ../../apps/dashboard
npm install
npm run build

# 4. Run migrations (if any)
# Check CHANGELOG for migration steps

# 5. Restart services
sudo systemctl restart unified-ai-api
sudo systemctl restart unified-ai-dashboard

# 6. Verify deployment
/opt/UnifiedAIToolbox/scripts/monitor.sh
```

---

## Support & Resources

### Documentation
- README.md - Overview and quick start
- SECURITY.md - Security features and best practices
- PERFORMANCE.md - Performance optimization
- GITHUB_AUTOMATION.md - GitHub integration guide

### Community
- GitHub Issues: https://github.com/xfaith4/UnifiedAIToolbox/issues
- Discussions: https://github.com/xfaith4/UnifiedAIToolbox/discussions

### Professional Support
For enterprise support, contact: [support email]

---

## Appendix

### A. Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| JWT_SECRET_KEY | Yes | - | Secret key for JWT tokens |
| JWT_ALGORITHM | No | HS256 | JWT algorithm |
| ACCESS_TOKEN_EXPIRE_MINUTES | No | 60 | Access token TTL |
| OPENAI_API_KEY | Yes* | - | OpenAI API key |
| ANTHROPIC_API_KEY | Yes* | - | Anthropic API key |
| GITHUB_TOKEN | Yes* | - | GitHub personal access token |
| CORS_ORIGINS | No | localhost | Allowed CORS origins |
| RATE_LIMIT_PER_MINUTE | No | 100 | Rate limit threshold |

*Required for specific features

### B. Port Usage

| Port | Service | Protocol | Purpose |
|------|---------|----------|---------|
| 5173 | Dashboard | HTTP | Frontend UI |
| 8000 | API | HTTP | Backend API |
| 3000 | Web Portal | HTTP | Optional portal |
| 80 | nginx | HTTP | Reverse proxy (redirect) |
| 443 | nginx | HTTPS | Reverse proxy (main) |

### C. File Paths

```
/opt/UnifiedAIToolbox/
├── .env                        # Environment variables
├── data/
│   ├── prompts.db             # Prompt data
│   ├── auth.db                # User accounts
│   └── audit.db               # Audit logs
├── logs/
│   └── api.log                # API logs
└── services/prompt-api/       # API service
```

---

**Document Version**: 1.0  
**Last Updated**: November 18, 2025  
**Next Review**: December 18, 2025
