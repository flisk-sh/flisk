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

`data` is `null` when a command cannot produce its report. Errors have stable `code` and `message` fields. Diagnostics are written to stderr; stdout contains one JSON document. Exit code 0 means the report succeeded (doctor readiness permits warnings), 1 means a blocking finding or command failure, and 2 means invalid arguments or an unexpected internal error (`tdk up` also exits 2 when hand-edited generated files drift from `service.json`, while native Windows startup refusal exits 1). Consumers should check the exit code and still parse the envelope when one is emitted.

Command data:

- `status`: `tilt.available`, `tilt.resourcesQueried`, `tilt.readiness`, optional live `tilt.resources`, total `resourceCount`, discovered manifest `resources` (`name`, `stack`, `type`, `port`), `stacks` (`name`, `resourceCount`, `resources` containing resource names), and `unassignedResources` (resource names). `--tilt` controls the live `tilt.resources` list: without it, `tilt.resourcesQueried` is `false` and `tilt.resources` is `null`. The manifest `resources` array is always available and does not report live health. `tilt.readiness` retains its existing behavior and may be populated whenever Tilt is available. If Tilt is unavailable, `tilt.available` is `false` and no live resource-list query is made.
- `resources`: `resources` with stable service name, stack, type, port, and manifest path.
- `stacks`: `stacks` with `name` and `resourceCount`. `--services` adds `services` (service names; its length equals `resourceCount`), and `--verbose` adds `description`; `--services` alone does not include `description`. A project with no stacks returns `stacks: []`. Outside a project it emits the same envelope as `resources --json` (`data: null`, one `errors` entry, exit 2).
- `networks`: `services` with stable service name, stack, base path, URL, optional Windows loopback URL, service port, and reachability state (`running`, `stopped`, or `unknown`). An empty list means no discovered resource currently has a routable base path.
- `projects`: `projectRoot` (the absolute path of the project), `configured` (`true` when all master configuration files exist), `missingFiles` (the master files that are missing from `.tdk/.tdk-out`; empty when `configured` is `true`), `resources` (the number of discovered resources, not their names), `stacks` (the stack names) and `unassignedResources` (the number of resources that do not belong to a stack). Use `tdk resources --json` or `tdk stacks --json` when you need the names and details. `tdk info --json` is an alias. See the example below.
- `doctor`: `ready`, `inProject`, ordered `checks`, and a `ports` plan with `http`, `https`, and `postgres` entries. Each port entry contains canonical `requested`, selected `chosen`, `explicit`, and `reason` fields. Doctor is read-only and does not persist the plan, unless `--fix` is given (see [doctor-contract.md](doctor-contract.md)). Structured `errors` cover usage/internal failures. Check entries preserve `name`, `didPass`, `message`, optional `fix`, `isWarning`, and `isSkipped`. `isSkipped` indicates that a check could not run meaningfully; skipped checks are non-blocking, even when `didPass` is `false`.
- `up`: `ok` (`true` when all expected resources are built and running), `stack` (the stack name argument, or `null`), `services` (the started service names), optional `requested` and `dependencies` (when `--only` is used), and `tiltUrl` (`http://localhost:<port>`). `tdk up --json` emits one JSON object once startup reaches its ready state while Tilt continues running in the background. On timeout or resource failure, `data.ok` is `false` with `data.tiltUrl` and `data.failures` (a list of affected resources, each with `name` and `message`), and `errors[].code` is `UP_TIMEOUT` or `UP_RESOURCE_FAILED`. On smoke-check failure, `data.ok` is `false`, `errors[].code` is `UP_SMOKE_FAILED`, and Tilt is stopped. Hand-edited generated file drift (`DRIFT_DETECTED`, `DRIFT_EXIT_CODE = 2`) and unknown `--only` service names (`UNKNOWN_SERVICE`) exit with code `2`, while `tdk config verify` exits `1` for drift; other startup, preflight, and host/platform refusals (including native Windows startup refusal) exit with code `1`. Parsers should read the failure category from `errors[].code` and the affected resources from `data.failures`. See the examples below.
- `up --dry-run`: `ok`, `dryRun` (`true`), `stack` (the stack name argument, or `null`), `services` (the services the run would start, in discovery order) and `command` (the `tilt up` command line that would run). With `--only`, it also has `requested` (the names you passed) and `declaredDependencies` (services pulled in because a requested service lists them in `dependsOn`). See the example below.
- `up --env-file`: the path selects the project env file of the run (see [environment.md](../environment.md)). A path that is missing, unreadable, not a file, outside the project, or that misses a key the platform needs is refused before anything starts: `errors[].code` is `ENV_FILE_INVALID` and the exit code is `2`. A project whose vendored engine predates the option is refused with `errors[].code` `ENV_FILE_ENGINE_TOO_OLD` and exit code `1`. A stack that is already running keeps the env file it started with, so the option is refused with `errors[].code` `ENV_FILE_ALREADY_RUNNING` and exit code `1`. The path is named in the message and in the human output; no value from the file is ever printed.
- `down`: `ok` (`true`) and `stoppedTilt` (the process IDs of any `tilt up` run that `tdk down` ended first; an empty list when none was running). With `--prune-networks`, it also has `removedNetworks` (the project's Docker networks that were removed) and `keptNetworks` (networks left in place, each with `name` and `reason`, for example because a container is still attached). `tdk down --dry-run --json` returns `ok` and `dryRun` (`true`) and stops nothing. See the examples below.
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

Example output for `tdk projects --json` in a configured project with a `shop` stack and one resource that is not in any stack:

```json
{
  "schemaVersion": 1,
  "data": {
    "projectRoot": "/home/dev/orders",
    "configured": true,
    "missingFiles": [],
    "resources": 3,
    "stacks": ["shop"],
    "unassignedResources": 1
  },
  "errors": []
}
```

The master configuration files are `TILT_TECH_STACK.star`, `TILT_RESOURCE_DEFAULTS.star` and `spec.master`, which `tdk project` generates in `.tdk/.tdk-out`. In a project that has not been configured yet, `configured` is `false` and `missingFiles` lists the files that are not there. `resources` and `stacks` are still filled in from the `service.json` files that were discovered, so an unconfigured project looks like this:

```json
{
  "schemaVersion": 1,
  "data": {
    "projectRoot": "/home/dev/orders",
    "configured": false,
    "missingFiles": ["TILT_TECH_STACK.star", "TILT_RESOURCE_DEFAULTS.star", "spec.master"],
    "resources": 0,
    "stacks": [],
    "unassignedResources": 0
  },
  "errors": []
}
```

Without `--check`, `tdk projects --json` exits `0` in both cases, so read `data.configured`. With `--check`, the same response is printed and the exit code is `0` when every master file exists and `1` when any is missing, which makes it usable as a CI gate: `tdk projects --json --check`. `--check` only looks for the master files. It does not validate `service.json` files (use `tdk config verify --json` for that) or check that the containers are healthy.

Outside a project, `tdk projects --json` (with or without `--check`) prints `data: null` and one `COMMAND_FAILED` error that includes `suggestions`, writes the message to stderr and exits `1`:

```json
{
  "schemaVersion": 1,
  "data": null,
  "errors": [
    {
      "code": "COMMAND_FAILED",
      "message": "Could not find project root (no .tdk/project.json found)",
      "suggestions": [
        "Run this from within a TDK project",
        "Run `tdk project --yes` to initialize a new project"
      ]
    }
  ]
}
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

Example output for `tdk up --json`:

```json
{
  "schemaVersion": 1,
  "data": {
    "ok": true,
    "stack": null,
    "services": ["orders-api", "orders-db"],
    "tiltUrl": "http://localhost:10350"
  },
  "errors": []
}
```

With `--only` (for example, `tdk up --json --only orders-api`), the response also includes `requested` (the services explicitly requested) and `dependencies` (the additional services Tilt enabled that you did not name). `services` lists every service Tilt actually enabled, which is `requested` plus `dependencies`:

```json
{
  "schemaVersion": 1,
  "data": {
    "ok": true,
    "stack": null,
    "services": ["orders-api", "orders-db"],
    "requested": ["orders-api"],
    "dependencies": ["orders-db"],
    "tiltUrl": "http://localhost:10350"
  },
  "errors": []
}
```

Success means startup reached the command's ready state: every expected non-deferred Tilt resource is built and running, and its Docker health check (if declared) has passed. Tilt continues running in the background after the JSON output is emitted, so scripting workflows should run the command in the background (for example, `tdk up --json &`).

With `--only`, the readiness guarantee applies to the requested services only (excluding any that are deferred). Dependency services appear in `services` and `dependencies` because Tilt enabled them, but they are not checked for readiness, so a dependency that is still starting or has failed does not change `ok`. Consumers that need a dependency to be ready must check it themselves.

If one or more resources fail to start or the readiness timeout expires (`TDK_UP_READY_TIMEOUT_MS`, default 15 minutes), `data.ok` is `false` with `data.tiltUrl` and `data.failures`, and `errors` reports `UP_RESOURCE_FAILED` or `UP_TIMEOUT`:

```json
{
  "schemaVersion": 1,
  "data": {
    "ok": false,
    "tiltUrl": "http://localhost:10350",
    "failures": [
      {
        "name": "orders-api",
        "message": "Build failed: exit status 1"
      }
    ]
  },
  "errors": [
    {
      "code": "UP_RESOURCE_FAILED",
      "message": "Resources failed (orders-api: Build failed: exit status 1). Tilt is still running; inspect it or run: tdk down"
    }
  ]
}
```

When services declare a `smoke` check, the checks are executed against public ingress endpoints after readiness is reached. If a smoke check fails, Tilt is automatically stopped and the command emits `UP_SMOKE_FAILED` before exiting with status 1:

```json
{
  "schemaVersion": 1,
  "data": {
    "ok": false
  },
  "errors": [
    {
      "code": "UP_SMOKE_FAILED",
      "message": "A smoke check failed; Tilt was stopped"
    }
  ]
}
```

Example output for `tdk down --json`:

```json
{
  "schemaVersion": 1,
  "data": {
    "ok": true,
    "stoppedTilt": [48213]
  },
  "errors": []
}
```

With `--prune-networks` (`tdk down --json --prune-networks`), the response also lists what happened to the project's Docker networks. A network that still has a container attached is kept, and `reason` is the first line of the Docker error:

```json
{
  "schemaVersion": 1,
  "data": {
    "ok": true,
    "stoppedTilt": [],
    "removedNetworks": ["orders_default"],
    "keptNetworks": [
      {
        "name": "orders_shared",
        "reason": "Error response from daemon: error while removing network: network orders_shared has active endpoints"
      }
    ]
  },
  "errors": []
}
```

`removedNetworks` and `keptNetworks` are only present when `--prune-networks` is given and the networks could be checked. Without the flag, or when the project root or its configuration cannot be read, both fields are absent, so check for them before reading them. In JSON mode the human-readable "Removed networks" and "Kept network" lines are not printed, and a failed network cleanup does not change `ok`. The process ID and network names above are illustrative.

A failed shutdown is reported in the same envelope. If `tilt down` exits with a non-zero code, or a prerequisite check fails (Docker or Tilt missing or not responding), `tdk down` writes the details to stderr, exits with that code (the code from `tilt down`, or `1` for a missing prerequisite), and stdout contains one object with `data.ok` set to `false` and a `DOWN_FAILED` error:

```json
{
  "schemaVersion": 1,
  "data": {
    "ok": false
  },
  "errors": [
    {
      "code": "DOWN_FAILED",
      "message": "tdk down exited with code 1"
    }
  ]
}
```

`message` ends with the exit code of the command. A failed shutdown has no `stoppedTilt` or network fields, and containers may still be running, so run `tdk status --json` or `tdk doctor --json` to see what is left. Outside a project, `tdk down --json` does not use this shape: `data` is `null`, `errors` has one `COMMAND_FAILED` entry with `suggestions`, and the exit code is `1`.

New resources created by `tdk resource` include a per-file `$schema` reference to the hosted service manifest schema. VS Code's JSON language service uses that reference for completion and validation; the generator leaves `.vscode/settings.json` untouched, so existing project editor settings remain intact. Resource registration adds the reference only when one is absent and preserves a user's existing `$schema` value.
