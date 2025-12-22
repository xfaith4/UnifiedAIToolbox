"""Security and redaction helpers for orchestration bridge services.

These utilities centralize redaction of sensitive strings (tokens, URLs
containing credentials, authorization headers) so that log messages and
artifacts never persist secrets.
"""

from __future__ import annotations

import re
from typing import Any, Dict


_TOKEN_PATTERN = re.compile(r"([A-Za-z0-9_\-]{20,})")


def redact_text(value: str) -> str:
    """Redact token-like strings within a text value.

    Args:
        value: Text that may contain credentials.

    Returns:
        Text with token-like substrings replaced by "***".
    """

    if not value:
        return value

    # Mask tokens embedded in URLs (e.g., https://<token>@github.com)
    redacted = re.sub(r"https://[^/@]+@", "https://***@", value)
    # Mask long opaque strings that look like PATs
    redacted = _TOKEN_PATTERN.sub("***", redacted)
    return redacted


def redact_headers(headers: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy of headers with authorization-like fields removed."""

    sanitized: Dict[str, Any] = {}
    for key, val in headers.items():
        if key.lower() in {"authorization", "proxy-authorization"}:
            sanitized[key] = "***"
        else:
            sanitized[key] = val
    return sanitized


def safe_message(payload: Any) -> str:
    """Convert a payload to a redacted string for logging."""

    try:
        text = str(payload)
    except Exception:
        return "<unserializable>"
    return redact_text(text)
