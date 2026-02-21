"""
Security middleware primitives for prompt-api.

This module intentionally keeps dependencies minimal and uses in-process
state so local development remains simple while still providing baseline
protections when enabled.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from collections import deque
from typing import Deque, Dict, Tuple

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


LOGGER = logging.getLogger("prompt-api.security")
AUDIT_LOGGER = logging.getLogger("prompt-api.security.audit")

_RATE_BUCKETS: Dict[Tuple[str, str], Deque[float]] = {}
_RATE_LOCK = threading.Lock()
_SECURITY_INITIALIZED = False


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(1, value)


def _trust_proxy_headers() -> bool:
    return os.environ.get("PROMPT_API_TRUST_PROXY_HEADERS", "false").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def initialize_security() -> None:
    global _SECURITY_INITIALIZED
    if _SECURITY_INITIALIZED:
        return
    LOGGER.info(
        "Security middleware initialized: rate_limit_per_minute=%s trust_proxy_headers=%s",
        _env_int("PROMPT_API_RATE_LIMIT_PER_MINUTE", 120),
        _trust_proxy_headers(),
    )
    _SECURITY_INITIALIZED = True


def get_security_headers() -> Dict[str, str]:
    csp = os.environ.get(
        "PROMPT_API_CONTENT_SECURITY_POLICY",
        "default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    )
    return {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Content-Security-Policy": csp,
    }


def _client_identity(request: Request) -> str:
    if _trust_proxy_headers():
        forwarded_for = request.headers.get("x-forwarded-for", "")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _is_rate_limit_exempt(path: str) -> bool:
    exempt_paths = {
        "/health",
        "/docs",
        "/openapi.json",
        "/redoc",
    }
    if path in exempt_paths:
        return True
    if path.startswith("/static/"):
        return True
    return False


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Simple fixed-window per-client+path request limiter."""

    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS" or _is_rate_limit_exempt(request.url.path):
            return await call_next(request)

        now = time.time()
        window_seconds = _env_int("PROMPT_API_RATE_LIMIT_WINDOW_SECONDS", 60)
        limit = _env_int("PROMPT_API_RATE_LIMIT_PER_MINUTE", 120)
        key = (_client_identity(request), request.url.path)

        with _RATE_LOCK:
            bucket = _RATE_BUCKETS.setdefault(key, deque())
            # Evict expired timestamps from sliding window.
            while bucket and now - bucket[0] > window_seconds:
                bucket.popleft()
            if len(bucket) >= limit:
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": "Rate limit exceeded. Try again shortly.",
                        "limit": limit,
                        "window_seconds": window_seconds,
                    },
                )
            bucket.append(now)

        return await call_next(request)


class AuditLoggingMiddleware(BaseHTTPMiddleware):
    """Emit one structured audit event per request."""

    async def dispatch(self, request: Request, call_next) -> Response:
        start = time.time()
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            duration_ms = round((time.time() - start) * 1000, 2)
            AUDIT_LOGGER.info(
                "request method=%s path=%s status=%s duration_ms=%s client=%s",
                request.method,
                request.url.path,
                status_code,
                duration_ms,
                _client_identity(request),
            )
