# Quickstart timing: is "Zero-Config Local Stacks in 3 Seconds" true?

Measured for [#1443](https://github.com/flisk-sh/tdk-cli-core/issues/1443). This page records
what was observed on one machine. It does not change the README headline.

## Result

| Run | Condition | `flisk up shop` launch → orders API returns 200 |
| --- | --- | --- |
| 1 | After `flisk down`; Docker image layers from an earlier run still present | **12.807 s** |
| 2 | After `flisk down`; warm (same layers) | **13.847 s** |

Both runs are above 3 seconds. The warm run is **not** under 3 seconds.

## Environment

- Date: 2026-10-18 (local time, CEST)
- OS: macOS 26.5.2 (build 25F84), Darwin 25.5.0, arm64 host
- Docker Engine: 29.8.2
- flisk: 1.3.178 (`flisk --version`)

## Commands

Scratch project, outside the repository:

```bash
mkdir shop && cd shop
flisk project --yes
flisk resource orders-api --type backend --stack shop --yes
```

Timed run (`timed-up.sh`, the timer wraps the launch and a readiness poll):

```bash
# T0 = time of launch (Time::HiRes), then:
flisk up shop
# poll until the Traefik route answers 200:
curl -s -o /dev/null -w '%{http_code}' http://api.shop.localhost/api/orders
# T1 = time of first 200; elapsed = T1 - T0
flisk down
```

Between runs: `flisk down` from the project directory, then the same timed command again.

Readiness is measured at `http://api.shop.localhost/api/orders` because port 4000 is not
published to the host (the orders API is reached through Traefik). `flisk up` does not exit while
Tilt runs, so the wall clock of the `flisk up` process itself is not a usable measurement.

`date +%s` was not used for the numbers above: it has one-second resolution. The timings come from
`perl -MTime::HiRes`, which gives millisecond resolution.

## Cold versus warm

A true cold run (no cached images or build layers) was **not** measured. Running
`docker image prune -af` would remove every unused image on this machine, including images other
projects use, so it was not run. Run 1 and run 2 both reused layers from an earlier scratch
run of the same project; the Tilt log shows `[cached]` on the build steps.

## Raw output (tail)

Run 1:

```
   orders-api │ 🚀 orders-api running on http://localhost:4000
   orders-api │ 📊 Health check: http://localhost:4000/health
   orders-api │ 
   orders-api │ Started development server: http://localhost:4000
Flisk is up.
Tilt UI: http://localhost:10350
App URLs:
  run: flisk networks
Stop: flisk down
```

Run 2:

```
   orders-api │      Step 1 - 2.30s (Building Dockerfile: [shop_shop_orders-api:dev])
   orders-api │      Step 2 - 1.01s (Deploying)
   orders-api │      DONE IN: 3.33s 
   orders-api │ 
Flisk is up.
Tilt UI: http://localhost:10350
App URLs:
  run: flisk networks
Stop: flisk down
```

The "Flisk is up." line is printed by flisk and does not carry a timestamp, so it is not used as the
end point. The end point is the first 200 from the orders route.

## Not covered

- True cold start (empty Docker cache, first `bun install` on a fresh machine).
- Other hosts, Docker runtimes, or CI runners.
- Whether the 3-second claim could hold with the stack already running or with prebuilt images.
