## Context

A failed smoke step stops Tilt, prints the service, step, URL, method, status, and a body snippet, and exits non-zero. `scripts/verify-smoke.sh` only greps that line. Nothing writes a file, and no workflow uploads one.

The record has to survive the process exit. The log snippet is not enough to diff a later 500 against the last 201.

## Goals / Non-Goals

### Goals

- Persist status and body for every executed step, pass or fail.
- Keep the last success and the latest failure for the same service and step.
- Cap the body so a large response cannot fill the disk or the artifact.
- Make CI upload the directory even when `flisk up` exits 1.

### Non-Goals

- Redacting response bodies. The service under test wrote them. Do not add a secret scanner.
- A new `smoke` field. Retention is always on.
- Replacing the printed snippet. The line stays; it gains the record path.

## Decisions

### One directory, two files per step

Write under `.tdk/smoke/<service>/<step-slug>/`.

- `latest.json`: service, step, method, url, expected status, actual status, `truncated`, byte length, and a body path. Written on every attempt that got a response.
- `body.txt`: response body, capped at 64 KiB. If the cap hits, `truncated` is true and the file ends at the cap.
- `last-success.json` and `last-success-body.txt`: copied only when the step passed. A later failure leaves these in place.

A step that fails before a response (connection refused after retries are exhausted) still writes `latest.json` with `status: null` and the error code. No body file in that case.

The failure line keeps its current fields and appends the `latest.json` path.

### CI uploads the directory, it does not parse it

`verify-smoke.sh` phase 2 asserts `latest.json` has the public `/missing/` URL, status 404, and a non-empty body. The workflow uploads the record directory with `actions/upload-artifact` and `if: always()`. `verify-smoke.sh` runs in a throwaway project, so when `VERIFY_SMOKE_ARTIFACT_DIR` is set it copies that project's `.tdk/smoke/` there on exit, and the workflow uploads the copy. The runner is the new `.github/workflows/smoke-e2e.yml`; no existing workflow ran the script. Retention is 14 days. The artifact name includes the workflow run id and attempt.

Local `flisk up` does not upload. `flisk down` does not delete the directory, so a failed run can still be inspected after the containers are removed.

### Comparison is the file pair, not a built-in diff

The CLI does not compute a diff. A later regression shows what changed because `last-success-body.txt` and `body.txt` are both in the artifact. Adding a diff tool is out of scope.

### Readiness gate before the first step

`verify-smoke.sh` showed that `flisk up` starts the check when Tilt's UI is up, while images can still be building. The first `POST` then got `ECONNRESET` from Traefik, which the #414 rule does not retry, so the check failed on unmodified code too. The write rules stay as shipped. Instead each plan polls `GET <baseUrl><healthCheckPath>` (default `/health` for API services) until something other than a connection error, 404 or a 5xx answers, bounded by `timeoutSeconds`. The steps then get their own `timeoutSeconds`, so a slow build does not eat the first step's budget. On timeout the first step runs and reports its own failure. Steps whose names slug the same get `-2`, `-3` suffixes so their records never collide.

## Risks / Trade-offs

- Bodies can contain data the service returned. The directory is local and gitignored: `.tdk/smoke/` is added to the repo `.gitignore` and to the entries `flisk project` writes (only `.tdk/.tdk-out/` was ignored before). CI artifacts are visible to anyone who can read the workflow run.
- 64 KiB can cut a JSON body. The status and the start of the body are still enough to see a status or payload change. The flag says the copy is incomplete.
- Parallel services must not share a file. Key by service name and step slug.

## Migration Plan

No manifest migration. Projects without a `smoke` block write nothing. Rollback is reverting the writer and the upload step.

## Open Questions

- None. The cap and the 14-day retention are fixed by this change.
