## 1. Record writer

- [x] 1.1 Find the smoke runner from #413/#414 and the failure printer.
- [x] 1.2 Write `.tdk/smoke/<service>/<step>/latest.json` and `body.txt` after each response. Cap the body at 64 KiB and set `truncated`.
- [x] 1.3 Copy a passing step to `last-success.json` and `last-success-body.txt`. Do not overwrite those on failure.
- [x] 1.4 Write a null status and error code when no response arrives. Append the record path to the existing failure line.
- [x] 1.5 Unit-test pass, fail, truncation, and no-response. Do not start Docker.

## 2. Verification and CI

- [x] 2.1 Extend `scripts/verify-smoke.sh` phase 2 to assert the record URL, status 404, and non-empty body.
- [x] 2.2 Upload `.tdk/smoke/` from the smoke job with `actions/upload-artifact` and `if: always()`. Name it with the run id. Retain 14 days.
- [x] 2.3 Confirm `.tdk/` stays gitignored and `flisk down` does not delete the record.

## 3. Docs

- [x] 3.1 Document the record path, cap, and last-success pair in `docs/configuration.md`.
- [x] 3.2 Note in `docs/smoke.md` that the printed snippet is not the retained copy.
