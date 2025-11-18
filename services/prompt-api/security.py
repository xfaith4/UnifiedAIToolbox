"""
Security utilities for the Unified AI Toolbox API

Provides rate limiting, audit logging, and security utilities.
"""

import time
import sqlite3
from pathlib import Path
from collections import defaultdict
from typing import Dict, Tuple, Optional
from datetime import datetime

from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware


# ----------------------------
# Rate Limiting
# ----------------------------
class RateLimiter:
    """Simple in-memory rate limiter."""
    
    def __init__(self, requests_per_minute: int = 60):
        self.requests_per_minute = requests_per_minute
        self.requests: Dict[str, list] = defaultdict(list)
    
    def is_allowed(self, identifier: str) -> Tuple[bool, Optional[int]]:
        """
        Check if a request from the identifier is allowed.
        
        Returns:
            Tuple of (is_allowed, retry_after_seconds)
        """
        now = time.time()
        minute_ago = now - 60
        
        # Clean up old requests
        self.requests[identifier] = [
            req_time for req_time in self.requests[identifier]
            if req_time > minute_ago
        ]
        
        # Check rate limit
        if len(self.requests[identifier]) >= self.requests_per_minute:
            oldest_request = min(self.requests[identifier])
            retry_after = int(60 - (now - oldest_request)) + 1
            return False, retry_after
        
        # Allow request
        self.requests[identifier].append(now)
        return True, None


# Global rate limiter instance
rate_limiter = RateLimiter(requests_per_minute=100)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Middleware to enforce rate limiting on API requests."""
    
    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for health checks
        if request.url.path == "/health":
            return await call_next(request)
        
        # Use IP address as identifier (could also use user ID if authenticated)
        client_ip = request.client.host if request.client else "unknown"
        
        is_allowed, retry_after = rate_limiter.is_allowed(client_ip)
        
        if not is_allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Retry after {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)}
            )
        
        response = await call_next(request)
        
        # Add rate limit headers
        response.headers["X-RateLimit-Limit"] = str(rate_limiter.requests_per_minute)
        response.headers["X-RateLimit-Remaining"] = str(
            rate_limiter.requests_per_minute - len(rate_limiter.requests[client_ip])
        )
        
        return response


# ----------------------------
# Audit Logging
# ----------------------------
BASE_DIR = Path(__file__).parent.resolve()
AUDIT_DB_PATH = BASE_DIR / "audit.db"


def init_audit_db():
    """Initialize audit logging database."""
    conn = sqlite3.connect(AUDIT_DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            user_id INTEGER,
            username TEXT,
            action TEXT NOT NULL,
            resource TEXT,
            method TEXT,
            path TEXT,
            status_code INTEGER,
            ip_address TEXT,
            user_agent TEXT,
            details TEXT
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_timestamp ON audit_log(timestamp)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_user ON audit_log(username)
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_action ON audit_log(action)
    """)
    conn.commit()
    conn.close()


def log_audit_event(
    action: str,
    username: Optional[str] = None,
    user_id: Optional[int] = None,
    resource: Optional[str] = None,
    method: Optional[str] = None,
    path: Optional[str] = None,
    status_code: Optional[int] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None,
    details: Optional[str] = None,
):
    """Log an audit event to the database."""
    conn = sqlite3.connect(AUDIT_DB_PATH)
    timestamp = datetime.utcnow().isoformat()
    
    conn.execute("""
        INSERT INTO audit_log (
            timestamp, user_id, username, action, resource, method, 
            path, status_code, ip_address, user_agent, details
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        timestamp, user_id, username, action, resource, method,
        path, status_code, ip_address, user_agent, details
    ))
    
    conn.commit()
    conn.close()


class AuditLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware to log all API requests for audit purposes."""
    
    async def dispatch(self, request: Request, call_next):
        # Extract request information
        path = request.url.path
        method = request.method
        ip_address = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("user-agent", "unknown")
        
        # Extract username from auth header if present
        username = None
        auth_header = request.headers.get("authorization")
        if auth_header and auth_header.startswith("Bearer "):
            try:
                from auth import decode_token
                token = auth_header.split(" ")[1]
                token_data = decode_token(token)
                username = token_data.username
            except Exception:
                pass  # Token validation failed, username remains None
        
        # Process request
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time
        
        # Log important actions
        sensitive_paths = ["/auth/login", "/auth/register", "/auth/logout"]
        admin_paths = [path for path in ["/admin", "/settings"] if path.startswith(path)]
        
        if (
            path in sensitive_paths or
            any(path.startswith(admin_path) for admin_path in admin_paths) or
            method in ["POST", "PUT", "DELETE", "PATCH"]
        ):
            action = f"{method} {path}"
            details = f"Response time: {process_time:.3f}s"
            
            log_audit_event(
                action=action,
                username=username,
                method=method,
                path=path,
                status_code=response.status_code,
                ip_address=ip_address,
                user_agent=user_agent,
                details=details
            )
        
        return response


# ----------------------------
# Security Headers
# ----------------------------
def get_security_headers() -> Dict[str, str]:
    """Get recommended security headers."""
    return {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "Content-Security-Policy": (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self' data:; "
            "connect-src 'self' http://localhost:* http://127.0.0.1:*; "
            "frame-ancestors 'none'"
        ),
        "Permissions-Policy": (
            "geolocation=(), "
            "microphone=(), "
            "camera=(), "
            "payment=(), "
            "usb=(), "
            "magnetometer=(), "
            "gyroscope=(), "
            "accelerometer=()"
        ),
        "Referrer-Policy": "strict-origin-when-cross-origin",
    }


# ----------------------------
# Initialization
# ----------------------------
def initialize_security():
    """Initialize security features."""
    init_audit_db()
    print("✓ Security features initialized")
    print(f"  - Rate limiting: {rate_limiter.requests_per_minute} requests/minute")
    print(f"  - Audit logging: {AUDIT_DB_PATH}")


if __name__ == "__main__":
    initialize_security()
