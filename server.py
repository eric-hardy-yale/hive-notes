"""Hive notes server: serves the phone app (web/) and the AI agents (/api/*).

Run:  python server.py            then open http://localhost:8040
Keys: PORTKEY_API_KEY in .env, in this folder or the folder above it.

Guards on every AI request: optional access code, per-device rate limit, request size limit,
daily dollar cap (agents/llm.py), tool-round limit, and the code checks in agents/checks.py.
"""
from __future__ import annotations

import hmac
import json
import mimetypes
import os
import sys
import time
import traceback
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from agents import advisor, frame_reader, llm, scribe

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
PORT = int(os.getenv("PORT", "8040"))
HOST = os.getenv("HOST", "127.0.0.1" if not os.getenv("RENDER") else "0.0.0.0")
ACCESS_CODE = os.getenv("APP_ACCESS_CODE", "")
RATE_PER_HOUR = int(os.getenv("RATE_PER_HOUR", "60"))
MAX_BODY = 2_500_000
VISION = os.getenv("VISION", "on") != "off"

_hits: dict[str, deque] = defaultdict(deque)
mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("text/javascript", ".js")


def rate_ok(who: str) -> bool:
    now = time.time()
    q = _hits[who]
    while q and now - q[0] > 3600:
        q.popleft()
    if len(q) >= RATE_PER_HOUR:
        return False
    q.append(now)
    return True


class Handler(BaseHTTPRequestHandler):
    server_version = "HiveNotes/1.0"

    def log_message(self, fmt, *args):  # quieter console: one line per API call
        if self.path.startswith("/api/"):
            sys.stderr.write(f"{self.command} {self.path} {args[1] if len(args) > 1 else ''}\n")

    # ---------- helpers ----------
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Access-Code")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _json(self, code: int, obj: dict):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _client(self) -> str:
        fwd = self.headers.get("X-Forwarded-For", "")
        return (fwd.split(",")[0].strip() if fwd else self.client_address[0]) or "?"

    # ---------- routes ----------
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/health":
            return self._json(200, {
                "ok": True, "model": llm.MODEL, "ai": bool(llm.key_source()), "key": llm.key_source(),
                "vision": VISION, "access_code_required": bool(ACCESS_CODE),
                "budget": {"spent_today_usd": round(llm.spent_today(), 5), "daily_cap_usd": llm.DAILY_BUDGET_USD},
                "rate_per_hour": RATE_PER_HOUR,
            })
        if path.startswith("/api/"):
            return self._json(404, {"error": "not found"})
        # static files from web/ only (never the repo root, so .env and code are never served)
        rel = path.lstrip("/") or "index.html"
        target = (WEB / rel).resolve()
        if WEB not in target.parents and target != WEB:
            return self._json(403, {"error": "forbidden"})
        if target.is_dir():
            target = target / "index.html"
        if not target.is_file():
            target = WEB / "index.html" if "." not in rel.split("/")[-1] else None
            if target is None:
                self.send_response(404)
                self.end_headers()
                return
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(str(target))[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if path not in ("/api/scribe", "/api/advise", "/api/ask", "/api/frame"):
            return self._json(404, {"error": "not found"})
        if ACCESS_CODE and not hmac.compare_digest(self.headers.get("X-Access-Code", ""), ACCESS_CODE):
            return self._json(401, {"error": "Wrong or missing access code. Enter it in More → AI helper.", "guard": "access_code"})
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            left = min(n, 10_000_000)  # read and discard (bounded) so the client gets a clean answer
            while left > 0:
                chunk = self.rfile.read(min(65536, left))
                if not chunk:
                    break
                left -= len(chunk)
            self.close_connection = True
            return self._json(413, {"error": "Request too large.", "guard": "size_limit"})
        if not rate_ok(self._client()):
            return self._json(429, {"error": f"Too many AI requests from this device (limit {RATE_PER_HOUR} per hour).", "guard": "rate_limit"})
        try:
            body = json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            return self._json(400, {"error": "Bad JSON"})
        cache = body.get("cache", True) is not False
        try:
            if path == "/api/scribe":
                out = scribe.run(body.get("note", ""), body.get("colonies", []), body.get("last_visits", {}), body.get("today", ""), cache=cache)
            elif path == "/api/advise":
                out = advisor.run(body, cache=cache)
            elif path == "/api/ask":
                q = (body.get("question") or "").strip()
                if not q:
                    return self._json(400, {"error": "Ask a question."})
                out = advisor.run(body, question=q, cache=cache)
            else:
                if not VISION:
                    return self._json(501, {"error": "Photo reading is turned off on this server."})
                out = frame_reader.run(body.get("image", ""), body.get("detail", "low"), cache=cache)
            out["spent_today_usd"] = round(llm.spent_today(), 5)
            return self._json(200, out)
        except llm.BudgetExceeded as e:
            return self._json(429, {"error": str(e), "guard": "daily_budget"})
        except llm.AIUnavailable as e:
            return self._json(503, {"error": str(e), "guard": "no_key"})
        except ValueError as e:
            return self._json(400, {"error": str(e)})
        except Exception as e:  # the model or network failed; the app falls back to its rules
            traceback.print_exc()
            msg = str(e)
            if "401" in msg or "Invalid API Key" in msg:
                msg = "The AI service rejected the API key. Check PORTKEY_API_KEY in .env."
            return self._json(502, {"error": f"AI call failed: {msg[:200]}"})


def main():
    print(f"Hive notes on http://localhost:{PORT}  (model {llm.MODEL})")
    print(f".env read from: {', '.join(llm.ENV_FILES) or 'none found'}")
    print(f"AI: {'on via ' + llm.key_source() if llm.key_source() else 'OFF (no key) — the app still works without AI'}")
    print(f"Guards: daily cap ${llm.DAILY_BUDGET_USD:.2f}, {RATE_PER_HOUR} AI calls/hour per device, access code {'on' if ACCESS_CODE else 'off'}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
