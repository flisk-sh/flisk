## Why

Flisk’s current adoptability score reflects real product gaps: users can lose source files during regeneration, `flisk up` does not yet guarantee safe and predictable process behavior, doctor misses high-impact environment failures, and CI lacks a representative stack boot and write-path check. This change makes one Linux-container workflow dependable, defines WSL2 Ubuntu as the Windows route, and keeps the 1.x stability caveat until the evidence supports changing it.

## What Changes

- Make `flisk doctor` fail closed for required environment checks, prioritize port conflicts, and explain that Windows users must use WSL2 Ubuntu; warn about `/mnt/c` and fail there with `--strict`.
- Define `flisk up` behavior for native Windows, `--force`, `--quiet`, and side-effect-free `--dry-run`.
- Limit regeneration to Flisk-owned generated paths, preserve unknown user manifest keys, and add `flisk config verify` for generated drift and required-field errors.
- Make the `service.json` schema version explicit and prevent patch releases from silently changing required fields; require migration or a major-version warning for breaking schema changes.
- Add a real-shaped default example with an API, Postgres, worker/queue, frontend, Traefik routes, and a working write path; retain the 100-service ERP system as a labeled fixture bench.
- Add an Ubuntu `example-e2e` CI gate and a WSL2 smoke script with concise setup documentation. Keep the README’s existing 1.x caveat until requirements 2–5 are green on main.
- Track the work in one issue with child issues for doctor, regeneration, example E2E, and the Windows refusal contract; close or milestone stale duplicate help-wanted issues.

## Capabilities

### New Capabilities
- `tdk-environment-doctor`: Ordered, actionable checks for Docker, Tilt, Bun, ports, WSL project placement, and unsupported native Windows use.
- `tdk-up-lifecycle`: Platform refusal, force cleanup, and dry-run side-effect guarantees for `flisk up`.
- `generated-config-safety`: Generated-path ownership, safe regeneration, and drift verification.
- `service-manifest-schema`: Explicit schema versioning, forward-compatible unknown-key preservation, and breaking-change rules.
- `tdk-product-example`: A realistic default example with a verified routed write path and labeled benchmark fixture.
- `windows-wsl-support`: The WSL2 Ubuntu platform contract, setup documentation, and smoke-script expectations.

### Modified Capabilities
- None. Existing OpenSpec specs do not define these requirements.

## Impact

- CLI commands and tests for doctor, `up`, and `config`; manifest/schema handling and generation templates.
- Example projects, CI workflows, README and benchmark documentation, plus new WSL2 documentation and smoke script.
- Windows support claims remain gated by implementation and CI evidence; no rating rubric or scorecard changes are included.
