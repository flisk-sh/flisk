## Why

`tdk up` already prints the public URL, method, status, and a body snippet when a `smoke` step fails (#413, #414). That line is not kept. A later CI run only has whatever is still in the job log, so a regression cannot be diffed against the last response. The follow-up is to retain the status and response body as a local record and upload it as a CI artifact.

Source: https://x.com/conveebuilds/status/2106375152619667821

## What Changes

- After each smoke step, write a capped record of the service, step, method, public URL, expected status, actual status, and response body.
- On failure, point the existing failure line at that record. Keep the last successful record for the same step so a later failure can be compared.
- Have `scripts/verify-smoke.sh` assert the failure record contains the public URL, status 404, and a body. Upload the record directory from the smoke CI job with `if: always()`.
- Document the record path, the cap, and that the printed snippet is not the retained copy.

## Capabilities

### New Capabilities

- `smoke-response-artifacts`: Smoke checks retain status and response body locally, and CI uploads that record so a later regression can be compared.

### Modified Capabilities

- None. Retry rules, malformed-block handling, and the public-URL check stay as shipped.

## Non-goals

- A browser test, HAR capture, or proving which database answered.
- Changing retry rules for writes.
- Storing request headers, cookies, or environment variables.
- Uploading artifacts from a user's machine. Upload is CI only.

## Impact

- Smoke runner used by `tdk up`, and its unit tests.
- `scripts/verify-smoke.sh` and the workflow that runs it.
- `docs/configuration.md` and `docs/smoke.md`.
- No service schema change. Existing `smoke` blocks keep working.
