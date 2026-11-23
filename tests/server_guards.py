"""Starts the real server with strict limits and fires requests at it to show each guard stopping something.
No API key or model calls needed. Writes docs/data/server_guards.json.   python tests/server_guards.py"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORT = 8049
BASE = f"http://127.0.0.1:{PORT}"


def post(path, body, headers=None):
    data = json.dumps(body).encode() if not isinstance(body, bytes) else body
    req = urllib.request.Request(BASE + path, data=data, headers={"Content-Type": "application/json", **(headers or {})}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def get(path):
    try:
        with urllib.request.urlopen(BASE + path, timeout=10) as r:
            return r.status, r.read()[:200]
    except urllib.error.HTTPError as e:
        return e.code, b""


def start(env_extra):
    env = {**os.environ, "PORT": str(PORT), **env_extra}
    p = subprocess.Popen([sys.executable, str(ROOT / "server.py")], cwd=ROOT, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try:
            urllib.request.urlopen(BASE + "/api/health", timeout=1)
            return p
        except Exception:
            time.sleep(0.1)
    p.kill()
    raise SystemExit("server didn't start")


def main():
    note = {"note": "Hive 1 calm", "colonies": [{"id": "h1", "name": "Hive 1"}]}
    results = []

    def check(name, got, want_status, want_guard=None):
        status, body = got
        ok = status == want_status and (want_guard is None or body.get("guard") == want_guard)
        results.append({"guard": name, "status": status, "response": body.get("error") if isinstance(body, dict) else str(body), "stopped_it": ok})
        print(f"{'PASS' if ok else 'FAIL'}  {name}: HTTP {status} {body.get('error', '') if isinstance(body, dict) else ''}")

    p = start({"APP_ACCESS_CODE": "test-code-123", "RATE_PER_HOUR": "3", "DAILY_BUDGET_USD": "0"})
    try:
        check("Access code: request without the code is refused", post("/api/scribe", note), 401, "access_code")
        check("Access code: wrong code is refused", post("/api/scribe", note, {"X-Access-Code": "guess"}), 401, "access_code")
        check("Size limit: a 3 MB upload is refused", post("/api/frame", b"x" * 3_000_000, {"X-Access-Code": "test-code-123"}), 413, "size_limit")
        check("Daily budget: with the cap spent, no model call is made", post("/api/scribe", note, {"X-Access-Code": "test-code-123"}), 429, "daily_budget")
        post("/api/scribe", note, {"X-Access-Code": "test-code-123"})  # 2nd counted request
        post("/api/scribe", note, {"X-Access-Code": "test-code-123"})  # 3rd counted request (the limit)
        check("Rate limit: the 4th AI request in an hour is refused", post("/api/scribe", note, {"X-Access-Code": "test-code-123"}), 429, "rate_limit")
        st, _ = get("/.env")
        results.append({"guard": "Secrets: .env is never served", "status": st, "response": "", "stopped_it": st == 404})
        print(f"{'PASS' if st == 404 else 'FAIL'}  Secrets: GET /.env -> {st}")
        st, _ = get("/server.py")
        results.append({"guard": "Secrets: server code is never served", "status": st, "response": "", "stopped_it": st == 404})
        print(f"{'PASS' if st == 404 else 'FAIL'}  Secrets: GET /server.py -> {st}")
        st, _ = get("/%2e%2e/.env")
        results.append({"guard": "Path tricks: /../.env is refused", "status": st, "response": "", "stopped_it": st in (403, 404)})
        print(f"{'PASS' if st in (403, 404) else 'FAIL'}  Path tricks: GET /%2e%2e/.env -> {st}")
    finally:
        p.terminate()
    out = ROOT / "docs" / "data" / "server_guards.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"ran_at": time.strftime("%Y-%m-%d %H:%M"), "results": results}, indent=1))
    print(f"{sum(r['stopped_it'] for r in results)}/{len(results)} guards held. Saved {out}")


if __name__ == "__main__":
    main()
