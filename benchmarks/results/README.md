# Benchmark results

Measured results committed to the repository. Each file or folder is one published run; the machine and tool versions are recorded inside it.

| Result | What it measures | Where to read it |
|---|---|---|
| [`tdk-up-warm-start-2026-10-11/`](tdk-up-warm-start-2026-10-11/README.md) | `flisk up` on `tdk-restaurant-example`: one cold and three warm starts, on macOS | [summary](tdk-up-warm-start-2026-10-11/summary.md) · [chart](tdk-up-warm-start-2026-10-11/span.svg) |
| [`tdk-up-warm-start-2026-10-10/`](tdk-up-warm-start-2026-10-10/README.md) | The manual run behind an earlier comment on #1023 (no recorded wall time) | [notes](tdk-up-warm-start-2026-10-10/README.md) |
| [`container-scale-*.json`](.) | 5 to 100 `/health` services on the ERP fixture bench | [scale measurements](../../docs/benchmarks/scale-bench.md) |
| [`cli-startup-*.json`](.) | `flisk` command start-up time at 10, 100 and 500 services | [scripts README](../../scripts/benchmark/README.md#cli-startup-and-discovery-benchmark) |

**Live report:** every change to `main` that affects start-up produces a fresh report on GitHub Pages, with tabs for warm and cold starts, per-service build times, the history and the environment: <https://tdk-landscape.github.io/tdk-cli-core/>. It runs on GitHub-hosted runners, so its numbers are not comparable with the macOS results above.

To reproduce a result, see [`scripts/benchmark/README.md`](../../scripts/benchmark/README.md).
