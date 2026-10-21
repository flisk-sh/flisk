#!/usr/bin/env python3
# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""Drive the Go development loop of a running `flisk up` project and check what it does (#369).

Called by tests/e2e/journeys/dev-loop/go-dev-loop.sh. It edits main.go, polls the service through Traefik every 25 ms, reads Tilt's own log, and exits 1
if an acceptance check fails:

  1. each valid edit is served without recreating the container or rebuilding the image,
  2. the app is never down for long during an edit: a stretch of refused connections or 502s (the swap gap) must be no longer than
     max(1 s, 30% of that edit's edit-to-ready time). The old build has to keep serving while the new one compiles; a watcher that
     stops the app first is down for the whole compile and fails this. A Traefik 503 (its 10 s health check removed the route while
     the app restarted) is reported, not failed: it is Traefik's behaviour, not the watcher's,
  3. a broken edit puts the compiler error in Tilt's log and the last good build keeps serving,
  4. the next valid edit is served again,
  5. a go.mod change takes the dependency path: Tilt rebuilds the image and recreates the container, and the new response is served.

usage: go-dev-loop-probe.py <main.go> <traefik-port> <host> <route> <container> <tilt-port> <edits> [--max-ready S]
"""

from __future__ import annotations

import argparse
import datetime
import http.client
import os
import re
import statistics
import subprocess
import sys
import threading
import time

ap = argparse.ArgumentParser()
ap.add_argument("main_go")
ap.add_argument("traefik_port")
ap.add_argument("host")
ap.add_argument("route")
ap.add_argument("container")
ap.add_argument("tilt_port")
ap.add_argument("edits", type=int)
ap.add_argument("--max-ready", type=float, default=20.0)
args = ap.parse_args()

# Connect to loopback directly so a route can never select a URL scheme or host.
if (
    not args.traefik_port.isdigit()
    or not 1 <= int(args.traefik_port) <= 65535
    or not args.route.startswith("/")
    or args.route.startswith("//")
    or any(ord(char) < 0x20 for char in args.route)
):
    ap.error("traefik_port must be in 1..65535 and route must be a path starting with a single /")
failures: list[str] = []
samples: list[tuple[float, str]] = []  # (time, "200 <version>" | "HTTP 502" | "ERR ...")
stop = False


def sh(*cmd: str) -> str:
    return subprocess.run(cmd, capture_output=True, text=True).stdout.strip()


def tilt_log() -> str:
    return sh("tilt", "--port", args.tilt_port, "logs", "api")


def probe_once() -> str:
    conn = http.client.HTTPConnection("127.0.0.1", int(args.traefik_port), timeout=1)
    try:
        conn.request("GET", args.route, headers={"Host": args.host})
        response = conn.getresponse()
        if response.status == 200:
            m = re.search(r'"version":"([^"]*)"', response.read().decode())
            return f"200 {m.group(1) if m else '?'}"
        return f"HTTP {response.status}"
    except (OSError, http.client.HTTPException) as e:  # connection refused, reset, timeout
        return f"ERR {type(e).__name__}"
    finally:
        conn.close()


def poll() -> None:
    while not stop:
        samples.append((time.time(), probe_once()))
        time.sleep(0.025)


def read_source() -> str:
    with open(args.main_go) as f:
        return f.read()


def write_source(text: str) -> float:
    t = time.time()
    with open(args.main_go, "w") as f:
        f.write(text)
    return t


def set_version(src: str, version: str) -> str:
    out, n = re.subn(r'"version":\s*"[^"]*"', f'"version":   "{version}"', src)
    assert n == 1, "scaffold main.go no longer has the version field this probe edits"
    return out


def served_since(t0: float, version: str) -> float | None:
    for t, s in list(samples):
        if t >= t0 and s == f"200 {version}":
            return t
    return None


def wait_served(t0: float, version: str, limit: float) -> float | None:
    while time.time() - t0 < limit:
        t = served_since(t0, version)
        if t is not None:
            return t - t0
        time.sleep(0.025)
    return None


def outages(t0: float, t1: float) -> tuple[float, float]:
    """(longest stretch of refused connections or 502s, total seconds of HTTP 503) inside [t0, t1]."""
    window = [(t, s) for t, s in samples if t0 <= t <= t1]
    hard, run_start, run_end = 0.0, None, None
    seconds_503 = 0.0
    for i, (t, s) in enumerate(window):
        nxt = window[i + 1][0] if i + 1 < len(window) else t1
        if s == "HTTP 503":
            seconds_503 += nxt - t
        if not s.startswith("200") and s != "HTTP 503":
            run_start = t if run_start is None else run_start
            run_end = nxt
            hard = max(hard, run_end - run_start)
        else:
            run_start = None
    return hard, seconds_503


def rebuild_times() -> list[tuple[str, float]]:
    """(outcome, seconds) per watcher cycle, from the container's own timestamps: "change detected" to "rebuilt" or "build failed"."""
    out = subprocess.run(["docker", "logs", "-t", args.container], capture_output=True, text=True)
    stamp = re.compile(r"^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)\.(\d{1,9})Z (.*)$")
    cycles: list[tuple[str, float]] = []
    started = None
    for line in (out.stdout + out.stderr).splitlines():
        m = stamp.match(line)
        if not m:
            continue
        t = datetime.datetime.strptime(m.group(1), "%Y-%m-%dT%H:%M:%S").replace(tzinfo=datetime.timezone.utc).timestamp()
        t += float("0." + m.group(2))
        if "[flisk] change detected" in m.group(3):
            started = t
        elif started is not None and "[flisk] rebuilt and restarted" in m.group(3):
            cycles.append(("ok", t - started))
            started = None
        elif started is not None and "[flisk] build failed" in m.group(3):
            cycles.append(("failed", t - started))
            started = None
    return cycles


def identity() -> tuple[str, str, str]:
    """(container id, image id, start time)."""
    return (
        sh("docker", "inspect", "-f", "{{.Id}}", args.container),
        sh("docker", "inspect", "-f", "{{.Image}}", args.container),
        sh("docker", "inspect", "-f", "{{.State.StartedAt}}", args.container),
    )


original = read_source()
th = threading.Thread(target=poll)
th.start()
try:
    # The caller waited for the first 200, so the scaffold's own response is already being served.
    time.sleep(1)
    base_version = re.search(r'"version":\s*"([^"]*)"', original).group(1)  # type: ignore[union-attr]
    if samples[-1][1] != f"200 {base_version}":
        failures.append(f"before any edit the service answered {samples[-1][1]!r}, expected 200 {base_version}")
    before = identity()

    ready: list[float] = []
    rows: list[tuple[int, float, float, float]] = []  # edit, ready, hard outage, seconds of 503
    version = base_version
    for i in range(1, args.edits + 1):
        version = f"2.0.{i}"
        t0 = write_source(set_version(original, version))
        took = wait_served(t0, version, args.max_ready)
        if took is None:
            failures.append(f"edit {i}: {version} was not served within {args.max_ready:.0f}s")
            continue
        time.sleep(1.0)  # keep sampling past the swap so a late 503 from a Traefik health check would show up
        hard, seconds_503 = outages(t0, time.time())
        ready.append(took)
        rows.append((i, took, hard, seconds_503))
        if seconds_503 > 0:
            # Not a failure (Traefik's 10 s health check removed the route while the app restarted, which the watcher cannot
            # control and which would make this check flaky), but a client saw it, so say so loudly.
            print(f"WARNING: edit {i}: Traefik answered 503 for {seconds_503:.1f}s while the app restarted")
        limit = max(1.0, 0.3 * took)
        if hard > limit:
            failures.append(
                f"edit {i}: the app was unreachable for {hard:.2f}s (limit {limit:.2f}s = max(1s, 30% of {took:.2f}s)); "
                "the old build must keep serving while the new one compiles"
            )
        time.sleep(2.0)

    after = identity()
    if before != after:
        failures.append(f"the container or image changed during live edits (before {before}, after {after}): an image was rebuilt")

    # A broken edit: the compiler error reaches Tilt's log and the last good build keeps serving.
    good_version = version
    # A package-level reference to a name that does not exist fails to compile whatever the service looks like.
    broken = set_version(original, "9.9.9") + "\nvar _ = undefinedHandlerForTdkProbe\n"
    t_broken = write_source(broken)
    deadline = time.time() + 40
    while time.time() < deadline and "undefinedHandlerForTdkProbe" not in tilt_log():
        time.sleep(0.5)
    log = tilt_log()
    if "undefinedHandlerForTdkProbe" not in log:
        failures.append("the compiler error never appeared in Tilt's log")
    time.sleep(2.0)
    # Every sample from the broken edit on, not just the last few: an app that was stopped and restarted would have recovered by now.
    since = [s for t, s in samples if t >= t_broken]
    still = [s for s in since]
    interrupted = [s for s in since if not s.startswith("200") and s != "HTTP 503"]
    if interrupted:
        failures.append(f"the service was interrupted by the broken edit ({len(interrupted)} refused or failed requests, first {interrupted[0]!r})")
    if not still or still[-1] != f"200 {good_version}" or any(s.startswith("200") and s != f"200 {good_version}" for s in still):
        failures.append(f"after the broken edit the service did not keep serving {good_version}: last answers {still[-3:]}")
    if any(s == "200 9.9.9" for _, s in samples):
        failures.append("the broken edit was served")
    print(f"broken edit: compiler error in Tilt log: {'undefinedHandlerForTdkProbe' in log}; still serving {good_version}: {bool(still) and still[-1] == f'200 {good_version}'}")
    for line in log.splitlines():
        if "undefinedHandlerForTdkProbe" in line or "build failed" in line:
            print(f"  tilt log: {line.strip()}")

    # Recovery: the next valid edit restarts the service.
    t_fix = write_source(set_version(original, "3.0.0"))
    took = wait_served(t_fix, "3.0.0", args.max_ready)
    if took is None:
        failures.append("the service did not recover after the broken edit was fixed")
    print(f"recovery after the fix: {'served after %.2fs' % took if took is not None else 'NOT SERVED'}")

    # A dependency file cannot be picked up by a restart: it falls back to an image rebuild, which recreates the container.
    # Read the rebuild times first; the container's log starts over after the recreate.
    cycles = [secs for outcome, secs in rebuild_times() if outcome == "ok"]
    go_mod = os.path.join(os.path.dirname(args.main_go), "go.mod")
    with open(go_mod) as f:
        go_mod_text = f.read()
    before_dep = identity()
    t_dep = time.time()
    with open(go_mod, "w") as f:
        f.write(go_mod_text + "\n// tdk-probe: dependency file changed\n")
    write_source(set_version(original, "4.0.0"))
    dep_took = wait_served(t_dep, "4.0.0", 300.0)
    after_dep = identity()
    if dep_took is None:
        failures.append("after a go.mod change the rebuilt service was not served within 300s")
    elif before_dep[1] == after_dep[1]:
        failures.append("a go.mod change was applied without rebuilding the image")
    elif before_dep[0] == after_dep[0]:
        failures.append("a go.mod change rebuilt the image but did not recreate the container")
    print(f"go.mod change: image rebuilt: {before_dep[1] != after_dep[1]}, container recreated: {before_dep[0] != after_dep[0]}; new response served after "
          f"{'%.1fs' % dep_took if dep_took is not None else 'NEVER'}")

    # Cycles are in order: one per valid edit, then the recovery edit. Only trust the pairing when the counts agree.
    paired = len(cycles) == len(rows) + (1 if took is not None else 0)
    print()
    print(f"{'edit':<6}{'edit-to-ready':>15}{'rebuild':>10}{'sync+poll':>11}{'app down':>10}{'503':>7}")
    for k, (i, took_i, hard, s503) in enumerate(rows):
        rebuild = f"{cycles[k]:.2f}s" if paired else "n/a"
        other = f"{took_i - cycles[k]:.2f}s" if paired else "n/a"
        print(f"{i:<6}{took_i:>14.2f}s{rebuild:>10}{other:>11}{hard:>9.2f}s{s503:>6.1f}s")
    if ready:
        s = sorted(ready)
        print(f"warm edit-to-ready over {len(s)} edits: min {s[0]:.2f}s, median {statistics.median(s):.2f}s, max {s[-1]:.2f}s")
        if paired:
            r = sorted(cycles[: len(rows)])
            print(f"in-container rebuild (change detected to restarted): min {r[0]:.2f}s, median {statistics.median(r):.2f}s, max {r[-1]:.2f}s")
        print(f"longest app-down stretch: {max(h for _, _, h, _ in rows):.2f}s; edits with an HTTP 503 from Traefik: {sum(1 for r_ in rows if r_[3] > 0)} of {len(rows)}")
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
