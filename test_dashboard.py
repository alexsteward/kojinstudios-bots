#!/usr/bin/env python3
"""
Basic health checks for local Netlify dashboard dev server.

Usage:
  python3 test_dashboard.py
  python3 test_dashboard.py http://localhost:8888
"""

import json
import sys
import urllib.error
import urllib.parse
import urllib.request


def req(url: str, method: str = "GET", payload=None):
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=10) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            return resp.status, body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return e.code, body


def print_check(name: str, ok: bool, detail: str):
    mark = "PASS" if ok else "FAIL"
    print(f"[{mark}] {name}: {detail}")


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8888"
    base = base.rstrip("/")

    failures = 0

    # 1) Static dashboard page
    status, body = req(f"{base}/dashboard.html")
    ok = status == 200 and "<html" in body.lower()
    print_check("dashboard.html", ok, f"status={status}")
    failures += 0 if ok else 1

    # 2) server-status function with sample guild id
    sample_guild = "123456789012345678"
    status, body = req(f"{base}/.netlify/functions/server-status?guild_id={sample_guild}")
    parsed = {}
    try:
        parsed = json.loads(body or "{}")
    except json.JSONDecodeError:
        parsed = {}
    ok = status == 200 and "guild_id" in parsed
    detail = f"status={status}, keys={list(parsed.keys())[:5]}"
    print_check("server-status", ok, detail)
    failures += 0 if ok else 1

    # 3) dashboard-api endpoint should at least respond (often 503 without backend URL)
    status, body = req(f"{base}/.netlify/functions/dashboard-api?endpoint=config&guild_id={sample_guild}")
    ok = status in (200, 400, 502, 503)
    print_check("dashboard-api(config)", ok, f"status={status}")
    failures += 0 if ok else 1

    # 4) Stripe checkout endpoint should fail clearly without body/keys
    status, body = req(f"{base}/.netlify/functions/create-checkout-session", method="POST", payload={})
    body_lower = body.lower()
    ok = status in (400, 500) and ("missing required fields" in body_lower or "failed to create checkout session" in body_lower)
    print_check("create-checkout-session validation", ok, f"status={status}")
    failures += 0 if ok else 1

    print("")
    if failures:
        print(f"{failures} check(s) failed.")
        sys.exit(1)
    print("All checks passed.")


if __name__ == "__main__":
    main()
