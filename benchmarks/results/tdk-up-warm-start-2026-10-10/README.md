# Manual `tdk up` measurement, 2026-10-10 (tdk-restaurant-example)

The numbers in the [#1023 comment](https://github.com/tdk-landscape/tdk-cli-core/issues/1023#issuecomment-6102763932) come from this run. It was made by hand before `scripts/benchmark/tdk-up-warm-start.sh` existed, so it has **no recorded wall time**, and its per-run settled check used a fixed 60-second wait. The span (first to last Tilt build) is valid. The published, reproducible run is [`tdk-up-warm-start-2026-10-11`](../tdk-up-warm-start-2026-10-11/summary.md).

- `cold-1/durations.txt`, `warm-1/`, `warm-2/`, `warm-3/durations.txt`: per-resource build times from `tilt-build-durations.mjs`.
- `warm-vm-samples.txt` and `warm-vm-result.txt`: Docker VM memory sampled during one warm start (MiB, every 3 s).
