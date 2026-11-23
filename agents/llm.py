"""One place that talks to the model: keys, prices, token counts, the spending cap and the tool loop.

Model: gpt-6-luna through Portkey (the course key). Every call records input, cached-input and
output tokens from the API's own usage report, and refuses to run once today's budget is spent.
"""
from __future__ import annotations

import json
import os
import threading
import time
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GUIDE = (Path(__file__).parent / "guide.md").read_text(encoding="utf-8")
LOG_DIR = ROOT / "logs"
USAGE_LOG = LOG_DIR / "usage.jsonl"

MODEL = "gpt-6-luna"  # the only model allowed on the course key
PORTKEY_BASE_URL = "https://api.portkey.ai/v1"
# OpenAI standard prices per 1M tokens for gpt-6-luna (MGT 409 Lecture 11)
PRICES = {"input": 0.10, "cached_input": 0.01, "cache_write": 0.125, "output": 0.50}
MAX_TOOL_ROUNDS = 4  # an agent gets at most this many rounds of tool calls, then must answer


def load_env() -> list[str]:
    """Read .env from the repo folder first, then the folder above it (where the graders keep theirs).
    Values already in the environment (e.g. set on the cloud host) are never overwritten."""
    found = []
    for p in (ROOT / ".env", ROOT.parent / ".env"):
        if not p.is_file():
            continue
        found.append(str(p))
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k = k.strip().removeprefix("export ").strip()
            v = v.strip().strip('"').strip("'")
            if k and v and k not in os.environ:
                os.environ[k] = v
    return found


ENV_FILES = load_env()
DAILY_BUDGET_USD = float(os.getenv("DAILY_BUDGET_USD", "1.00"))
MAX_OUTPUT_TOKENS = int(os.getenv("MAX_OUTPUT_TOKENS", "1500"))


class BudgetExceeded(Exception):
    pass


class AIUnavailable(Exception):
    pass


def key_source() -> str:
    if os.getenv("PORTKEY_API_KEY"):
        return "PORTKEY_API_KEY"
    if os.getenv("OPENAI_API_KEY"):
        return "OPENAI_API_KEY"
    return ""


_client = None


def client():
    """OpenAI SDK client pointed at Portkey (course key), or straight at OpenAI if only OPENAI_API_KEY is set."""
    global _client
    if _client is not None:
        return _client
    try:
        from openai import OpenAI
    except ImportError as e:  # pragma: no cover
        raise AIUnavailable("The 'openai' package is missing. Run: pip install -r requirements.txt") from e
    if os.getenv("PORTKEY_API_KEY"):
        _client = OpenAI(
            api_key=os.environ["PORTKEY_API_KEY"],
            base_url=PORTKEY_BASE_URL,
            default_headers={
                "x-portkey-provider": "openai",
                # Skip Portkey's response cache so token counts are real model calls, not replays.
                "x-portkey-cache-force-refresh": "true",
            },
            timeout=60,
            max_retries=1,
        )
    elif os.getenv("OPENAI_API_KEY"):
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"], timeout=60, max_retries=1)
    else:
        raise AIUnavailable("No API key. Put PORTKEY_API_KEY in .env (this folder or the one above it).")
    return _client


# ---------------- spending ----------------
_lock = threading.Lock()
_spent = {"day": None, "usd": 0.0}


def _load_today() -> float:
    today = date.today().isoformat()
    total = 0.0
    if USAGE_LOG.is_file():
        for line in USAGE_LOG.read_text(encoding="utf-8").splitlines():
            try:
                r = json.loads(line)
            except ValueError:
                continue
            if r.get("day") == today:
                total += r.get("cost_usd", 0.0)
    return total


def spent_today() -> float:
    with _lock:
        today = date.today().isoformat()
        if _spent["day"] != today:
            _spent["day"], _spent["usd"] = today, _load_today()
        return _spent["usd"]


def check_budget() -> None:
    if spent_today() >= DAILY_BUDGET_USD:
        raise BudgetExceeded(f"Today's AI budget (${DAILY_BUDGET_USD:.2f}) is used up. It resets at midnight.")


def cost_of(u: dict) -> float:
    # input_tokens already include cache reads and cache writes
    w = u.get("cache_write", 0)
    uncached = max(u["input"] - u["cached"] - w, 0)
    return (uncached * PRICES["input"] + u["cached"] * PRICES["cached_input"] + w * PRICES["cache_write"] + u["output"] * PRICES["output"]) / 1e6


def record(agent: str, u: dict, extra: dict | None = None) -> dict:
    u = dict(u)
    u["cost_usd"] = round(cost_of(u), 8)
    row = {"t": round(time.time(), 1), "day": date.today().isoformat(), "agent": agent, **u, **(extra or {})}
    LOG_DIR.mkdir(exist_ok=True)
    with _lock:
        with USAGE_LOG.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row) + "\n")
        if _spent["day"] == row["day"]:
            _spent["usd"] += u["cost_usd"]
    return u


def usage_of(resp) -> dict:
    u = resp.usage
    cached = write = 0
    details = getattr(u, "prompt_tokens_details", None)
    if details is not None:
        cached = getattr(details, "cached_tokens", 0) or 0
        write = getattr(details, "cache_write_tokens", 0) or (getattr(details, "model_extra", None) or {}).get("cache_write_tokens", 0) or 0
    return {"input": u.prompt_tokens or 0, "cached": cached, "cache_write": write, "output": u.completion_tokens or 0}


def add_usage(a: dict, b: dict) -> dict:
    return {k: a.get(k, 0) + b.get(k, 0) for k in ("input", "cached", "cache_write", "output")}


# ---------------- one agent run ----------------
def run_agent(agent: str, system: str, user_content, *, schema: dict, tools: list | None = None,
              tool_impl: dict | None = None, cache: bool = True, max_output: int | None = None) -> dict:
    """Run one agent: system prompt (static, cached) + user turn, optional tool loop, strict JSON output.

    Returns {"output": dict, "usage": {...}, "calls": n, "trace": [...]}.
    """
    check_budget()
    c = client()
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user_content}]
    total = {"input": 0, "cached": 0, "cache_write": 0, "output": 0}
    trace = []
    kw = {
        "model": MODEL,
        "max_completion_tokens": max_output or MAX_OUTPUT_TOKENS,
        "response_format": {"type": "json_schema", "json_schema": {"name": f"{agent}_output", "strict": True, "schema": schema}},
    }
    if cache:
        kw["prompt_cache_key"] = f"hive-notes-{agent}"
    if tools:
        kw["tools"] = tools
        # gpt-6-luna on chat completions only allows function tools with reasoning turned off
        kw["reasoning_effort"] = "none"
    for round_no in range(MAX_TOOL_ROUNDS + 1):
        if round_no == MAX_TOOL_ROUNDS and tools:
            kw["tool_choice"] = "none"  # loop guard: last round must answer, no more tool calls
        check_budget()
        t0 = time.time()
        resp = c.chat.completions.create(messages=messages, **kw)
        u = usage_of(resp)
        total = add_usage(total, u)
        msg = resp.choices[0].message
        calls = msg.tool_calls or []
        trace.append({"round": round_no + 1, "seconds": round(time.time() - t0, 2), "usage": u,
                      "tool_calls": [{"name": tc.function.name, "args": tc.function.arguments} for tc in calls]})
        if calls and tools:
            messages.append({"role": "assistant", "content": msg.content or None,
                             "tool_calls": [{"id": tc.id, "type": "function", "function": {"name": tc.function.name, "arguments": tc.function.arguments}} for tc in calls]})
            for tc in calls:
                fn = (tool_impl or {}).get(tc.function.name)
                try:
                    args = json.loads(tc.function.arguments or "{}")
                    result = fn(**args) if fn else {"error": f"no tool named {tc.function.name}"}
                except Exception as e:  # a tool failing must not crash the run
                    result = {"error": str(e)[:200]}
                trace[-1].setdefault("tool_results", []).append({"name": tc.function.name, "result": result})
                messages.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(result)[:6000]})
            continue
        text = msg.content or "{}"
        try:
            out = json.loads(text)
        except ValueError:
            out = {"_error": "model returned text that is not JSON", "_raw": text[:500]}
        usage = record(agent, total, {"rounds": round_no + 1, "cache": cache})
        return {"output": out, "usage": usage, "calls": round_no + 1, "trace": trace}
    usage = record(agent, total, {"rounds": MAX_TOOL_ROUNDS + 1, "cache": cache, "loop_guard": True})
    return {"output": {"_error": "agent hit the tool-round limit"}, "usage": usage, "calls": MAX_TOOL_ROUNDS + 1, "trace": trace}
