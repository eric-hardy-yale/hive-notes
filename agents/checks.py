"""Code-level guards that run on every agent result. No model calls here, so they are free and testable offline.

1. flag_injection: spots text in keeper notes or questions that tries to give the AI orders.
2. ground_scribe: every field the Scribe fills must quote words the keeper actually said; otherwise it is dropped.
3. check_advice: every number the Advisor uses must come from the tools; treatments must be on the label list;
   no doses; serious findings from the rules engine can't be left out.
"""
from __future__ import annotations

import re

INJECTION_PATTERNS = [
    r"ignore (all |any |the )?(previous|prior|above|earlier) (instructions|rules|prompts?)",
    r"disregard (the |all |your )?(rules|instructions|system)",
    r"(system|developer) prompt",
    r"you are now", r"act as (an?|the) ", r"new instructions", r"jailbreak",
    r"(reveal|print|show|repeat) (me )?(your|the) (instructions|prompt|rules|api key|key|secrets?)",
    r"api[_ ]?key", r"portkey", r"\bopenai\b",
    r"</?(system|keeper_note|question|instructions)>",
    r"(say|tell (me|them)|report) (that )?(the |every |all )?(hives?|colon(y|ies)) (is|are) (fine|healthy|ok)",
]
_INJ = [re.compile(p, re.I) for p in INJECTION_PATTERNS]


def flag_injection(text: str) -> list[str]:
    hits = []
    for rx in _INJ:
        m = rx.search(text or "")
        if m:
            hits.append(m.group(0))
    return hits


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


# The defaults mean "not mentioned"; anything else must be backed by a quote from the note.
SCRIBE_DEFAULTS = {
    "queen": "not_checked", "brood_frames": None, "stores": "unknown", "queen_cells": "not_mentioned",
    "temperament": "not_mentioned", "space": "not_mentioned", "pests": [], "did": [],
    "mite_count": None, "mite_sample": None, "mite_method": "none",
}
RANGES = {"brood_frames": (0, 40), "mite_count": (0, 300), "mite_sample": (50, 1000)}
# Found in a real run: "no eggs" was filed as queen = "eggs". A positive value can't rest on a negative quote.
NEGATION = re.compile(r"\b(no|not|none|never|without|didn'?t|couldn'?t|can'?t|wasn'?t|weren'?t|haven'?t|nothing)\b", re.I)
POSITIVE = {"queen": {"seen", "eggs"}}


def ground_scribe(result: dict, note: str, colony_ids: set[str]) -> dict:
    """Keep only fields backed by the keeper's own words. Returns {"visits": [...], "dropped": [...], "checks": [...]}."""
    note_n = _norm(note)
    dropped, checks, visits = [], [], []
    for v in result.get("visits", []) or []:
        cid = v.get("colony_id")
        if cid not in colony_ids:
            dropped.append(f"Colony '{v.get('heard_as', '?')}' isn't one of your colonies, so it was left out.")
            continue
        quotes = {}
        for ev in v.get("evidence", []) or []:
            q = ev.get("quote", "")
            if q and _norm(q) and _norm(q) in note_n:
                quotes.setdefault(ev.get("field", ""), []).append(q)
            elif q:
                dropped.append(f"{v.get('heard_as', cid)}: quote not found in your note: “{q[:60]}”")
        clean = {"colony_id": cid, "heard_as": v.get("heard_as", ""), "note": (v.get("note") or "")[:300], "evidence": {}}
        for f, default in SCRIBE_DEFAULTS.items():
            val = v.get(f, default)
            if val == default or val in (None, [], ""):
                clean[f] = default
                continue
            lo_hi = RANGES.get(f)
            if lo_hi and not (isinstance(val, (int, float)) and lo_hi[0] <= val <= lo_hi[1]):
                dropped.append(f"{v.get('heard_as', cid)}: {f}={val} is out of range, dropped.")
                clean[f] = default
                continue
            key = "mite" if f.startswith("mite_") else f
            if f in POSITIVE and val in POSITIVE[f] and quotes.get(f) and all(NEGATION.search(q) for q in quotes[f]):
                dropped.append(f"{v.get('heard_as', cid)}: {f} = {val} came from words that say the opposite (“{quotes[f][0]}”), so it was not filled in.")
                clean[f] = default
                continue
            if quotes.get(f) or (key == "mite" and quotes.get("mites")):
                clean[f] = val
                clean["evidence"][f] = (quotes.get(f) or quotes.get("mites"))[0]
            else:
                dropped.append(f"{v.get('heard_as', cid)}: {f} = {val} had no quote from your note, so it was not filled in.")
                clean[f] = default
        checks.append(f"{clean['heard_as'] or cid}: {len(clean['evidence'])} field(s) backed by your words")
        visits.append(clean)
    return {"visits": visits, "dropped": dropped, "checks": checks}


# ---------------- advisor ----------------
ALLOWED_TREATMENTS = ["Apivar", "Formic Pro", "Apiguard", "Oxalic", "HopGuard"]
OTHER_PRODUCTS = ["Apistan", "CheckMite", "fluvalinate", "coumaphos", "Mite-Away", "MAQS", "thymovar", "Bayvarol", "Amitraz"]
DOSE_RX = re.compile(r"\b\d+(\.\d+)?\s*(strips?|grams?|g\b|ml|mL|milliliters?|tablespoons?|tbsp|teaspoons?|tsp|cc|doses?)\b", re.I)
NUM_RX = re.compile(r"(?<![\w.])-?\d+(?:\.\d+)?")


def _numbers(text: str) -> set[str]:
    out = set()
    for m in NUM_RX.findall(text or ""):
        try:
            f = float(m)
        except ValueError:
            continue
        f = abs(f)
        out.add(str(int(f)) if f == int(f) else str(f))
    return out


def _all_text(obj) -> str:
    if isinstance(obj, dict):
        return " ".join(_all_text(v) for v in obj.values())
    if isinstance(obj, list):
        return " ".join(_all_text(v) for v in obj)
    return str(obj)


def check_advice(out: dict, tool_text: str, findings: list[dict], afb_flag: bool = False) -> list[str]:
    """Return a list of problems. Empty list = passed."""
    problems = []
    if not any([(out.get("headline") or "").strip(), (out.get("answer") or "").strip(), out.get("do_next"), out.get("expect")]):
        return ["the answer was blank"]  # seen in live runs: an all-empty JSON after a tool call
    text = _all_text({k: v for k, v in out.items() if k not in ("sources_used",)})
    allowed_nums = _numbers(tool_text) | {"0", "1", "2", "3", "7", "10", "14", "21", "24", "48", "50", "57", "60", "300", "32", "1", "100"}
    # dates in the forecast like 2026-11-24 also allow "24" and "11"
    for d in re.findall(r"\d{4}-(\d{2})-(\d{2})", tool_text):
        allowed_nums |= {str(int(d[0])), str(int(d[1]))}
    stray = sorted(n for n in _numbers(text) - allowed_nums if len(n) <= 6)
    if stray:
        problems.append(f"uses numbers not found in the records or forecast: {', '.join(stray[:6])}")
    for p in OTHER_PRODUCTS:
        if re.search(rf"\b{re.escape(p)}\b", text, re.I):
            problems.append(f"mentions {p}, which is not on the app's treatment list")
    if DOSE_RX.search(text):
        problems.append(f"gives a dose ('{DOSE_RX.search(text).group(0)}'); doses must come from the label")
    for f in findings:
        if f.get("level") == "risk" and f.get("key"):
            words = {"feed": ["feed", "syrup", "fondant", "sugar"], "mites": ["mite", "treat", "wash"], "strips": ["strip", "remove"],
                     "queen": ["queen", "egg"], "swarm": ["swarm", "split", "space"], "afb": ["apiarist", "inspector"]}.get(f["key"], [f["key"]])
            if not any(w in text.lower() for w in words):
                problems.append(f"leaves out a high-risk finding: {f.get('title')}")
    if afb_flag and not re.search(r"apiarist|inspector", text, re.I):
        problems.append("possible foulbrood but no advice to contact the state apiarist")
    return problems
