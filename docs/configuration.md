# Configuration and editor schemas

TDK has two JSON files with different jobs: each service's `service.json` describes that service, and `.tdk/project.json` configures the local project and its stack phases. The schemas help editors provide completion; TDK's CLI behavior remains authoritative.

## `service.json`

Here is valid JSON; the explanations are outside the file so it remains parseable:

```json
{
  "$schema": "https://tdk-landscape.github.io/schema.service.json",
  "schemaVersion": 1,
  "appName": "api-backend",
  "appType": "backend",
  "stack": "shop",
  "port": 4000,
  "healthCheckPath": "/health",
  "dependsOn": []
}
```

`appName`, `appType`, `stack`, and `schemaVersion` are required. A backend also needs a port in the supported backend range. See the [authoritative service schema](../engine/schemas/service-schema.json). The `$schema` property is supported by the schema. `tdk doctor` checks local environment readiness and discovered service issues.

### `smoke`: check the public URL after `tdk up`

`healthCheckPath` is a GET inside the container, and `traefik.healthCheck` is Traefik's own probe. Neither opens the URL `tdk up` prints, so a container can be green while the route is a 404, the router is shared with another backend, or the database is not the one the service uses. A `smoke` block closes that gap:

```json
{
  "smoke": {
    "via": "proxy",
    "timeoutSeconds": 60,
    "steps": [
      { "name": "create", "method": "POST", "path": "/records", "body": { "name": "smoke" }, "expect": 201, "save": { "id": "$.id" } },
      { "name": "read back", "path": "/records/{{id}}", "expect": 200, "bodyContains": "smoke" }
    ]
  }
}
```

- Once Tilt is up, `tdk up` sends each step to the service's public base URL (`http://api.<project>.localhost[:port]/api/<name>` for a backend, `mcp` or bring-your-own service, `http://app.<project>.localhost[:port]/<name>` for a frontend), the same URL `tdk up` prints. `path` must start with `/`; a full URL or relative path is rejected, because it would skip the proxy.
- `expect` is the status (default 200). `bodyContains` is optional. `save` copies a response field (`$.id`, `$.data.items[0].id`) into `{{id}}` for later steps, in the path and in string values of `body`.
- Before the first step, `tdk up` polls `GET <public URL><healthCheckPath>` (default `/health` for backend and `mcp` services; none for frontends and bring-your-own without `healthCheckPath`, which is the setting for a service that is not HTTP) until something other than a connection error, 404 or a 5xx answers, so a write is never the first request to reach a service that is still building or migrating. The wait has its own `timeoutSeconds` budget, and the steps then get a fresh one. If the service never answers, the first step runs anyway and reports the failure.
- A 404, 502, 503 or 504 means the route is not up yet and is retried for `timeoutSeconds` (default 60). A thrown error is retried for GET, HEAD and OPTIONS; for a write (POST, PUT, ...) only when the error proves the request was never sent (connection refused, DNS failure), never after a timeout or reset, which may have reached the service. Any other wrong status fails at once, so a write is never repeated.
- A failed step stops Tilt, prints the service, step, URL, method, status and a body snippet, and makes `tdk up` exit non-zero. The containers are left running for inspection; `tdk down` removes them.
- Every step that ran leaves a record under `.tdk/smoke/<service>/<step-slug>/` (`<step-slug>` is the lowercased step name, or `step-N` when unnamed). `latest.json` holds the service, step, method, public URL, expected and actual status, `truncated`, the byte length and the body file name; `body.txt` holds the response body, capped at 64 KiB (`truncated: true` when the cap cut it). A step that got no response (after retries) writes `latest.json` with `status: null` and the error code, and no body file. When a step passes, `last-success.json` and `last-success-body.txt` are replaced with that response; a failure never touches them, so a later regression can be compared with the last good response (`diff last-success-body.txt body.txt`). The failure line ends with `(record: <path to latest.json>)`. The directory is gitignored (`tdk project` adds `.tdk/smoke/`), `tdk down` leaves it, and nothing is uploaded from your machine. Bodies are kept as the service returned them, with no redaction; request headers and cookies are not stored.
- No `smoke` block, no check: existing projects behave as before. Workers and bring-your-own services with `exposeViaProxy: false` have no public route and are skipped. `tdk doctor` reports a malformed block, and `tdk up` reports one as a failed smoke check instead of crashing.

Not covered: a browser test (HTTP only), proving which database answered (a read-back of the written id catches a wrong store, not which one), a Traefik `pathPrefix` override (the check uses the `apiPath` or `basePath` route that `tdk up` prints), and `--dry-run` (nothing is started, so nothing is checked). The ingress port is the one `tdk up` selected (`TDK_HTTP_PORT` or the fallback range).

`scripts/verify-smoke.sh` checks both outcomes through a real `tdk up`.

A short drawing of the pass and fail paths: [Smoke check](smoke.md).

## `.tdk/project.json`

For VS Code, associate both filenames with their schema in workspace settings. The project schema provides editor assistance for the current project configuration shape; it does not add or change CLI validation.

```json
{
  "json.schemas": [
    {
      "fileMatch": ["/services/**/service.json"],
      "url": "https://tdk-landscape.github.io/schema.service.json"
    },
    {
      "fileMatch": ["/.tdk/project.json"],
      "url": "https://raw.githubusercontent.com/tdk-landscape/tdk-cli-core/main/engine/schemas/project-schema.json"
    }
  ]
}
```

The service schema is also in [`engine/schemas/service-schema.json`](../engine/schemas/service-schema.json), and the current project configuration schema is [`engine/schemas/project-schema.json`](../engine/schemas/project-schema.json). Run `tdk config verify` to check generated project files, validate discovered service manifests, and compare generated service files with their snapshots. It does not validate Helm values. `tdk doctor` checks local readiness and service concerns. See [generated service files](generated-files.md).

### Which diagnostic command should I run?

Use `tdk doctor` to check whether your development environment is ready. Use `tdk config verify` to validate project configuration and check generated-file consistency. These commands answer different questions and are not substitutes for each other.

| What you want to check | Command | What it helps identify |
| --- | --- | --- |
| Local environment readiness | `tdk doctor` | Missing tools, Docker readiness, port conflicts, and reported service or environment issues |
| Project configuration and generated-file consistency | `tdk config verify` | Invalid service manifests, missing or out-of-sync generated project files, and generated service-file drift |

#### Example: Check environment readiness

If TDK cannot start your development environment, run:

```sh
tdk doctor
```

Review the reported checks and suggested fixes. For example, if Docker is not running, start Docker Desktop or another supported container runtime and run the command again.

See the [doctor readiness contract](reference/doctor-contract.md) for the exact checks, exit codes, and JSON output.

#### Example: Check configuration consistency

If you suspect your configuration or generated files are out of sync, run:

```sh
tdk config verify
```

Review any validation errors or reported differences. For example, if a generated project file has been edited manually, verification can report that it is out of sync and show a diff. Use the reported remediation guidance to address the problem; verification does not automatically regenerate files.

For example, verification may report an out-of-sync generated file and recommend running:

```sh
tdk config regenerate
```

Regenerate only after reviewing the reported differences and confirming that regeneration is appropriate for your changes.

See the [machine-readable CLI reference](reference/machine-readable-cli.md) for the verification result fields and exit behavior. For generated-file drift and regeneration guidance, see [generated service files](generated-files.md).

### The service schema and how it is published

`engine/schemas/service-schema.json` is the source of truth; the copy at `https://tdk-landscape.github.io/schema.service.json` is a
deploy artifact for editors. It is only an editor hint. The CLI provider registries are the contract: the CLI rejects an unknown
`framework` or `language` id before it writes a resource. So `framework` and `language` are open strings with an id pattern, their
`examples` are a short hint rather than a list of every provider, and adding a provider never changes the schema.

- **On a pull request**, CI validates the schema offline (`scripts/check-published-service-schema.mjs`). It never fetches the live
  copy, because a PR that changes the schema could never match it before merge.
- **After a change to the schema lands on `main`**, the *Publish service schema* workflow copies it to the Pages repository and then
  reports in its run summary whether the live copy matches. It needs a repository secret named `PAGES_SYNC_TOKEN` (a fine-grained
  token with `contents: write` on `tdk-landscape/tdk-landscape.github.io`). Without it the copy is skipped with a warning and the live
  copy falls behind `main`; the summary says so.
