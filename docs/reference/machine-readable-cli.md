# Machine-readable CLI

The supported agent polling loop uses `tdk status --json`; add `--tilt` to include Tilt's live resource list in `tilt.resources`. Use `tdk resources --json` for the discovered manifest view, `tdk stacks --json` for stack names and counts and `tdk networks --json` for routed URLs and reachability. `tdk doctor --json` reports environment readiness and actionable checks.

Every response uses this envelope:

```json
{
  "schemaVersion": 1,
  "data": {},
  "errors": []
}
```

`data` is `null` when a command cannot produce its report. Errors have stable `code` and `message` fields. Diagnostics are written to stderr; stdout contains one JSON document. Exit code 0 means the report succeeded (doctor readiness permits warnings), 1 means a blocking finding or command failure, and 2 means invalid arguments or an unexpected internal error. Consumers should check the exit code and still parse the envelope when one is emitted.

Command data:

- `status`: `tilt.available`, `tilt.resourcesQueried`, `tilt.readiness`, optional live `tilt.resources`, total `resourceCount`, discovered manifest `resources` (`name`, `stack`, `type`, `port`), `stacks` (`name`, `resourceCount`, `resources` containing resource names), and `unassignedResources` (resource names). `--tilt` controls the live `tilt.resources` list: without it, `tilt.resourcesQueried` is `false` and `tilt.resources` is `null`. The manifest `resources` array is always available and does not report live health. `tilt.readiness` retains its existing behavior and may be populated whenever Tilt is available. If Tilt is unavailable, `tilt.available` is `false` and no live resource-list query is made.
- `resources`: `resources` with stable service name, stack, type, port, and manifest path.
- `stacks`: `stacks` with `name` and `resourceCount`. `--services` adds `services` (service names; its length equals `resourceCount`), and `--verbose` adds `description`; `--services` alone does not include `description`. A project with no stacks returns `stacks: []`. Outside a project it emits the same envelope as `resources --json` (`data: null`, one `errors` entry, exit 2).
- `networks`: `services` with stable service name, stack, base path, URL, optional Windows loopback URL, service port, and reachability state (`running`, `stopped`, or `unknown`). An empty list means no discovered resource currently has a routable base path.
- `doctor`: `ready`, `inProject`, ordered `checks`, and a `ports` plan with `http`, `https`, and `postgres` entries. Each port entry contains canonical `requested`, selected `chosen`, `explicit`, and `reason` fields. Doctor is read-only and does not persist the plan, unless `--fix` is given (see [doctor-contract.md](doctor-contract.md)). Structured `errors` cover usage/internal failures. Check entries preserve `name`, `didPass`, `message`, optional `fix`, `isWarning`, and `isSkipped`. `isSkipped` indicates that a check could not run meaningfully; skipped checks are non-blocking, even when `didPass` is `false`.
- `up --dry-run`: `ok`, `dryRun` (`true`), `stack` (the stack name argument, or `null`), `services` (the services the run would start, in discovery order) and `command` (the `tilt up` command line that would run). With `--only`, it also has `requested` (the names you passed) and `declaredDependencies` (services pulled in because a requested service lists them in `dependsOn`). See the example below.
- `logs`: `services` (selected service names), `tail` (defaults to `200`, accepts `1`–`10000`), `since` (duration such as `30s`, `5m`, or `1h`, or `null` when omitted), and `lines` (normalized log entries). Each line contains `time`, `resource`, `level`, `source`, and `text`; the first four fields may be `null`, while `text` is a string.

Example output for `tdk logs --json --service orders-api --tail 50 --since 5m`:

```json
{
  "schemaVersion": 1,
  "data": {
    "services": ["orders-api"],
    "tail": 50,
    "since": "5m",
    "lines": [
      {
        "time": "2026-10-15T12:30:00Z",
        "resource": "orders-api",
        "level": "info",
        "source": "stdout",
        "text": "Request completed"
      }
    ]
  },
  "errors": []
}
```

This is an illustrative example. `--tail` limits the number of recent lines, and `--since` filters logs to the specified duration. JSON mode returns a snapshot and exits rather than following a live stream. On failure, `data` is `null` and `errors` contains entries with `code` and `message`, optionally with `suggestions`. Usage errors exit with code `2`; other failures use the applicable command exit code. Error diagnostics are also written to stderr.
- `config verify`: `valid`, `errors`, `warnings`, and `diffs`. Drift or missing tracked master outputs exits 1 and includes a unified diff; a valid project exits 0. A missing project exits 1 with a structured command error; invalid project JSON or an unexpected failure exits 2 with a structured internal error. JSON verification does not regenerate files.

`networks --json` previously returned a bare array. It now returns the versioned envelope. During migration, `networks --json-legacy` returns the old array and is scheduled for removal in CLI version 1.5.0; migrate consumers before that release to `data.services`. Existing text and raw output remain available.

Within schema version 1, additive fields are allowed. Clients should ignore unknown fields and reject unsupported major schema versions. Removing or renaming fields, changing their meaning, or changing collection shapes requires a versioned transition and migration notes. Text aliases and plural command aliases remain supported.

Minimal polling example:

```sh
if tdk status --json >status.json; then
  jq -r '.data.stacks[] | [.name, .resourceCount] | @tsv' status.json
else
  jq -r '.errors[]?.message, .data.resources[]? | strings' status.json >&2
fi
```

Example output for `tdk up --dry-run --json --only orders-api`, where `orders-api` lists `orders-db` in `dependsOn`:

```json
{
  "schemaVersion": 1,
  "data": {
    "ok": true,
    "dryRun": true,
    "stack": null,
    "services": ["orders-api", "orders-db"],
    "requested": ["orders-api"],
    "declaredDependencies": ["orders-db"],
    "command": "tilt up -f <path to Tiltfile> -- --focus=orders-api orders-api orders-db"
  },
  "errors": []
}
```

A dry run reports the plan and exits. It does not start Tilt or any services. Read `services` as the list that would start, and `declaredDependencies` as the part of it that comes from `dependsOn` in `service.json`. Shared infrastructure that Tilt always enables, such as Postgres and Traefik, is not listed. The `command` string contains the Tiltfile path on your machine, and is just `tilt up` when neither a stack nor `--only` is given. Without `--only`, `requested` and `declaredDependencies` are absent. This is an illustrative example, and a dry run still runs the checks that `tdk up` runs first (for example, it refuses a project whose generated files were edited by hand). If one of them fails, `data` is `{"ok": false}` and `errors` explains why.

New resources created by `tdk resource` include a per-file `$schema` reference to the hosted service manifest schema. VS Code's JSON language service uses that reference for completion and validation; the generator leaves `.vscode/settings.json` untouched, so existing project editor settings remain intact. Resource registration adds the reference only when one is absent and preserves a user's existing `$schema` value.
