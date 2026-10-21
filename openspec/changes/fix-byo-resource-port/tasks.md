## 1. BYO port persistence

- [x] 1.1 Read the resource command help and existing BYO tests; confirmed `--port` was resolved only after the generic port was printed, while serialization already used the resolved port.
- [x] 1.2 Added a focused test proving `--port 4500` prints `Port: 4500` and writes `.port == 4500` to `service.json`.
- [x] 1.3 Resolved and validated the BYO port before printing resource details, then reused it for serialization; preserved the 4000–5999 range and existing error strings.
- [x] 1.4 Retained existing malformed, out-of-range, and conflict validation tests.
- [x] 1.5 Verified the focused BYO tests (8/8), including the test that runs `flisk up --dry-run`. `flisk doctor` ran and diagnosed the environment (exit 1 due missing Bun and occupied ports); this repository has no checked-in service examples to run separately.
