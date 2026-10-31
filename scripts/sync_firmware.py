#!/usr/bin/env python3
"""Copy public paretoamp factory .bin files into _site/firmware/<tag>/."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO = "geelenaudio/paretoamp"
API = f"https://api.github.com/repos/{REPO}/releases?per_page=30"


def main() -> int:
    dest_root = Path(sys.argv[1] if len(sys.argv) > 1 else "_site/firmware")
    dest_root.mkdir(parents=True, exist_ok=True)
    raw = subprocess.check_output(
        ["curl", "-fsSL", "-H", "Accept: application/vnd.github+json", API]
    )
    releases = json.loads(raw)
    copied = 0
    for rel in releases:
        if rel.get("draft"):
            continue
        tag = rel.get("tag_name") or ""
        assets = [
            a
            for a in rel.get("assets") or []
            if a.get("name", "").startswith("pareto-amp-") and a["name"].endswith(".bin")
        ]
        if not tag or not assets:
            continue
        dest = dest_root / tag
        dest.mkdir(parents=True, exist_ok=True)
        for asset in assets:
            url = f"https://github.com/{REPO}/releases/download/{tag}/{asset['name']}"
            target = dest / asset["name"]
            print(f"fetch {tag}/{asset['name']}", flush=True)
            subprocess.check_call(["curl", "-fsSL", "-L", "-o", str(target), url])
            copied += 1
    print(f"copied {copied} factory images")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
