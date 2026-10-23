## Context

Smoke records are written beneath `.tdk/smoke/<service>/<step-slug>/`. The latest response is stored in `body.txt`, and a passing response is copied to `last-success-body.txt`. That text is kept exactly as the service returned it. The repository has shared helpers in `cli/src/utils/secret-redaction.ts` (`envSecretValues()` and `redactSecrets()`), which `flisk logs` and `flisk doctor` already use, but the smoke runner does not.

`ensureGitignore()` already knows about `.tdk/smoke/`, but it is currently called only from the `flisk project` flows (`cli/src/commands/project.ts:323` and `:494`). A project that gains smoke configuration in another way can therefore write response bodies with no matching ignore entry, and `examples/tdk-example/.gitignore` has the gap today: `git check-ignore -v .tdk/smoke/orders-api/read-back/body.txt` exits 1 there, while the same check at the repository root prints `.gitignore:47:.tdk/smoke/`.

Records intentionally survive `flisk down`. The `smoke` suite in `.github/workflows/e2e-journeys.yml` uploads them as `smoke-records-<run id>-<attempt>` with 14-day retention.

The same raw response text has three more sinks than the files: the failure line prints a 200-character snippet of the body (`snippet()` in `cli/src/utils/smoke.ts`), and `latest.json` keeps the request URL and the error text. A secret in a path or in an error message reaches CI logs and the artifact even when the body file is handled.

## Goals / Non-Goals

**Goals:**

- Keep the records out of git by default, whatever route the project took into Flisk.
- Redact the secret values the project already knows about, from every place smoke text is shown or stored.
- Keep the diagnostic value of a smoke record: status, method, URL shape, and the body shape stay readable.
- Say plainly where the records live, how long they live, and who can read the CI copy.

**Non-Goals:**

- A general-purpose secret scanner. Redaction covers the values the existing helper recognises, and nothing more.
- Changing the retry rules, the readiness gate, the 64 KiB cap, the record layout, or the CI upload and its retention.
- Cleaning up old records on `flisk down`, or scrubbing bodies that were already written.
- A manifest flag to turn redaction off. Redaction is not optional.

## Decisions

### Ensure ignore protection at the record-writing path

Ensure the project `.gitignore` ignores `.tdk/smoke/` before `flisk up` writes its first smoke record. Reuse `ensureGitignore()` rather than maintaining a second list of generated paths.

Two consequences of reusing that helper are accepted deliberately:

- It adds the whole Flisk set (`.env`, `.tdk/.tdk-out/`, `.tdk/.project-id`, `.tdk/smoke/`, `node_modules/`), not only `.tdk/smoke/`. Those are the same entries `flisk project` writes, and a project that has none of them has the same problem for every one of them.
- It creates the file when it is missing. That is noise in a directory that is not a git working tree, so the CLI only calls it when the project root or one of its ancestors holds a `.git` entry (a file in a worktree, a directory in a clone). Outside a git working tree there is nothing to protect, so no `.gitignore` is created and no warning is printed.

If the ignore entry cannot be ensured (a read-only `.gitignore`, for example), the CLI warns before writing the records and says that Git may track them. It never reports the directory as protected when it could not check.

Git ignore is preventive, not retroactive: it does not untrack files that were already added and it does not remove content from existing history. The documentation says so.

### Redact once, at capture, so every sink is covered

Redact the response text immediately after it is read, before it is split into the printed snippet, the stored body, and the last-success copy. One redaction point covers all three, and the stored body and the printed snippet cannot drift apart.

The recorded URL and the error text are redacted with the same helper, because a secret can sit in a path (`{{token}}`) or in an error message rather than in the body.

The redaction source is the project's own `.env`, read through the shared helper:

- `envSecretValues(projectRoot)` returns the values of the project's `.env`, longest first, and only values of at least `MIN_REDACTED_VALUE_LENGTH` (8) characters. A shorter value is left alone on purpose, because masking it would hit ordinary words.
- With no `.env` there is nothing to redact and the text is stored as it is. This is stated in the documentation rather than hidden.
- If the `.env` exists but cannot be read, the helper throws `EnvUnreadableError`. The CLI must not fall back to raw text: it skips the body, keeps the safe metadata (service, step, method, status, error), prints a warning that the body was not stored because it could not be redacted safely, and leaves the smoke result unchanged. A diagnostic-write failure must not turn into a misleading success, and it must not turn a passing step into a failing one.

Redaction is not a general scanner. It covers the values in a readable `.env`; it does not find arbitrary credentials, and it does not find secrets the project does not hold. Request headers and cookies are still not stored.

### Where the redaction is wired

`SmokeDeps` in `cli/src/utils/smoke.ts` already carries the injectable collaborators (`fetch`, `now`, `recordDir`, `sleep`), and `flisk up` builds it at `cli/src/commands/up.ts:687`. The runner gains a redaction hook and a warning hook there, and `flisk up` resolves them from `envSecretValues(projectRoot)` and `redactSecrets()`. The runner keeps working without them (no `.env`, or a caller that does not want redaction), so the unit tests can drive it directly.

### Keep records after `flisk down`, but explain their lifecycle

Do not add cleanup on `flisk down` in this change: retaining the latest failure and the last passing response is what makes a regression diagnosable after the containers stop. Instead document that local records remain under `.tdk/smoke/` until they are deleted or overwritten by later runs, and give `rm -rf .tdk/smoke/` as the cleanup command.

Document that the `smoke` suite of `.github/workflows/e2e-journeys.yml` uploads the records as a `smoke-records-*` artifact with 14-day retention, and that anyone who can read the workflow run in this public repository can download that artifact. The upload and the retention are not changed here.

## Risks / Trade-offs

- Redaction only catches values the shared helper recognises. A user must not read the result as a full secret scanner, and the documentation says so next to the feature.
- Short secrets (under 8 characters) are not masked. That is the existing helper's rule, and changing it would change `flisk logs` and `flisk doctor` too.
- Adding the ignore entry from `flisk up` means a `flisk up` can modify `.gitignore`. It only does so inside a git working tree, it only appends missing Flisk entries, and it is idempotent.
- A warning does not prevent tracking. It makes the risk explicit before the files exist.
- Already committed records are not removed and old history is not rewritten. The migration note tells users to review and delete what they no longer want and to rotate anything that was exposed.
- Keeping the records after `flisk down` preserves diagnostic utility, so users have to delete them when they no longer need them.

## Migration Plan

No manifest migration. Existing smoke definitions keep running, and a project without a `smoke` block still writes nothing. Records written by an older CLI are not rewritten or scrubbed; the migration note tells users to remove the historical files themselves and to rotate any credential that was in one. Rollback is reverting the redaction and the ignore call.

## Open Questions

- None. The redaction rules are the existing ones, the artifact lifecycle is unchanged, and no configuration is added.
