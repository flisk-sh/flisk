# tdk up warm-start benchmark

| Run | Kind | Outcome | Span (s) | Wall (s) | golden-layers-build (s) | Healthy | Failed resources | Docker VM peak (MiB) |
|---|---|---|---:|---:|---:|---:|---:|---:|
| cold-1 | cold | settled | 274.6 | 281 | 119.8 | 8/8 | 0 | 4827 |
| warm-1 | warm | settled | 42.2 | 50 | 2.0 (skipped) | 8/8 | 0 | 2787 |
| warm-2 | warm | settled | 32.3 | 38 | 1.6 (skipped) | 8/8 | 0 | 2865 |
| warm-3 | warm | settled | 36.0 | 40 | 1.8 (skipped) | 8/8 | 0 | 2538 |

Span is from the first Tilt build step to the last build finishing. Wall is from launching `tdk up` until every resource was idle and the expected containers were healthy (outcome `settled`), or until the 30-minute limit (`timeout`). Runs with any other outcome were not timed.

## Build time per service (s)

| Resource | cold-1 | warm-1 | warm-2 | warm-3 |
|---|---:|---:|---:|---:|
| reservation-api | 76.5 | 5.8 | 6.7 | 11.1 |
| kitchen-api | 62.5 | 8.2 | 12.2 | 8.7 |
| menu-api | 57.5 | 11.7 | 8.6 | 6.3 |
| kitchen-worker | 72.4 | 10.8 | 10.0 | 8.5 |
| reservation-app | 66.7 | 9.4 | 9.7 | 8.5 |
| floor-app | 69.6 | 9.2 | 10.6 | 13.0 |

## Environment

- tdk: 1.3.144
- tilt: v0.37.7, built 2026-08-15
- docker: 29.8.2
- node: v24.16.0
- os: Darwin 25.5.0 arm64
- cpus: 8
- memory_bytes: 17179869184
- project: tdk-restaurant-example
- healthy_expected: 8
- sample_vm: 1
