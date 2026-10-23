## 1. Ignore protection

- [x] 1.1 Detect whether the project root or one of its ancestors holds a `.git` entry (a file in a worktree, a directory in a clone).
- [x] 1.2 Call the shared `ensureGitignore()` for `projectRoot` before the first smoke record is written, so `.tdk/smoke/` is ignored even when the project never ran `flisk project`. Note that it adds the whole Flisk entry set, not only `.tdk/smoke/`.
- [x] 1.3 Skip the ignore call outside a git working tree: do not create or modify a `.gitignore` there, and print no ignore warning.
- [x] 1.4 When the ignore entry cannot be ensured, warn before writing the records and say that Git may track them. Never report the directory as protected when it could not be checked.
- [x] 1.5 Add `.tdk/smoke/` to `examples/tdk-example/.gitignore`.
- [x] 1.6 Add regression tests: a project with a `smoke` block and no prior `flisk project` call gets the ignore entry; a project outside a git working tree gets no `.gitignore`; an unwritable `.gitignore` produces the warning before any record is written.

## 2. Redact smoke text

- [x] 2.1 Give the smoke runner injectable redaction and warning hooks next to the existing `fetch`, `now`, `recordDir`, and `sleep` dependencies, and resolve them in `flisk up` from `envSecretValues(projectRoot)` and `redactSecrets()`.
- [x] 2.2 Redact the response text where it is read, before it is split into the printed snippet, the stored body, and the last-success copy, so all three carry the redacted text.
- [x] 2.3 Redact the recorded URL and error text with the same helper.
- [x] 2.4 When the secret values cannot be loaded (unreadable `.env`), do not persist or print raw text: keep the safe metadata (service, step, method, status, error), warn that the body was not stored, and leave the smoke result unchanged.
- [x] 2.5 Keep the redaction before the 64 KiB cap, and record the byte length of the redacted body.
- [x] 2.6 Add unit tests that read the files on disk: the known secret is absent from `body.txt` and `last-success-body.txt`, absent from the printed failure snippet, and absent from the recorded URL.
- [x] 2.7 Add a unit test that an unreadable `.env` writes no body file, prints a warning, and leaves the pass/fail result unchanged.

## 3. Document the artifact lifecycle and the exposure

- [x] 3.1 Update `docs/smoke.md` with the storage location, the redaction scope and its limits (only what the shared helper recognises, nothing to redact without a readable `.env`), the redacted failure snippet, and the manual cleanup (`rm -rf .tdk/smoke/`).
- [x] 3.2 Update `docs/configuration.md` so the git-ignore guarantee is no longer described as depending on `flisk project` alone, and state that the records are redacted before they are written.
- [x] 3.3 Document that records survive `flisk down`, stay until they are deleted or overwritten, and that the `smoke` suite of `.github/workflows/e2e-journeys.yml` publishes `smoke-records-*` artifacts for 14 days that anyone who can read the workflow run can download.
- [x] 3.4 Note that `.gitignore` does not remove already tracked files and does not scrub Git history, and that older records are not rewritten.

## 4. Verify

- [x] 4.1 Run the smoke, secret-redaction, and gitignore unit tests.
- [x] 4.2 Run the CLI lint, typecheck, and test suites, plus `openspec validate harden-smoke-response-artifacts --strict`.
