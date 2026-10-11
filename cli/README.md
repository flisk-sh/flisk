# 🚀 TDK CLI — start services on your machine

TDK CLI — start services on your machine. It is not a deploy and not a Compose file. Define services in `service.json`, then run `tdk up`. No Kubernetes is needed on the machine. If your existing Helm, Compose, or Tilt workflow already works locally, keep using it.

> Command reference for the `tdk` CLI. See the **[main README](../README.md)** for onboarding and the **[Helm handoff guide](../docs/with-helm.md)** for the local-development/production boundary.

New to contributing? Start with the [step-by-step contributor guide](../docs/contributing/README.md). To add a Vite frontend framework, see the [frontend provider guide](../docs/frontend-framework-providers.md).

## Cheat sheet

Run in a project with Bun, Docker, and Tilt. On Windows, run the CLI in WSL2.

| Command | When to use it |
| --- | --- |
| `tdk project --yes` | Create a project with the default setup. |
| `tdk resource api --type backend --stack api --yes` | Scaffold `api` directly into the `api` stack. |
| `tdk stack api` | Assign unstacked resources to `api` interactively. |
| `tdk stacks --services` | See which resources belong to each stack. |
| `tdk resources --ports` | Check resource assignments and port mappings. |
| `tdk up api` | Start services in the `api` stack. |
| `tdk status` | Check the current stack and service state. |
| `tdk down --force` | Stop all services without a confirmation prompt. |
| `tdk doctor --no-ping` | Check readiness without pinging service health endpoints. |
| `tdk projects --check` | Validate project configuration before CI. |

Every command and flag: [mega cheat sheet](../docs/cheat-sheet.md).

---

## 🏗️ Project-Stack-Resource Commands

### 🌍 Project Level

Initialize your project with master configuration files:

```bash
# 🆕 Initialize project (creates master configs)
tdk project

# 📊 Check project info and config status
tdk projects                  # Overview

tdk projects --check          # ✅ CI validation (exit 0/1)
tdk projects --json           # Versioned JSON report
tdk projects --json --check   # Machine-readable CI validation (exit 0/1; 1 also if no project root)
```

**Creates:**
- ⚙️ `TILT_RESOURCE_DEFAULTS.star` — Platform config (ports 3000-4999, health checks, memory limits)
- ⚙️ `TILT_TECH_STACK.star` — Platform technology labels and compatibility checks, not version pins. See [the tech stack guide](../docs/tech-stack-lock.md).

---

### 📦 Stack Level

Organize resources into deployment groups:

```bash
# 📋 List all stacks
tdk stacks
tdk stacks --json
tdk stacks --services     # 🔍 Include resources in each stack

# 🗂️  Organize resources into stacks (interactive)
tdk stack api
tdk stack order

# Scriptable assignment (names can be comma- or space-separated)
tdk stack api --resources orders-api users-api --yes
tdk stack api --resources orders-api,users-api --yes
tdk stack --list

# ▶️ Start/stop a stack
tdk up api                     # 🚀 Start api stack
tdk up                         # 🚀 Start all stacks
tdk up --dry-run               # 🔍 Preview services and URLs without starting
tdk up --quiet                 # 🤫 Suppress non-essential output (-q)
tdk up --verbose               # 📝 Verbose output (shows runtime assets, Tilt logs) (-v)
tdk up --force                 # ⚡ Kill existing Tilt process before starting (-f)

tdk down                       # ⏹️  Stop all services and Tilt
tdk down --force               # ⚡ Skip confirmation (-f)
tdk down --dry-run             # 🔍 Show the command without stopping resources
tdk down --verbose             # 📝 Verbose output (-v)
tdk down --prune-networks      # 🧹 Also remove unattached Docker networks for this project
```

For non-interactive assignment of unassigned resources, pass the stack name and `--resources`; names may be space- or comma-separated. Add `--yes` to skip confirmation. Use `tdk stack --list` to inspect unassigned resources without changing them.

---

### ⚡ Resource Level

Create and manage individual services:

```bash
# 📋 List all resources
tdk resources
tdk resources --json
tdk resources --stack api     # 🔍 Filter by stack
tdk resources --type backend  # Filter by resource type
tdk resources --type backend --stack api
tdk resources --no-stack           # ⚠️ Show unassigned only
tdk resources --ports              # 🔌 Show port assignments
tdk resources --stack api --json
tdk resources --no-stack --json

# 🆕 Create new resource (interactive)
tdk resource my-api --type backend --stack api
tdk resource my-app --type frontend --stack api
tdk resource my-vue-app --type frontend --framework vue --stack api
tdk resource my-svelte-app --type frontend --framework svelte --stack api
tdk resource my-preact-app --type frontend --framework preact --stack api
tdk resource my-lit-app --type frontend --framework lit --stack api
tdk resource my-py-api --type backend --language python --stack api
tdk resource my-go-api --type backend --language go --stack api
tdk resource my-rust-api --type backend --language rust --stack api
tdk resource my-express-api --type backend --framework express --stack api
tdk resource my-elysia-api --type backend --framework elysia --stack api
tdk resource my-nest-api --type backend --framework nestjs --stack api
tdk resource my-koa-api --type backend --framework koa --stack api
tdk resource my-h3-api --type backend --framework h3 --stack api
tdk resource my-fastify-api --type backend --framework fastify --stack api
tdk resource my-worker --type worker --stack background
tdk resource my-mcp --type mcp --stack api

# Non-interactive resource creation
tdk resource my-api --type backend --stack api --yes
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

`service.json` files point to the published [JSON Schema](https://tdk-landscape.github.io/schema.service.json) for editor autocomplete and validation. The schema source is [`engine/schemas/service-schema.json`](../engine/schemas/service-schema.json); it documents supported service fields and known `featuresEnabled` names. Legacy manifests may use `type` in place of `appType`.

Backend creation defaults to Bun + Hono, exactly as it always has: omit `--language` and nothing changes. Use `--language python` for FastAPI on Python 3.12, `--language go` for a standard-library `net/http` service on Go 1.23, or `--language rust` for an axum service (Go and Rust have no live reload: Tilt rebuilds the image on change). The selected id is saved as `language` in `service.json`; a legacy manifest without it still means Bun and is never rewritten. The flag applies only to `--type backend`, and unknown ids fail before a resource is written. On the Bun runtime the HTTP framework is Hono by default. To use another, pass one of these to `--framework`:

| Id | Framework |
| --- | --- |
| `express` | Express 5 |
| `elysia` | Elysia 1 |
| `fastify` | Fastify 5 |
| `nestjs` | NestJS 11 |
| `koa` | Koa 3 |
| `h3` | h3 1.x |

The selected id is saved as `framework` in `service.json`. `--framework hono` is accepted and saved too, and omitting it changes nothing. `--framework` cannot be combined with `--language python`, and unknown ids fail before a resource is written. Languages without a provider can use `--type bring-your-own`. See the [backend provider guide](../docs/backend-language-providers.md) and the runnable [Python example](../examples/one-backend-python/README.md).

Frontend creation defaults to React. Use `--framework vue` for Vue 3, `--framework svelte` for Svelte 5, `--framework preact` for Preact 10, `--framework lit` for Lit 3, `--framework solid` for Solid 1, `--framework qwik` for Qwik 1, `--framework tanstack-router` for a React SPA with TanStack Router (client-side; TanStack Start SSR is a [bring-your-own](../docs/frontend-framework-providers.md#tanstack-start-ssr) app) or `--framework vanilla` for plain TypeScript with no UI framework; `--framework react` is also accepted. The selected id is saved in `service.json`. The flag applies only to frontend resources, and unknown ids fail before a resource is written. Existing frontend manifests without the field continue to use React. Run `tdk resource --frameworks` to list the registered ids, and an interactive terminal offers them as a picker (React first). Meta-frameworks that own their own server or build config (Next, Nuxt, SvelteKit, Astro, Angular, Remix, TanStack Start) are not Vite SPA providers: `--framework next` fails before anything is written and points to `tdk resource <name> --type bring-your-own`.

The frontend provider owns root `index.html` and starter source. After TDK generates runtime config, Vite uses `.autogenerated/vite.config.frontend.autogenerated.ts` for development and `.autogenerated/vite.config.build.autogenerated.ts` for builds. Docker, nginx, Traefik, ports, and generated API/environment modules are shared by both providers. See the [provider contribution guide](../docs/frontend-framework-providers.md) to add another Vite-based SPA framework.

---

## 🔄 Lifecycle Commands

| Command | Description | Example |
|---------|-------------|---------|
| `tdk up` | 🚀 Start all services | `tdk up` |
| `tdk up <stack>` | 🚀 Start a stack | `tdk up api` |
| `tdk up --dry-run` | 👀 Preview the services and URLs without Docker, Tilt, or file changes | `tdk up api --dry-run` |
| `tdk down` | ⏹️ Stop all services | `tdk down` |
| `tdk status` | 📊 Show resource status | `tdk status` |
| `tdk logs` | 📜 Print a bounded snapshot of recent logs from the running stack (`--json`) | `tdk logs` |

---

## 🛠️ Utility Commands

| Command | Description |
|---------|-------------|
| `tdk ui [--high-contrast] [--no-animations]` | 🎨 Interactive terminal UI |
| `tdk networks` | 🌐 Show Traefik-routed URLs (`--stack`, `--json`, `--raw`) |
| `tdk import [dir]` | 📥 Import the services a directory describes (`--dry-run`, `--yes`, `--force`) |
| `tdk eject` | 🚪 Write `EJECTED.md` describing the generated Tilt files; copies nothing (`--dry-run`, `--yes`) |
| `tdk mcp` | 🤖 Run a Model Context Protocol server over stdio for coding agents |
| `tdk config regenerate` | ♻️ Regenerate master config files from `.tdk/project.json` |
| `tdk config verify` | ✅ Check generated files match `.tdk/project.json` |
| `tdk config enable-infra <service>` | ➕ Enable an optional infrastructure service (`disable-infra` to turn it off) |
| `tdk doctor` | 🔍 Print ranked cold-start failures first, then check environment (Docker, Bun, Tilt, ports) |
| `tdk completion --install` | ⌨️ Install shell completions (`--shell bash\|zsh\|fish`) |
| `tdk upgrade` | ⬆️ Self-update to the latest version (`--dry-run`, `--force`) |
| `tdk version` | ℹ️ Show version |
| `tdk --help` | ❓ Show help |

`-v` is context-specific: `tdk -v` prints the version, while `tdk up -v` and `tdk down -v`
enable verbose output. Use `--version` and `--verbose` when clarity matters.

`tdk status` and `tdk ui` poll Tilt on `TILT_PORT` when it contains only decimal digits
and is in the range 1–65535. Missing or invalid values fall back to port 10350.

Use `tdk ui --high-contrast` for a brighter palette with clearer text hierarchy
and no dimmed secondary text. `tdk ui --no-animations` keeps the loading screen
static. If `NO_COLOR` is set (including an empty value), or `TERM` begins with
`dumb`, the environment takes precedence over `--high-contrast`: color styling
is disabled and ASCII markers, separators, and file-tree symbols are used.

If `tdk ui` finds no services, its empty state points to `tdk project` to create a
project and `tdk resource api --type backend` to add a service. Press `q` to leave
the UI before running these commands, then reopen it or press `r` to refresh
after another terminal adds a service.

---

## 🚀 Quick Start Workflow

```bash
# 1️⃣  Initialize project
cd my-project
tdk project

# 2️⃣  Create resources
tdk resource api-api --type backend --stack api
# → Creates service.json with port 4000
# → Generates src/index.ts with Hono starter
# → Creates Dockerfile, tests/, package.json

tdk resource api-app --type frontend --stack api
# → Creates service.json with port 3000
# → Generates React starter with Vite

# 3️⃣  Install dependencies
cd api-api && bun install
cd ../api-app && bun install

# 4️⃣  Start development
tdk up api

# 5️⃣  Check status
tdk status                     # 📋 Overview of stacks and resources
tdk status --stacks            # 🗂️  Show stack information (default)
tdk status --tilt              # 🔍 Query active Tilt resource status
tdk status --verbose           # 📝 Detailed resource breakdowns per stack (-v)
tdk status --json              # 🤖 Machine-readable JSON status report
tdk resources --stack api
```

---

## 📊 PSR Command Matrix

| Level | 🔨 Create/Action | 📋 List |
|-------|------------------|---------|
| **🌍 Project** | `tdk project` | `tdk projects` |
| **📦 Stack** | `tdk stack` | `tdk stacks` |
| **⚡ Resource** | `tdk resource` | `tdk resources` |

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

Cold first run: `npx @tdk-landscape/tdk-cli-core`; diagnostics: `npx @tdk-landscape/tdk-cli-core doctor`.

```bash
# Check local environment and project readiness
tdk doctor

# Skip pinging running services' /health endpoints
tdk doctor --no-ping

# Custom per-service ping timeout in milliseconds (default: 5000)
tdk doctor --ping-timeout 3000

# Machine-readable JSON readiness report
tdk doctor --json
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

When checks fail, `tdk doctor` prints each issue with `✗` in red. It prints `ℹ Fix: ...` when a check provides remediation.
The general Tilt-resource fix points to the URL printed by `tdk up`; the default port can be auto-switched when occupied, and `TILT_PORT` can override it.

**Exit codes:**
- `0`: All required checks passed (warnings permitted).
- `1`: One or more blocking checks failed; environment or project needs fixing.
- `2`: Invalid CLI usage, option validation failure (e.g., non-positive `--ping-timeout`), or internal doctor-check error.

### Container footprint

Generated runtimes are sized so large landscapes fit on a 16 GB machine:

- **One process per container.** A service whose `start` script is just `bun run <file>` runs `bun <file>` directly under Docker's init (`init: true`). Any other `start` script keeps `bun run start`.
- **Healthchecks:** every 2 s during startup, then every 30 s. You can override the timing for a run:

  ```bash
  TDK_HEALTHCHECK_INTERVAL_SECONDS=15 tdk up
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

After `tdk project` + `tdk resource`:

```text
my-project/
├── ⚙️ TILT_RESOURCE_DEFAULTS.star
├── 🔧 TILT_TECH_STACK.star
├── 📄 Tiltfile
│
├── services/
│   └── api/
│       ├── api-api/           # 🆕 Created by tdk resource
│       │   ├── service.json      # Port 4000, stack: api
│       │   ├── package.json
│       │   ├── tsconfig.json
│       │   ├── Dockerfile
│       │   ├── src/
│       │   │   └── index.ts      # Hono starter
│       │   └── tests/
│       │       └── api-api.test.ts
│       │
│       └── api-app/         # 🆕 Created by tdk resource
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
    └── notification-worker/      # 🆕 Created by tdk resource
        └── ...
```

---

## 🆘 Getting Help

```bash
# General help
tdk --help

# Command help
tdk resource --help
tdk stack --help
tdk up --help
tdk eject --help
tdk import --help
```

To bring an existing repo in (Procfile, Compose, Dockerfile, `package.json`), `tdk import` runs [tdk-import](https://github.com/tdk-landscape/tdk-import) (it needs `npx`). Flags such as `--dry-run`, `--yes`, `--force` and `--only` go straight to it.

---

## 📚 Documentation

- [Main README](../README.md)
- [Feature flags](../docs/FEATURES.md)
- [Bring-your-own resources](../docs/byo.md)
- [Running a landscape from moon](../docs/recipes/moon.md)
- [Architecture](../engine/docs/README.md)
- [Tilt Extension](../ext/)

---

## 📝 License

[MIT](../LICENSE) © [TDK Landscape](https://github.com/tdk-landscape)

---

<div align="center">

**[⬆️ Back to Top](#-tdk-cli--start-services-on-your-machine)**

Made with 💚 for developers who ship

</div>

### Doctor machine output

Use `tdk doctor --json` for CI readiness checks. Exit codes: 0 ready (warnings permitted), 1 blocking findings, 2 usage/internal errors. See [doctor contract](../docs/reference/doctor-contract.md) for schema and migration details.

### Machine-readable status

`tdk status --json`, `tdk resources --json`, `tdk stacks --json`, and `tdk networks --json` emit one JSON object with `schemaVersion: 1`, `data`, and `errors`. Use `tdk status --json --tilt` to request live Tilt resources; without `--tilt`, the response reports Tilt availability and sets `resourcesQueried` to false. The old `tdk networks --json` array remains temporarily available as `tdk networks --json-legacy`; migrate consumers to `data.services` before that compatibility flag is removed. `tdk stacks --json` returns `data.stacks` with each stack name and resource count. `--services` adds service names, and `--verbose` adds descriptions. Diagnostics go to stderr.

See [machine-readable CLI](../docs/reference/machine-readable-cli.md) for JSON shapes, exit codes, schema evolution, and an agent polling example.
