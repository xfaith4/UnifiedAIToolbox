#!/usr/bin/env python3
import argparse
import json
import os
import sys
import urllib.error
import urllib.request


def fetch_url(name: str, url: str, method: str = "GET", payload: bytes | None = None, headers=None):
    headers = headers or {}
    req = urllib.request.Request(url, data=payload, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            content = resp.read().decode("utf-8", errors="ignore")
            print(f"[OK] {name} {method} {url} -> {resp.status}")
            if content:
                print(f"      Response snippet: {content.strip()[:160]}")
            return True, resp.status, content
    except urllib.error.HTTPError as err:
        print(f"[FAIL] {name} {method} {url} -> HTTP {err.code}")
        return False, err.code, err.read().decode("utf-8", errors="ignore")
    except urllib.error.URLError as err:
        print(f"[FAIL] {name} {method} {url} -> {err}")
        return False, None, ""


def verify_endpoints(api_port, frontend_port, web_port, skip_frontend=False, skip_web=False):
    results = []
    health_url = f"http://localhost:{api_port}/health"
    results.append(fetch_url("Prompt API health", health_url))
    if not skip_frontend:
        results.append(fetch_url("Vite dashboard", f"http://localhost:{frontend_port}/"))
    if not skip_web:
        results.append(fetch_url("Next.js portal", f"http://localhost:{web_port}/"))
    return results


def verify_orchestrator(api_port):
    url = f"http://localhost:{api_port}/orchestrate/run"
    payload = json.dumps(
        {
            "goal": "Smoke test launch script",
            "review_policy": "standard",
            "run_mode": "multi-agent",
        }
    ).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    success, status, body = fetch_url("Orchestrator POST", url, method="POST", payload=payload, headers=headers)
    if success:
        try:
            manifest = json.loads(body)
            run_id = manifest.get("run_id") or manifest.get("manifest", {}).get("run_id")
            print(f"  -> Created run_id: {run_id}")
            print(f"RUN_ID: {run_id}")
        except Exception:
            print("  -> Could not parse response body as JSON")


def main():
    parser = argparse.ArgumentParser(description="Verify Unified AI Toolbox launch.")
    parser.add_argument("--api-port", type=int, default=int(os.environ.get("API_PORT", "8000")))
    parser.add_argument("--frontend-port", type=int, default=int(os.environ.get("FRONTEND_PORT", "5173")))
    parser.add_argument("--web-port", type=int, default=int(os.environ.get("WEB_PORT", "3000")))
    parser.add_argument("--skip-frontend", action="store_true")
    parser.add_argument("--skip-web", action="store_true")
    args = parser.parse_args()

    print("Verifying services...")
    verify_endpoints(
        api_port=args.api_port,
        frontend_port=args.frontend_port,
        web_port=args.web_port,
        skip_frontend=args.skip_frontend,
        skip_web=args.skip_web,
    )
    print("Triggering orchestrator POST...")
    verify_orchestrator(api_port=args.api_port)


if __name__ == "__main__":
    main()
