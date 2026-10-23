## ADDED Requirements

### Requirement: Snapshot commands emit one JSON object
`flisk doctor`, `status`, and `down` SHALL accept `--json` and print exactly one JSON object `{schemaVersion, data, errors}` on stdout, with human logs on stderr. When a preflight check exits the process, a failure object SHALL still be printed. Existing `doctor --json` and `status --json` fields SHALL remain unchanged.

#### Scenario: Down fails preflight
- **WHEN** `flisk down --json` runs without Docker or Tilt
- **THEN** stdout is one failure object and the exit code is non-zero

### Requirement: Up reports readiness once
`flisk up <stack> --json` SHALL print exactly one JSON object: `ok: true` once every non-deferred Tilt resource is built and running, or `ok: false` with an error code when a resource fails, readiness times out, a smoke check fails, or Tilt exits first. Tilt SHALL keep running after a success object, so callers background the command. Human output is suppressed.

#### Scenario: UI port opens before services are ready
- **WHEN** the Tilt UI is reachable but a resource is still building
- **THEN** no success object is printed until that resource is running

### Requirement: Logs are a bounded snapshot
`flisk logs --json` SHALL return a bounded snapshot selected by `--service`, `--tail <n>` and `--since <duration>`, in one JSON object, and SHALL exit. Following logs is not part of the JSON contract; it streams as plain text on stderr or is a later tool.

#### Scenario: Agent reads recent logs
- **WHEN** `flisk logs --json --service api --tail 100` runs
- **THEN** one object with at most 100 lines for `api` is printed and the command exits

### Requirement: Selective start
`flisk up [stack] --only <service...>` SHALL start the named services, the services they list in `dependsOn` (transitively), and the shared infrastructure the Tiltfile always enables, and nothing else. Unknown names SHALL fail with `UNKNOWN_SERVICE` and exit 2 before anything starts, listing the valid names, because the Tiltfile enables the whole stack for an unknown focus name. When a Tilt answers on the default port or on `TILT_PORT`, `--only` SHALL fail with `TILT_ALREADY_RUNNING` unless `--force` is given. With `--json`, readiness SHALL cover only the enabled resources, and the success object SHALL include `requested` and `dependencies`, where `dependencies` is what Tilt actually enabled besides the requested services (a dry run reports the `service.json` closure as `declaredDependencies`). See `spike-up-only.md`.

#### Scenario: Service with a dependency
- **WHEN** `--only storefront-web` is given and it depends on `catalog-api`
- **THEN** both start, `dependencies` is `["catalog-api"]` as reported from Tilt, and no other service starts

#### Scenario: Unknown service name
- **WHEN** `--only` names a service not in the project
- **THEN** the command exits 2 without starting anything and lists valid names

#### Scenario: Partial start reports ready
- **WHEN** a `--only` start has finished building and running its resources
- **THEN** `up --json` reports `ok: true` even though other resources are disabled

### Requirement: Status separates ingress, service and stack ports
`flisk status --json` SHALL report, per service: `url` (the ingress address, for example `http://api.shop.localhost/...`), `containerPort` (the in-container listen port), and `hostPort` (a direct host mapping, or `null` when the service is only reachable through the ingress). It SHALL also report a separate stack-level list of ports (ingress HTTP and HTTPS, Tilt UI, published datastores).

#### Scenario: Service behind the ingress
- **WHEN** a service has no published host port
- **THEN** its `hostPort` is `null` and its `url` is the ingress address

### Requirement: MCP server shares the implementation
`flisk mcp` SHALL expose `doctor`, `up`, `down`, `status`, `logs`, and `resource_list` tools backed by the same functions as the CLI. The `up` tool SHALL start Tilt detached and return once started; callers poll the `status` tool for readiness, so a blocked call cannot time out. The tool SHALL refuse when `canUp` is false.

#### Scenario: MCP up on an unsupported host
- **WHEN** the `up` tool is called in a WebContainer
- **THEN** it returns an error result and starts nothing
