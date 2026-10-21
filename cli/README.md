# 🚀 Flisk CLI — start services on your machine

Flisk CLI — start services on your machine. It is not a deploy and not a Compose file. Define services in `service.json`, then run `flisk up`. No Kubernetes is needed on the machine. If your existing Helm, Compose, or Tilt workflow already works locally, keep using it.

> Command reference for the `flisk` CLI. See the **[main README](../README.md)** for onboarding and the **[Helm handoff guide](../docs/with-helm.md)** for the local-development/production boundary.

New to contributing? Start with the [step-by-step contributor guide](../docs/contributing/README.md). To add a Vite frontend framework, see the [frontend provider guide](../docs/frontend-framework-providers.md).

## Cheat sheet

Run in a project with Bun, Docker, and Tilt. On Windows, run the CLI in WSL2.

`flisk project` writes the project configuration and clones starter templates without a running Docker daemon or an installed Tilt; the runtime is only needed by `flisk up`.

| Command | When to use it |
| --- | --- |
| `flisk project --yes` | Create a project with the default setup. |
| `flisk resource api --type backend --stack api --yes` | Scaffold `api` directly into the `api` stack. |
| `flisk stack api` | Assign unstacked resources to `api` interactively. |
| `flisk stacks --services` | See which resources belong to each stack. |
| `flisk resources --ports` | Check resource assignments and port mappings. |
| `flisk up api` | Start services in the `api` stack. |
| `flisk status` | Check the current stack and service state. |
| `flisk down --force` | Stop all services. `--force` is accepted for script compatibility and has no effect. |
| `flisk doctor --no-ping` | Check readiness without pinging service health endpoints. |
| `flisk projects --check` | Validate project configuration before CI. |

Every command and flag: [mega cheat sheet](../docs/cheat-sheet.md).

---

## 🏗️ Project-Stack-Resource Commands

### 🌍 Project Level

Initialize your project with master configuration files:

```bash
# 🆕 Initialize project (creates master configs)
flisk project

# 📊 Check project info and config status
flisk projects                  # Overview

flisk projects --check          # ✅ CI validation (exit 0/1)
flisk projects --json           # Versioned JSON report
flisk projects --json --check   # Machine-readable CI validation (exit 0/1; 1 also if no project root)
```

**Creates:**
- ⚙️ `TILT_RESOURCE_DEFAULTS.star` — Platform config (ports 3000-4999, health checks, memory limits)
- ⚙️ `TILT_TECH_STACK.star` — Platform technology labels and compatibility checks, not version pins. See [the tech stack guide](../docs/tech-stack-lock.md).

---

### 📦 Stack Level

Organize resources into deployment groups:

```bash
# 📋 List all stacks
flisk stacks
flisk stacks --json
flisk stacks --services     # 🔍 Include resources in each stack

# 🗂️ Organize resources into stacks (interactive)
flisk stack api
flisk stack order

# Scriptable assignment (names can be comma- or space-separated)
flisk stack api --resources orders-api users-api --yes
flisk stack api --resources orders-api,users-api --yes
flisk stack --list

# ▶️ Start/stop a stack
flisk up api                     # 🚀 Start api stack
flisk up                         # 🚀 Start all stacks
flisk up --dry-run               # 🔍 Preview services and URLs without starting
flisk up --quiet                 # 🤫 Suppress non-essential output (-q)
flisk up --verbose               # 📝 Verbose output (shows runtime assets, Tilt logs) (-v)
flisk up --force                 # ⚡ Kill existing Tilt process before starting (-f)

flisk down                       # ⏹️ Stop all services and Tilt
flisk down --force               # ⚙️ Accepted for script compatibility; has no effect (-f)
flisk down --dry-run             # 🔍 Show the command without stopping resources
flisk down --verbose             # 📝 Verbose output (-v)
flisk down --prune-networks      # 🧹 Also remove unattached Docker networks for this project
```

For non-interactive assignment of unassigned resources, pass the stack name and `--resources`; names may be space- or comma-separated. Add `--yes` to skip confirmation. Use `flisk stack --list` to inspect unassigned resources without changing them.

---

### ⚡ Resource Level

Create and manage individual services:

```bash
# 📋 List all resources
flisk resources
flisk resources --json
flisk resources --stack api     # 🔍 Filter by stack
flisk resources --type backend  # Filter by resource type
flisk resources --type backend --stack api
flisk resources --no-stack           # ⚠️ Show unassigned only
flisk resources --ports              # 🔌 Show port assignments
flisk resources --stack api --json
flisk resources --no-stack --json

# 🆕 Create new resource (interactive)
flisk resource my-api --type backend --stack api
flisk resource my-app --type frontend --stack api
flisk resource my-vue-app --type frontend --framework vue --stack api
flisk resource my-svelte-app --type frontend --framework svelte --stack api
flisk resource my-preact-app --type frontend --framework preact --stack api
flisk resource my-lit-app --type frontend --framework lit --stack api
flisk resource my-py-api --type backend --language python --stack api
flisk resource my-go-api --type backend --language go --stack api
flisk resource my-rust-api --type backend --language rust --stack api
flisk resource my-node-api --type backend --language node --stack api
flisk resource my-express-api --type backend --framework express --stack api
flisk resource my-elysia-api --type backend --framework elysia --stack api
flisk resource my-nest-api --type backend --framework nestjs --stack api
flisk resource my-koa-api --type backend --framework koa --stack api
flisk resource my-h3-api --type backend --framework h3 --stack api
flisk resource my-fastify-api --type backend --framework fastify --stack api
flisk resource my-worker --type worker --stack background
flisk resource my-mcp --type mcp --stack api
flisk resource --frameworks                                     # list frontend frameworks
flisk resource --type backend --frameworks                      # list backend frameworks

# Non-interactive resource creation
flisk resource my-api --type backend --stack api --yes
```

`--yes` skips resource creation prompts and requires an explicit resource name. A new project uses the
`main` stack, an existing single-stack project reuses that stack, and a project with multiple stacks
must pass `--stack`. Without `--yes`, prompt answers can still be supplied on stdin for scripted use.

**Creates:**
- 📄 `service.json` — Auto-assigned port from master config
- 📦 `package.json` — Scripts, dependencies (Hono/Vite/Biome)
- ⚙️ `tsconfig.json` — TypeScript configuration
- 🐳 `Dockerfile` — Multi-stage build with health checks
- 💻 `src/` — Starter code (Hono, Express, Elysia, Fastify, NestJS, Koa or h3 for backend, React, Vue, Svelte, Preact, Lit, Solid, Qwik or plain TypeScript for frontend)
- 🧪 `tests/` — Vitest test file

`service.json` files point to the published [JSON Schema](https://raw.githubusercontent.com/flisk-sh/flisk/main/engine/schemas/service-schema.json) for editor autocomplete and validation. The schema source is [`engine/schemas/service-schema.json`](../engine/schemas/service-schema.json); it documents supported service fields and known `featuresEnabled` names. For the complete list of code generators controlled by `featuresEnabled`, see the [resource features guide](../docs/resource-features.md). Legacy manifests may use `type` in place of `appType`.

See the complete [`service.json` field reference](../docs/service-json.md) for field defaults, resource applicability, validation behavior, and backend/frontend examples.

Backend creation defaults to Bun + Hono, exactly as it always has: omit `--language` and nothing changes. Use `--language python` for FastAPI on Python 3.12, `--language go` for a standard-library `net/http` service on Go 1.23, `--language rust` for an axum service (Go and Rust have no live reload: Tilt rebuilds the image on change), or `--language node` for a Node.js 22 service with built-in `node:http` and `node --watch` live reload. The selected id is saved as `language` in `service.json`; a legacy manifest without it still means Bun and is never rewritten. The flag applies only to `--type backend`, and unknown ids fail before a resource is written. On the Bun runtime the HTTP framework is Hono by default. To use another, pass one of these to `--framework`:

| Id | Framework | Version |
| --- | --- | --- |
| `express` | Express | 5 |
| `elysia` | Elysia | 1 |
| `fastify` | Fastify | 5 |
| `nestjs` | NestJS | 11 |
| `koa` | Koa | 3 |
| `h3` | h3 | 1.x |

The selected id is saved as `framework` in `service.json`. `--framework hono` is accepted and saved too, and omitting it changes nothing. `--framework` cannot be combined with `--language python`, and unknown ids fail before a resource is written. Languages without a provider can use `--type bring-your-own`. See the [backend provider guide](../docs/backend-language-providers.md) and the runnable [Python example](../examples/one-backend-python/README.md).

An interactive terminal asks which backend framework to use and lists Hono first. `--yes`, a piped run and a language that owns its runtime (Python, Go, Rust, Node) never ask, so a script keeps the same output as before.

Run `flisk resource --type backend --frameworks` to list the registered backend frameworks with the language (and runtime) they are scaffolded with, their compatibility with the requested language, and the command that creates them:

```bash
$ flisk resource --type backend --frameworks
hono       Bun + Hono       bun       compatible with bun        flisk resource <name> --type backend --framework hono
express    Bun + Express    bun       compatible with bun        flisk resource <name> --type backend --framework express
elysia     Bun + Elysia     bun       compatible with bun        flisk resource <name> --type backend --framework elysia
fastify    Bun + Fastify    bun       compatible with bun        flisk resource <name> --type backend --framework fastify
h3         Bun + h3         bun       compatible with bun        flisk resource <name> --type backend --framework h3
koa        Bun + Koa        bun       compatible with bun        flisk resource <name> --type backend --framework koa
nestjs     Bun + NestJS     bun       compatible with bun        flisk resource <name> --type backend --framework nestjs
```

The compatibility cell names the language it is judged against (`bun` is the default backend language). Add `--language <id>` to see what that language rules out: a language that owns its runtime (Python, Go, Rust, Node) marks every framework as `incompatible with --language <id>`, and the command of such a row creates the resource in that language, without a framework:

```bash
$ flisk resource --type backend --language python --frameworks
hono       Bun + Hono       bun       incompatible with --language python    flisk resource <name> --type backend --language python
```

A requested `--language` is part of the printed command, so a copied row scaffolds the language the listing was asked about instead of silently falling back to Bun.

Frontend creation defaults to React. Use `--framework vue` for Vue 3, `--framework svelte` for Svelte 5, `--framework preact` for Preact 10, `--framework lit` for Lit 3, `--framework solid` for Solid 1, `--framework qwik` for Qwik 1, `--framework tanstack-router` for a React SPA with TanStack Router (client-side; TanStack Start SSR is a [bring-your-own](../docs/frontend-framework-providers.md#tanstack-start-ssr) app) or `--framework vanilla` for plain TypeScript with no UI framework; `--framework react` is also accepted. The selected id is saved in `service.json`. The flag applies only to frontend resources, and unknown ids fail before a resource is written. Existing frontend manifests without the field continue to use React. Run `flisk resource --frameworks` (or `flisk resource --type frontend --frameworks`) to list the registered ids, and an interactive terminal offers them as a picker (React first). Without a `--type` the listing stays this frontend one: `--language` is a backend option and does not apply to it. Meta-frameworks that own their own server or build config (Next, Nuxt, SvelteKit, Astro, Angular, Remix, TanStack Start) are not Vite SPA providers: `--framework next` fails before anything is written and points to `flisk resource <name> --type bring-your-own`.

The frontend provider owns root `index.html` and starter source. After Flisk generates runtime config, Vite uses `.autogenerated/vite.config.frontend.autogenerated.ts` for development and `.autogenerated/vite.config.build.autogenerated.ts` for builds. Docker, nginx, Traefik, ports, and generated API/environment modules are shared by both providers. See the [provider contribution guide](../docs/frontend-framework-providers.md) to add another Vite-based SPA framework.

---

## 🔄 Lifecycle Commands

| Command | Description | Example |
|---------|-------------|---------|
| `flisk up` | 🚀 Start all services | `flisk up` |
| `flisk up <stack>` | 🚀 Start a stack | `flisk up api` |
| `flisk up --dry-run` | 👀 Preview the services and URLs without Docker, Tilt, or file changes | `flisk up api --dry-run` |
| `flisk down` | ⏹️ Stop all services | `flisk down` |
| `flisk status` | 📊 Show resource status | `flisk status` |
| `flisk logs` | 📜 Print a bounded snapshot of recent logs from the running stack (`--json`) | `flisk logs` |

---

## 🛠️ Utility Commands

| Command | Description |
|---------|-------------|
| `flisk ui [--high-contrast] [--no-animations]` | 🎨 Interactive terminal UI |
| `flisk networks` | 🌐 Show Traefik-routed URLs (`--stack`, `--json`, `--raw`) |
| `flisk import [dir]` | 📥 Import the services in a directory's root `docker-compose.yml` (`--dry-run`, `--yes`, `--force`) |
| `flisk eject` | 🚪 Write `EJECTED.md` describing the generated Tilt files; copies nothing (`--dry-run`, `--yes`) |
| `flisk mcp` | 🤖 Run a Model Context Protocol server over stdio for coding agents |
| `flisk config regenerate` | ♻️ Regenerate master config files from `.tdk/project.json` |
| `flisk config verify` | ✅ Check generated files match `.tdk/project.json` |
| `flisk config enable-infra <service>` | ➕ Enable an optional infrastructure service (`disable-infra` to turn it off) |
| `flisk doctor` | 🔍 Print ranked cold-start failures first, then check environment (Docker, Bun, Tilt, ports) |
| `flisk completion --install` | ⌨️ Install shell completions (`--shell bash\|zsh\|fish\|powershell`); setup steps in the [cheat sheet](../docs/cheat-sheet.md#tdk-completion-shell) |
| `flisk upgrade` | ⬆️ Self-update to the latest version (`--dry-run`, `--force`, `--all`) |
| `flisk version` | ℹ️ Show version |
| `flisk --help` | ❓ Show help |

`-v` is context-specific: `flisk -v` prints the version, while `flisk up -v` and `flisk down -v`
enable verbose output. Use `--version` and `--verbose` when clarity matters.

`flisk status` and `flisk ui` poll Tilt on `TILT_PORT` when it contains only decimal digits
and is in the range 1–65535. Missing or invalid values fall back to port 10350.

Use `flisk ui --high-contrast` for a brighter palette with clearer text hierarchy
and no dimmed secondary text. `flisk ui --no-animations` keeps the loading screen
static. If `NO_COLOR` is set (including an empty value), or `TERM` begins with
`dumb`, the environment takes precedence over `--high-contrast`: color styling
is disabled and ASCII markers, separators, and file-tree symbols are used.

If `flisk ui` finds no services, its empty state points to `flisk project` to create a
project and `flisk resource api --type backend` to add a service. Press `q` to leave
the UI before running these commands, then reopen it or press `r` to refresh
after another terminal adds a service.

---

## 🚀 Quick Start Workflow

```bash
# 1️⃣ Initialize project
cd my-project
flisk project

# 2️⃣ Create resources
flisk resource api-api --type backend --stack api
# → Creates service.json with port 4000
# → Generates src/index.ts with Hono starter
# → Creates Dockerfile, tests/, package.json

flisk resource api-app --type frontend --stack api
# → Creates service.json with port 3000
# → Generates React starter with Vite

# 3️⃣ Install dependencies
cd api-api && bun install
cd ../api-app && bun install

# 4️⃣ Start development
flisk up api

# 5️⃣ Check status
flisk status                     # 📋 Overview of stacks and resources
flisk status --stacks            # 🗂️ Show stack information (default)
flisk status --tilt              # 🔍 Query active Tilt resource status
flisk status --verbose           # 📝 Detailed resource breakdowns per stack (-v)
flisk status --json              # 🤖 Machine-readable JSON status report
flisk resources --stack api
```

---

## 📊 PSR Command Matrix

| Level | 🔨 Create/Action | 📋 List |
|-------|------------------|---------|
| **🌍 Project** | `flisk project` | `flisk projects` |
| **📦 Stack** | `flisk stack` | `flisk stacks` |
| **⚡ Resource** | `flisk resource` | `flisk resources` |

---

## 🎨 Resource Types

| Type | Port Range | Template | Use Case |
|------|------------|----------|----------|
| `backend` | 4000-4999 | 🏎️ Hono API (or Express, Elysia, Fastify, NestJS, Koa, h3, or Python) | REST APIs, microservices |
| `frontend` | 3000-3999 | React (default), Vue, Svelte, Preact, Lit, Solid, Qwik or plain TypeScript + Vite | Web apps, dashboards |
| `worker` | (optional) | 🔧 Background worker | Queue processors, jobs |
| `mcp` | 4000-5999 | 🔌 Model Context Protocol server over HTTP (Bun; see [docs/mcp.md](../docs/mcp.md)) | Tools and context for AI clients |
| `bring-your-own` | 4000-5999 | none | Existing app with your own Dockerfile or image |
| `sdk` | — | none (register existing, `packages/<name>`) | Shared libraries |

---

## 🔒 Deterministic Operations

Use `Determinism` in your Tiltfile for reproducible builds:

```starlark
load('ext://tdk-cli', 'Determinism')

# Deterministic file discovery (sorted results)
files = Determinism.deterministic_find('./services', 'service.json')

# Deterministic service discovery
services = Determinism.deterministic_resource_discovery(['services/product'])

# Check deterministic mode
if Determinism.is_deterministic_mode():
    print("✅ Running in deterministic mode")
```

---

## 🔍 Environment Validation

Cold first run: `npx flisk`; diagnostics: `npx flisk doctor`.

```bash
# Check local environment and project readiness
flisk doctor

# Skip pinging running services' /health endpoints
flisk doctor --no-ping

# Custom per-service ping timeout in milliseconds (default: 5000)
flisk doctor --ping-timeout 3000

# Machine-readable JSON readiness report
flisk doctor --json
```

Checks for:
- ✅ Docker daemon running
- ✅ Bun runtime installed (v1.2+)
- ✅ Tilt CLI available
- ✅ Required ports free
- ✅ Tiltfile present
- ✅ Master config files exist
- ✅ Docker Engine 25+ and Docker Compose 2.20.2+ (generated healthchecks use `start_interval`)

### Options & Exit Codes

- `--no-ping`: Skip pinging running services' `/health` endpoints. Useful when checking host tools or static configurations without probing runtime services.
- `--ping-timeout <ms>`: Per-service health check timeout in milliseconds (must be a positive integer, defaults to `5000`).
- `--json`: Output a single machine-readable JSON readiness report on stdout (suppressing human banners and progress text) with `data.ready`, `data.checks` (`name`, `didPass`, `message`, optional `fix`, `isSkipped`, `isWarning`), `data.ports`, and `errors`. Uses the same exit codes as text mode:

  ```json
  {
    "schemaVersion": 1,
    "data": {
      "ready": false,
      "inProject": true,
      "checks": [
        { "name": "Container Runtime", "didPass": true, "message": "Docker daemon is running" },
        { "name": "Tilt CLI", "didPass": false, "message": "Tilt CLI not found", "fix": "curl -fsSL https://raw.githubusercontent.com/tilt-dev/tilt/master/scripts/install.sh | bash" }
      ]
    },
    "errors": []
  }
  ```
- `--fix`: When free disk is below 10 GB, also runs `docker builder prune -f` and `docker image prune -f` (untagged images only, never volumes), showing the reclaimable size. Before the checks run, remove unused Docker networks that belong to this project (the exact names `flisk up` creates) and leftover `tdk_doctor_probe_*` networks from interrupted runs. Asks before each removal. Never touches another project's networks, never runs `sudo`.
- `--scope <project|machine>`: With `--fix`, `machine` also removes unused networks of other Flisk projects on this machine (a project is recognised by its Traefik network), naming each owner. Default `project`.
- `--dry-run`: With `--fix`, list the commands without running them.
- `-y, --yes`: With `--fix`, run every repair without asking. Without a terminal and without `--yes`, repairs are skipped.

When checks fail, `flisk doctor` prints each issue with `✗` in red. It prints `ℹ Fix: ...` when a check provides remediation.
The general Tilt-resource fix points to the URL printed by `flisk up`; the default port can be auto-switched when occupied, and `TILT_PORT` can override it.

**Exit codes:**
- `0`: All required checks passed (warnings permitted).
- `1`: One or more blocking checks failed; environment or project needs fixing.
- `2`: Invalid CLI usage, option validation failure (e.g., non-positive `--ping-timeout`), or internal doctor-check error.

### Container footprint

Generated runtimes are sized so large landscapes fit on a 16 GB machine:

- **One process per container.** A service whose `start` script is just `bun run <file>` runs `bun <file>` directly under Docker's init (`init: true`). Any other `start` script keeps `bun run start`.
- **Healthchecks:** every 2 s during startup, then every 30 s. You can override the timing for a run:

  ```bash
  TDK_HEALTHCHECK_INTERVAL_SECONDS=15 flisk up
  ```

  The other overrides are `TDK_HEALTHCHECK_START_INTERVAL_SECONDS`, `TDK_HEALTHCHECK_TIMEOUT_SECONDS`, `TDK_HEALTHCHECK_START_PERIOD_SECONDS` and `TDK_HEALTHCHECK_RETRIES`.
- **Optional tooling is per service.** The golden backend image no longer ships `hugo`. A service that needs it declares it in `service.json`:

  ```json
  { "featuresEnabled": ["hugo"] }
  ```

To check a running backend against the idle budget (one Bun process, at most 64 MiB, under 2% CPU):

```bash
scripts/measure-idle-footprint.sh finance-autogenerated-cash-management-api-1
```

---

## 📁 Project Structure

After `flisk project` + `flisk resource`:

```text
my-project/
├── ⚙️ TILT_RESOURCE_DEFAULTS.star
├── 🔧 TILT_TECH_STACK.star
├── 📄 Tiltfile
│
├── services/
│   └── api/
│       ├── api-api/           # 🆕 Created by flisk resource
│       │   ├── service.json      # Port 4000, stack: api
│       │   ├── package.json
│       │   ├── tsconfig.json
│       │   ├── Dockerfile
│       │   ├── src/
│       │   │   └── index.ts      # Hono starter
│       │   └── tests/
│       │       └── api-api.test.ts
│       │
│       └── api-app/         # 🆕 Created by flisk resource
│           ├── service.json      # Port 3000, stack: api
│           ├── package.json
│           ├── tsconfig.json
│           ├── Dockerfile
│           ├── index.html
│           └── src/
│               ├── main.tsx
│               └── App.tsx
│
└── workers/
    └── notification-worker/      # 🆕 Created by flisk resource
        └── ...
```

---

## 🆘 Getting Help

```bash
# General help
flisk --help

# Command help
flisk resource --help
flisk stack --help
flisk up --help
flisk eject --help
flisk import --help
```

To bring an existing Compose repo in, `flisk import` runs [tdk-import](https://github.com/tdk-landscape/tdk-import) on the root `docker-compose.yml` (it needs `npx`). Flags `--dry-run`, `--yes` and `--force` go straight to it.

---

## 📚 Documentation

- [Main README](../README.md)
- [Writing unit tests for the CLI](../docs/contributing/08-write-cli-unit-tests.md)
- [Feature flags](../docs/FEATURES.md)
- [Bring-your-own resources](../docs/byo.md)
- [Running a landscape from moon](../docs/recipes/moon.md)
- [Architecture](../engine/docs/README.md)
- [Tilt Extension](../ext/)

---

## 📝 License

[MIT](../LICENSE) © [Flisk](https://github.com/tdk-landscape)

---

<div align="center">

**[⬆️ Back to Top](#-tdk-cli--start-services-on-your-machine)**

Made with 💚 for developers who ship

</div>

### Doctor machine output

Use `flisk doctor --json` for CI readiness checks. Exit codes: 0 ready (warnings permitted), 1 blocking findings, 2 usage/internal errors. See [doctor contract](../docs/reference/doctor-contract.md) for schema and migration details.

### Machine-readable status

`flisk status --json`, `flisk resources --json`, `flisk stacks --json`, and `flisk networks --json` emit one JSON object with `schemaVersion: 1`, `data`, and `errors`. Use `flisk status --json --tilt` to request live Tilt resources; without `--tilt`, the response reports Tilt availability and sets `resourcesQueried` to false. The old `flisk networks --json` array remains temporarily available as `flisk networks --json-legacy`; migrate consumers to `data.services` before that compatibility flag is removed. `flisk stacks --json` returns `data.stacks` with each stack name and resource count. `--services` adds service names, and `--verbose` adds descriptions. Diagnostics go to stderr.

See [machine-readable CLI](../docs/reference/machine-readable-cli.md) for JSON shapes, exit codes, schema evolution, and an agent polling example.
