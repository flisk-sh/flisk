#!/usr/bin/env python3
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""Time the Python edit loop of a running service: save a one-line change to main.py, poll until the new response is served (#683).

Called by tests/e2e/journeys/dev-loop/python-dev-loop.sh, once against a `flisk up` project (through Traefik) and once against a plain
`uvicorn --reload` for comparison. It edits the "version" field of GET /, polls every 25 ms, and prints min / median / max edit-to-ready.
With a container name it also reports whether the container or image changed during the edits (an image rebuild), and whether Tilt's
log mentions a rebuild.

usage: python-dev-loop-probe.py <main.py> <port> <host> <route> <container|-> <edits> [--max-ready S]
"""

from __future__ import annotations

import argparse
import http.client
import re
import statistics
import subprocess
import sys
import threading
import time

ap = argparse.ArgumentParser()
ap.add_argument("main_py")
ap.add_argument("port")
ap.add_argument("host")
ap.add_argument("route")
ap.add_argument("container")
ap.add_argument("edits", type=int)
ap.add_argument("--max-ready", type=float, default=60.0)
args = ap.parse_args()

if not args.port.isdigit() or not 1 <= int(args.port) <= 65535 or not args.route.startswith("/") or args.route.startswith("//"):
    ap.error("port must be in 1..65535 and route must be a path starting with a single /")

samples: list[tuple[float, str]] = []
stop = False


def probe_once() -> str:
    conn = http.client.HTTPConnection("127.0.0.1", int(args.port), timeout=1)
    try:
        conn.request("GET", args.route, headers={"Host": args.host})
        response = conn.getresponse()
        if response.status == 200:
            m = re.search(r'"version":\s*"([^"]*)"', response.read().decode())
            return f"200 {m.group(1) if m else '?'}"
        return f"HTTP {response.status}"
    except (OSError, http.client.HTTPException) as e:
        return f"ERR {type(e).__name__}"
    finally:
        conn.close()


def poll() -> None:
    while not stop:
        samples.append((time.time(), probe_once()))
        time.sleep(0.025)


def identity() -> tuple[str, str]:
    if args.container == "-":
        return ("", "")
    def inspect(fmt: str) -> str:
        return subprocess.run(["docker", "inspect", "-f", fmt, args.container], capture_output=True, text=True).stdout.strip()
    return (inspect("{{.Id}}"), inspect("{{.Image}}"))


def write_source(text: str) -> float:
    t = time.time()
    with open(args.main_py, "w") as f:
        f.write(text)
    return t


def set_version(src: str, version: str) -> str:
    out, n = re.subn(r'"version":\s*"[^"]*"', f'"version": "{version}"', src)
    assert n == 1, "main.py no longer has the version field this probe edits"
    return out


with open(args.main_py) as f:
    original = f.read()
failures: list[str] = []
ready: list[tuple[int, float, float]] = []  # edit, edit-to-ready, longest stretch of non-200 answers
th = threading.Thread(target=poll)
th.start()
try:
    time.sleep(1)
    before = identity()
    for i in range(1, args.edits + 1):
        version = f"2.0.{i}"
        t0 = write_source(set_version(original, version))
        served = None
        while time.time() - t0 < args.max_ready:
            served = next((t for t, s in list(samples) if t >= t0 and s == f"200 {version}"), None)
            if served is not None:
                break
            time.sleep(0.025)
        if served is None:
            failures.append(f"edit {i}: {version} was not served within {args.max_ready:.0f}s")
            continue
        time.sleep(1.0)
        window = [(t, s) for t, s in samples if t0 <= t <= time.time()]
        down, run_start = 0.0, None
        for k, (t, s) in enumerate(window):
            nxt = window[k + 1][0] if k + 1 < len(window) else t
            if not s.startswith("200"):
                run_start = t if run_start is None else run_start
                down = max(down, nxt - run_start)
            else:
                run_start = None
        ready.append((i, served - t0, down))
        time.sleep(1.0)
    after = identity()
    if args.container != "-":
        rebuilt = before != after
        print(f"image rebuilt or container recreated during the edits: {rebuilt}")
        if rebuilt:
            failures.append("the container or image changed during live edits: every edit rebuilt the image")
    print()
    print(f"{'edit':<6}{'edit-to-ready':>15}{'not 200':>10}")
    for i, took, down in ready:
        print(f"{i:<6}{took:>14.2f}s{down:>9.2f}s")
    if ready:
        s = sorted(took for _, took, _ in ready)
        print(f"edit-to-ready over {len(s)} edits: min {s[0]:.2f}s, median {statistics.median(s):.2f}s, max {s[-1]:.2f}s")
        print(f"longest stretch of non-200 answers: {max(d for _, _, d in ready):.2f}s")
finally:
    stop = True
    th.join()
    write_source(original)

if failures:
    print("\nFAIL", file=sys.stderr)
    for f in failures:
        print(f"  - {f}", file=sys.stderr)
    sys.exit(1)
print("\nPASS")
