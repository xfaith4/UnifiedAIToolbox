# Security Guide - Unified AI Toolbox

**Version:** 1.5 (Enterprise Ready)  
**Last Updated:** November 2025

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication System](#authentication-system)
3. [Authorization & RBAC](#authorization--rbac)
4. [Security Features](#security-features)
5. [Configuration](#configuration)
6. [Best Practices](#best-practices)
7. [Audit Logging](#audit-logging)
8. [Troubleshooting](#troubleshooting)

---

## Overview

The Unified AI Toolbox implements enterprise-grade security features including:

- **JWT-based authentication** with access and refresh tokens
- **Role-Based Access Control (RBAC)** with 3 roles
- **Rate limiting** to prevent abuse
- **Audit logging** for compliance
- **Security headers** (CSP, HSTS, etc.)
- **Password hashing** with bcrypt
- **API compression** for efficiency

---

## Authentication System

### How It Works

1. **User Login**: Submit username and password to `/auth/login`
2. **Token Generation**: Server returns JWT access token (60 min) and refresh token (7 days)
3. **Token Storage**: Dashboard stores tokens in localStorage
4. **Authenticated Requests**: Include access token in `Authorization: Bearer <token>` header
5. **Token Refresh**: Use refresh token to get new access token when expired

### Default Credentials

On first startup, a default admin user is created:

```
Username: admin
Password: admin
```

⚠️ **IMPORTANT**: Change the default password immediately after first login!

### API Endpoints

#### Login
```bash
POST /auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin"
}
```

**Response:**
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer"
}
```

#### Get Current User
```bash
GET /auth/me
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "id": 1,
  "username": "admin",
  "email": "admin@localhost",
  "role": "admin",
  "is_active": true,
  "created_at": "2025-11-18T00:00:00"
}
```

#### Register User (Admin Only)
```bash
POST /auth/register
Authorization: Bearer <admin_access_token>
Content-Type: application/json

{
  "username": "newuser",
  "email": "user@example.com",
  "password": "securepassword",
  "role": "user"
}
```

---

## Authorization & RBAC

### User Roles

| Role | Permissions | Use Case |
|------|-------------|----------|
| **admin** | Full access to all features | System administrators |
| **user** | Read and write access to most features | Regular users, developers |
| **readonly** | Read-only access | Auditors, viewers |

### Role Hierarchy

```
admin > user > readonly
```

When a route requires `user` role, both `user` and `admin` can access it.

### Protected Routes (Dashboard)

| Route | Required Role | Description |
|-------|---------------|-------------|
| `/login` | None (public) | Login page |
| `/dashboard` | readonly+ | Home dashboard |
| `/prompts` | readonly+ | Prompt library |
| `/agents` | readonly+ | Agent library |
| `/orchestrator` | user+ | Orchestration runs |
| `/github` | user+ | GitHub integration |
| `/settings` | admin | System settings |

### Protected Endpoints (API)

```python
from auth import require_admin, require_user, require_readonly

@app.get("/admin/users")
def list_users(current_user: User = Depends(require_admin)):
    # Only admins can access this
    pass

@app.post("/prompts")
def create_prompt(current_user: User = Depends(require_user)):
    # Users and admins can create prompts
    pass

@app.get("/prompts")
def list_prompts(current_user: User = Depends(require_readonly)):
    # Everyone can read prompts
    pass
```

---

## Security Features

### 1. Rate Limiting

**Configuration:**
- Default: 100 requests per minute per IP address
- Automatic cleanup of old request records
- Returns `429 Too Many Requests` when exceeded

**Response Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 75
Retry-After: 30
```

**Customize Rate Limit:**
```python
# In services/prompt-api/security.py
rate_limiter = RateLimiter(requests_per_minute=200)  # Increase to 200
```

### 2. Audit Logging

All sensitive operations are automatically logged to `audit.db`:

**Logged Events:**
- Authentication (login, logout, failed attempts)
- User registration
- All POST/PUT/DELETE/PATCH requests
- Admin actions
- Settings changes

**Log Fields:**
- Timestamp
- Username (if authenticated)
- User ID
- Action (method + path)
- IP address
- User agent
- Status code
- Response time

**Query Audit Logs:**
```sql
SELECT * FROM audit_log 
WHERE username = 'admin' 
ORDER BY timestamp DESC 
LIMIT 100;
```

### 3. Security Headers

The API sets comprehensive security headers on all responses:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains
Content-Security-Policy: default-src 'self'; ...
Permissions-Policy: geolocation=(), microphone=(), ...
Referrer-Policy: strict-origin-when-cross-origin
```

### 4. Password Security

- **Hashing Algorithm**: bcrypt with automatic salt generation
- **Work Factor**: Default bcrypt cost (currently 12)
- **Storage**: Only hashed passwords stored, never plaintext
- **Validation**: Constant-time comparison to prevent timing attacks

### 5. Token Security

- **Algorithm**: HS256 (HMAC with SHA-256)
- **Secret Key**: Generated automatically or set via `JWT_SECRET_KEY` env var
- **Access Token**: 60 minutes expiry
- **Refresh Token**: 7 days expiry
- **Validation**: Signature and expiration checked on every request

### 6. API Compression

- **GZip compression** enabled for responses > 1KB
- Reduces bandwidth usage by ~70%
- Automatic content negotiation with client

### 7. Performance Monitoring

- **X-Process-Time** header shows request processing time in milliseconds
- Helps identify slow endpoints
- Useful for optimization

---

## Configuration

### Environment Variables

Create a `.env` file in `services/prompt-api/`:

```env
# JWT Configuration
JWT_SECRET_KEY=your-super-secret-key-change-me
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=7

# Admin User
DEFAULT_ADMIN_PASSWORD=change-this-password

# Database Paths
AUTH_DB_PATH=/path/to/auth.db
AUDIT_DB_PATH=/path/to/audit.db

# API Configuration
PROMPT_API_ADMIN_TOKEN=legacy-admin-token
```

### Security Checklist

✅ **Before Production:**

1. [ ] Change default admin password
2. [ ] Set strong `JWT_SECRET_KEY` (at least 32 characters)
3. [ ] Enable HTTPS in production
4. [ ] Configure firewall rules
5. [ ] Review and adjust rate limits
6. [ ] Set up log rotation for audit logs
7. [ ] Configure backup for auth.db and audit.db
8. [ ] Review CORS origins (remove localhost in production)
9. [ ] Test authentication flows
10. [ ] Review user roles and permissions

---

## Best Practices

### For Administrators

1. **Use Strong Passwords**
   - Minimum 12 characters
   - Mix of uppercase, lowercase, numbers, symbols
   - Don't reuse passwords

2. **Regular Security Audits**
   - Review audit logs weekly
   - Check for unusual activity
   - Monitor rate limit violations

3. **User Management**
   - Create users with least privilege (start with readonly)
   - Promote to higher roles only when needed
   - Disable inactive users

4. **Token Management**
   - Rotate JWT secret key periodically (requires all users to re-login)
   - Keep tokens out of version control
   - Use environment variables

5. **Database Security**
   - Regular backups of auth.db and audit.db
   - Secure file permissions (600 or 640)
   - Encrypt database backups

### For Developers

1. **Protect Endpoints**
   ```python
   # Always add auth dependency
   @app.post("/sensitive-action")
   def sensitive_action(current_user: User = Depends(require_admin)):
       # Your code here
       pass
   ```

2. **Handle Tokens Properly**
   ```typescript
   // Store tokens securely
   localStorage.setItem('access_token', token)
   
   // Clear tokens on logout
   localStorage.removeItem('access_token')
   localStorage.removeItem('refresh_token')
   ```

3. **Check Permissions**
   ```typescript
   // In React components
   const { user } = useAuth()
   
   if (user?.role === 'admin') {
     // Show admin features
   }
   ```

4. **Error Handling**
   ```typescript
   try {
     await login(username, password)
   } catch (error) {
     if (error.response?.status === 401) {
       setError('Invalid credentials')
     } else if (error.response?.status === 429) {
       setError('Too many login attempts. Try again later.')
     }
   }
   ```

---

## Audit Logging

### Viewing Audit Logs

**Command Line:**
```bash
cd services/prompt-api
sqlite3 audit.db "SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 50"
```

**Python:**
```python
import sqlite3

conn = sqlite3.connect('audit.db')
cursor = conn.execute("""
    SELECT timestamp, username, action, status_code, ip_address
    FROM audit_log
    WHERE action LIKE '%login%'
    ORDER BY timestamp DESC
""")

for row in cursor:
    print(row)
```

### Audit Log Retention

By default, logs are kept indefinitely. For production:

```python
# Add to security.py or create a cleanup script
import sqlite3
from datetime import datetime, timedelta

def cleanup_old_logs(days_to_keep=90):
    conn = sqlite3.connect('audit.db')
    cutoff = (datetime.utcnow() - timedelta(days=days_to_keep)).isoformat()
    conn.execute("DELETE FROM audit_log WHERE timestamp < ?", (cutoff,))
    conn.commit()
    conn.close()
```

---

## Troubleshooting

### Common Issues

#### 1. "Token has expired"

**Problem:** Access token expired after 60 minutes

**Solution:**
- Use refresh token to get new access token
- Or log in again

#### 2. "Rate limit exceeded"

**Problem:** Too many requests from same IP

**Solution:**
- Wait for the time specified in `Retry-After` header
- Reduce request frequency
- Contact admin to increase rate limit

#### 3. "Incorrect username or password"

**Problem:** Login failed

**Solutions:**
- Check username and password carefully
- Ensure user account is active
- Check audit logs for failed login attempts
- Reset password if forgotten (admin required)

#### 4. "Access Denied" / 403 Forbidden

**Problem:** User doesn't have required role

**Solutions:**
- Contact admin to upgrade role
- Use appropriate account for the task
- Check role requirements for the endpoint

#### 5. Authentication not working

**Problem:** Auth endpoints returning errors

**Solutions:**
```bash
# Check if auth database exists
ls -la services/prompt-api/auth.db

# Initialize auth system
cd services/prompt-api
python3 -c "from auth import initialize_auth; initialize_auth()"

# Check if default admin created
sqlite3 auth.db "SELECT * FROM users"
```

### Security Contact

For security issues, please:
1. Check this documentation first
2. Review audit logs for clues
3. Create an issue (for non-sensitive problems)
4. For sensitive security vulnerabilities, contact: security@yourdomain.com

---

## Additional Resources

- [FastAPI Security Documentation](https://fastapi.tiangolo.com/tutorial/security/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [bcrypt Documentation](https://github.com/pyca/bcrypt/)

---

**Document Version:** 1.0  
**Last Updated:** November 2025  
**Maintained By:** Unified AI Toolbox Team
