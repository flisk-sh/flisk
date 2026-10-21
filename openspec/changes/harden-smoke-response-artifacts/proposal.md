## Why

Smoke response artifacts are useful for diagnosing regressions, but their current handling can expose secrets. `tdk up` writes response bodies beneath `.tdk/smoke/<service>/<step-slug>/`; those files are only guaranteed to be ignored when `tdk project` was used, and the text is kept exactly as the service returned it, without the secret redaction that `tdk logs` and `tdk doctor` already apply. The records survive `tdk down`, and the `smoke` suite in `.github/workflows/e2e-journeys.yml` publishes them as a 14-day artifact that anyone able to read the public repository's workflow run can download. The same raw text is printed in the failure line, so it also lands in public CI logs.

This change addresses issue [tdk-cli-core#1771](https://github.com/flisk-sh/tdk-cli-core/issues/1771) without removing the diagnostic value of smoke records.

## What Changes

- Ensure `.tdk/smoke/` is ignored before smoke response records are written, independent of how the project or its `smoke` configuration was created. If the entry cannot be ensured, warn before writing the records.
- Redact known project secrets from every smoke text sink: the stored body, the last-success copy, the printed failure snippet, and the URL and error text kept in the record.
- Add `.tdk/smoke/` to `examples/tdk-example/.gitignore`.
- Document the storage location, what redaction covers and its limits, how local records survive `tdk down` and can be deleted, and what CI publishes and for how long.
- Add unit tests for ignore setup, for redaction in every sink, and for the redaction-failure path.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `smoke-response-artifacts`: keep the records out of git by default, redact known secrets from every text sink, and document the artifact lifecycle and the CI exposure. The capability was promoted to `openspec/specs/smoke-response-artifacts/` by archiving the shipped `retain-smoke-response-artifacts` change, so this delta modifies a real requirement ("Each smoke step retains status and body") and adds the hardening requirements to it.

## Impact

- `cli/src/utils/smoke.ts` (the record writer, the failure line, and the dependency bag the runner takes), `cli/src/commands/up.ts` (where the plans, the record directory, and the redaction source are wired), and the shared ignore helper in `cli/src/utils/file-helpers.ts`.
- `examples/tdk-example/.gitignore`, the smoke unit tests, `docs/smoke.md`, and `docs/configuration.md`.
- No manifest or schema change; existing `smoke` blocks keep working. The 64 KiB cap, the record paths, the comparison files, the CI upload, and the 14-day retention stay as they are.
