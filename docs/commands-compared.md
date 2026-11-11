# Flisk commands compared

Short answers to "X vs Y" questions about Flisk commands and resource types, each checked against the CLI source.

- [flisk init vs flisk project](#flisk-init-vs-flisk-project)
- [flisk create vs flisk project](#flisk-create-vs-flisk-project)
- [flisk create vs flisk import](#flisk-create-vs-flisk-import)
- [flisk import vs flisk eject](#flisk-import-vs-flisk-eject)
- [flisk up vs flisk deploy](#flisk-up-vs-flisk-deploy)
- [flisk up vs docker compose up](#flisk-up-vs-docker-compose-up)
- [flisk up vs tilt up](#flisk-up-vs-tilt-up)
- [flisk up vs flisk up --dry-run](#flisk-up-vs-flisk-up---dry-run)
- [flisk up vs flisk restart](#flisk-up-vs-flisk-restart)
- [flisk down vs flisk down --purge](#flisk-down-vs-flisk-down---purge)
- [flisk doctor vs flisk config verify](#flisk-doctor-vs-flisk-config-verify)
- [flisk status vs flisk networks](#flisk-status-vs-flisk-networks)
- [flisk logs vs the Tilt UI](#flisk-logs-vs-the-tilt-ui)
- [flisk run vs docker exec](#flisk-run-vs-docker-exec)
- [flisk resource vs flisk resources](#flisk-resource-vs-flisk-resources)
- [flisk stack vs flisk stacks](#flisk-stack-vs-flisk-stacks)
- [flisk project vs flisk projects](#flisk-project-vs-flisk-projects)
- [flisk ui vs flisk os](#flisk-ui-vs-flisk-os)
- [flisk mcp vs flisk connect](#flisk-mcp-vs-flisk-connect)
- [backend vs worker resource](#backend-vs-worker-resource)
- [agent vs mcp resource](#agent-vs-mcp-resource)
- [backend vs bring-your-own resource](#backend-vs-bring-your-own-resource)
- [migrator resource vs migrating at start](#migrator-resource-vs-migrating-at-start)
- [flisk upgrade vs reinstalling](#flisk-upgrade-vs-reinstalling)

## flisk init vs flisk project

Same command: `flisk init` is an alias of `flisk project`. Both write the project's master configs, or clone a starter when you name one (`flisk project saas`). Use whichever name you remember; the flags are the same, for example `flisk init --yes` or `flisk project --check`. See the [cheat sheet](cheat-sheet.md#flisk-project-template-alias-flisk-init).

## flisk create vs flisk project

`flisk create` is a guided journey on top of `flisk project`: it asks what you are building and then runs the real `flisk project` and `flisk resource` commands for you. `flisk project` only sets up the project itself (or clones a starter); you add services afterwards with `flisk resource`. Use `flisk create` for a new app that should run right away, and `flisk project` when you want to choose each resource yourself. `flisk create my-app --dry-run` prints the commands it would run, so you can see the `flisk project` and `flisk resource` calls it makes. See the [cheat sheet](cheat-sheet.md#flisk-create-name).

## flisk create vs flisk import

`flisk create` starts a new app; `flisk import` brings in an app you already run with Docker Compose. `flisk import [dir]` reads the root `docker-compose.yml` of a folder and writes one bring-your-own `service.json` per Compose service. It reads no other Compose file names, override files, Dockerfiles or `package.json`, and its plan names what was not translated. Run `flisk import --dry-run` first to see the plan. See [importing Compose](cheat-sheet.md#flisk-import-dir) and [gradual adoption](gradual-adoption.md).

## flisk import vs flisk eject

They go in opposite directions: `flisk import` moves an existing Compose setup into Flisk, and `flisk eject` documents the way out. `flisk eject` writes `EJECTED.md`, which describes the generated Tilt files; it copies and generates nothing, and the files stay in `.flisk/.flisk-out/`. It does not turn a Flisk project back into plain Compose. See [leaving Flisk](leaving-flisk.md#what-flisk-eject-really-does).

## flisk up vs flisk deploy

Same command: `flisk deploy` is an alias of `flisk up`. It starts services on this machine and never deploys to a cluster or a cloud. To get deployment files, `flisk export render` and `flisk export wrangler` write `render.yaml` and `wrangler.toml` from `service.json`; they write files only and never deploy. See the [cheat sheet](cheat-sheet.md#flisk-up-stack-name-alias-deploy).

## flisk up vs docker compose up

Use `flisk up`; you do not run `docker compose up` on a Flisk project. For a container stack, Flisk generates the Compose files from each `service.json` into git-ignored folders, and Tilt runs them. Services that declare a `command` run as local processes with no Docker or Compose at all. If a teammate without Flisk needs one plain file, `flisk export compose` writes a standalone `docker-compose.yml` from `service.json`. See [how flisk up works](how-flisk-up-works.md) and [generated files](generated-files.md).

## flisk up vs tilt up

`flisk up` prepares the project and then runs `tilt up` for a container stack; you do not call `tilt up` yourself. Before Tilt starts, it checks the environment, generates `.flisk/.flisk-out/Tiltfile` and the other master files, picks free host ports and passes the selected stack or `--only` services to Tilt. When every selected service declares a `command`, it runs them as local processes and Tilt is not used. If you already have a Tiltfile, `flisk import tiltfile` makes `flisk up` run it unchanged. See [how flisk up works](how-flisk-up-works.md) and [run without Docker](run-without-docker.md#what-flisk-up-does).

## flisk up vs flisk up --dry-run

`flisk up --dry-run` shows what `flisk up` would start and starts nothing. For a container stack it lists the services, the host ports it would use and the `tilt up` command it would run; for local processes it shows the services, their commands and the start order. A dry run does not clone declared repositories; it reports which ones are missing. Add `--json` to get the service list as one JSON object, for example `flisk up --only orders-api --dry-run --json`. See the [cheat sheet](cheat-sheet.md#flisk-up-stack-name-alias-deploy).

## flisk up vs flisk restart

`flisk up` starts the stack; `flisk restart <resource>` restarts one resource in a stack that is already running. `flisk restart` asks the running Tilt to trigger that resource (`tilt trigger`), so it needs Tilt up and fails with `TILT_NOT_RUNNING` otherwise. Use it to restart one service without touching the rest, for example `flisk restart orders-api`. To start or stop whole stacks, use `flisk up` and `flisk down`. See [how flisk up works](how-flisk-up-works.md).

## flisk down vs flisk down --purge

`flisk down` stops the stack and keeps your data; `flisk down --purge` also deletes the project's Docker volumes (the database data), networks and images. After a plain `flisk down`, the next `flisk up` starts Postgres on the same volume. Use `--purge` for a project you are done with, or to start from an empty database. Run `flisk down --purge --dry-run` first to list what it would delete. See [local data](data.md#does-it-survive-flisk-down).

## flisk doctor vs flisk config verify

`flisk doctor` checks your environment and services; `flisk config verify` checks that the generated project files are consistent. `flisk doctor` looks at Docker, Tilt, Bun, ports and the `/health` of running services. `flisk config verify` checks that the generated files match `.flisk/project.json` and exits 1 on drift; `flisk config regenerate` fixes that drift. A CI gate usually runs both: `flisk config verify --json && flisk doctor --no-ping --json`. See the [doctor contract](reference/doctor-contract.md) and [generated files](generated-files.md).

## flisk status vs flisk networks

`flisk status` tells you what is running and whether it is healthy; `flisk networks` tells you where to reach it. `flisk status --tilt` shows Tilt resource state, `flisk status --unhealthy` shows only failing or pending services, and `flisk status --strict` exits 1 unless every service is ready. `flisk networks` (aliases `flisk urls` and `flisk traefik`) lists the Traefik-routed URLs, and `flisk networks --raw` prints one URL per line. See the [cheat sheet](cheat-sheet.md#flisk-status).

## flisk logs vs the Tilt UI

`flisk logs` prints a bounded snapshot of recent logs and exits; the Tilt UI shows live logs. Use `flisk logs` in scripts, CI and coding agents, for example `flisk logs -s orders-api --since 5m --json`. Use the Tilt UI (port 10350 by default, or `TILT_PORT`) to follow output as it happens. For local-process services there is no Tilt: `flisk logs` reads `.flisk/native/logs/`, and `flisk up` prints each line with the service name. See the [cheat sheet](cheat-sheet.md#flisk-logs).

## flisk run vs docker exec

`flisk run` gives a one-off command the same environment the service has in the stack, so you copy nothing from `.env` by hand. For a container service it uses `docker exec` in the running container, so the service must be running. For a local-process service it runs the command on this machine from the service folder, with the project `.env`, the service's `env` and `PORT`. Nothing is started or restarted, and the exit code is the command's: `flisk run orders-api -- bun run seed`. See `flisk run` in the [cheat sheet](cheat-sheet.md).

## flisk resource vs flisk resources

`flisk resource <name>` creates a resource (or registers an existing one); `flisk resources` lists them. Create with `flisk resource api --type backend --yes`. List with `flisk resources --ports`, or filter with `--stack` and `--type`. See the [cheat sheet](cheat-sheet.md#flisk-resource-name).

## flisk stack vs flisk stacks

`flisk stack <name>` assigns resources to a stack; `flisk stacks` lists stacks. Assign with `flisk stack api --resources orders-api users-api --yes`. List with `flisk stacks --services` to include each stack's resources; `flisk ls` is an alias of `flisk stacks`. See the [cheat sheet](cheat-sheet.md#flisk-stack-stack-name).

## flisk project vs flisk projects

`flisk project` creates or checks the project's master configs; `flisk projects` reports on the project. `flisk projects` (alias `flisk info`) shows project info and config status, and `flisk projects --check` exits 0 or 1 for CI. `flisk projects --stale` lists Docker objects left by project folders that were deleted. See the [cheat sheet](cheat-sheet.md#flisk-projects-alias-info).

## flisk ui vs flisk os

`flisk ui` is a dashboard in your terminal; `flisk os` starts FliskOS, a separate desktop app for your projects and agents. `flisk ui` (alias `flisk interactive`) ships with the CLI. `flisk os` runs the `fliskos` command or opens `FliskOS.app` when one of them is installed; Flisk never installs it, and the command exits 1 when neither is there. See [UI](ui.md) and the [cheat sheet](cheat-sheet.md#flisk-os).

## flisk mcp vs flisk connect

`flisk mcp` is the MCP server; `flisk connect <host>` configures a coding agent to use it. `flisk mcp` runs over stdio and gives an agent the Flisk commands as tools; you do not usually start it by hand. `flisk connect claude`, `flisk connect cursor` or `flisk connect codex` writes the `flisk mcp` entry into that host's config (`.mcp.json`, `.cursor/mcp.json` or `.codex/config.toml`) and adds the Flisk skills. Add `--dry-run` to see the files first. See [Flisk for AI agents](agents/flisk-for-agents.md) and [MCP setup](agent-tooling/flisk-mcp-setup.md).

## backend vs worker resource

A `backend` is an HTTP API; a `worker` is a background job processor with no HTTP server. A backend gets a Traefik route and an HTTP health check. A worker gets neither, and its `service.json` must list `nats` in `featuresEnabled`. Use a worker for jobs that read from a queue: `flisk resource jobs --type worker --yes`. See [configuration](configuration.md).

## agent vs mcp resource

An `agent` resource is a long-running AI agent with sessions; an `mcp` resource is a stateless MCP server that offers tools. An agent answers `/health` and `/ready`, keeps a checkpoint per session (`x-session-id`) that survives restarts, and lists sessions at `GET /sessions`; `flisk agent sessions <resource>` reads them. An MCP server answers `POST /mcp` with no session to lose. A common layout is an agent that calls tools on an MCP resource next to it. See [AI agents](agents/ai-agents.md) and [MCP resources](mcp.md).

## backend vs bring-your-own resource

A `backend` is code Flisk scaffolds and builds for you (Bun and Hono by default); a `bring-your-own` resource runs your own Dockerfile or image. Use `backend` for a new API: `flisk resource api --type backend --yes`. Use `bring-your-own` for an existing service or a third-party image, for example `flisk resource cache --type bring-your-own --image redis:7 --no-proxy`. A bring-your-own container gets only what its `service.json` declares, and is restarted with `unless-stopped` unless you set `--restart`. See [bring-your-own](byo.md).

## migrator resource vs migrating at start

A migrator runs your migrations once and exits; migrating at start runs them each time an API container boots. New services should use a migrator. `flisk resource api --type backend --feature prisma --yes` scaffolds an `api-migrator` next to the API, and the API lists it in `dependsOn`. Any other migration tool can run as a one-shot bring-your-own job with `--restart no`. `AUTO_MIGRATE` (default `true` in Flisk-built containers) is an escape hatch: set `AUTO_MIGRATE=false` in the project `.env` to skip migration at boot. See [one-shot jobs](byo.md#one-shot-jobs-migrations-seeders) and [scope](scope.md#what-differs-from-production).

## flisk upgrade vs reinstalling

Use `flisk upgrade` (alias `flisk update`): it finds how Flisk was installed (npm, Bun, git or the standalone binary) and updates it the same way. For Homebrew or Scoop it prints `brew upgrade flisk` or `scoop update flisk` instead, because those tools own the files. `flisk upgrade --force` reinstalls even when you are on the latest version, and `flisk upgrade --all` updates every Flisk installation found on `PATH`. Run `flisk upgrade --dry-run` to see what would change. See [install the binary](install/binary.md#homebrew).
