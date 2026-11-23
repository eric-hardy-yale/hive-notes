"""Pull the real AI token log out of a phone backup (More → Back up) from the field test.

    python tests/field_usage.py path/to/hive-backup-2026-11-23.json

Writes docs/data/usage_from_field.json (per-agent averages) — no notes, photos or locations are copied.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main(path: str):
    d = json.loads(Path(path).read_text())
    log = [x for x in d.get("aiLog", []) if x.get("ok")]
    blocked = [x for x in d.get("aiLog", []) if not x.get("ok")]
    by = {}
    for x in log:
        b = by.setdefault(x["agent"], {"n": 0, "input": 0, "cached": 0, "output": 0, "cost": 0.0})
        b["n"] += 1
        for k in ("input", "cached", "output"):
            b[k] += x.get(k) or 0
        b["cost"] += x.get("cost") or 0
    avg = {a: {"n": b["n"], **{k: b[k] / b["n"] for k in ("input", "cached", "output", "cost")}} for a, b in by.items()}
    out = {"calls": len(log), "blocked": [{"agent": x["agent"], "error": x.get("error"), "guard": x.get("guard")} for x in blocked],
           "by_agent": avg, "total_cost": sum(b["cost"] for b in by.values()),
           "visits": len(d.get("visits", [])), "colonies": len([c for c in d.get("colonies", []) if c.get("status") == "active"])}
    dst = ROOT / "docs" / "data" / "usage_from_field.json"
    dst.write_text(json.dumps(out, indent=1))
    print(json.dumps(out, indent=1))
    print("Saved", dst)


if __name__ == "__main__":
    main(sys.argv[1])
