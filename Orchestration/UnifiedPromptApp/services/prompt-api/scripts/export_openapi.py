"""
Utility script to snapshot the FastAPI OpenAPI schema under docs/openapi.json.

Usage:
    python scripts/export_openapi.py
"""

from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

import app


def main() -> None:
    client = TestClient(app.app)
    schema = client.app.openapi()
    docs_dir = Path(__file__).resolve().parents[1] / "docs"
    docs_dir.mkdir(parents=True, exist_ok=True)
    target = docs_dir / "openapi.json"
    target.write_text(json.dumps(schema, indent=2), encoding="utf-8")
    print(f"[prompt-api] wrote {target}")


if __name__ == "__main__":
    main()
