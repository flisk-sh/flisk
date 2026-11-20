# `package.json` scripts

A JavaScript or TypeScript service that Flisk builds keeps a `package.json` next to its `service.json`. Flisk's generated Docker images and the Tilt dev loop call some of its npm scripts by name, so a missing script shows up late: as a failed image build or a container that does not start. `flisk doctor` checks for them first.

## Required scripts by `appType`

| `appType` | Required scripts |
| --- | --- |
| `backend` | `dev`, `build`, `start` |
| `worker` | `dev`, `build`, `start` |
| `migrator` | `start` |
| `mcp` | `dev`, `build`, `start` |
| `agent` | `dev`, `build`, `start` |
| `frontend` | `dev`, `build` |
| `library` | `dev`, `build` |
| `sdk` | `dev`, `build` |
| `database`, `bring-your-own` | none |

Frontends, libraries and SDKs have no `start`: they are served as static files or used as packages, never run as a long-running process of their own. Backends, workers, MCP servers and agents are processes, so they need all three.

A migrator needs only `start`. It runs `prisma migrate deploy` once and exits: the generated Dockerfile replaces its backend compiler stage with the migration engine and sets `migrate.sh` as its entrypoint, so nothing calls a migrator's `dev` or `build` script. A migrator that defines them anyway is not penalised, but the starters do not ship them and doctor does not ask for them.

A service that declares `command` in its `service.json` runs as a local process. Flisk starts that command and never builds the service or calls a package.json script, so doctor does not check it. The generated agent starters (`swarm`, `security`, `super-agent`, `langgraph`, `tool-loop`) are this shape.

A service that ships its own Dockerfile, with a top-level `dockerfile` or `build.dockerfile` in `service.json`, owns its image build and its container command. Flisk does not call its package.json scripts, so doctor does not check it either. The portal starter is this shape: a backend with `dev` and `start` only.

A service with no `package.json` (a Python or Go service, for example) is not checked. A `service.json` without `appType` is checked as a `backend`.

The list is `REQUIRED_PACKAGE_SCRIPTS` in [`cli/src/utils/constants.ts`](../cli/src/utils/constants.ts).

## What each script is for

### `dev`

Runs the service from source while you work on it. A frontend container runs `bun run dev`. A Bun backend, worker, MCP server or agent whose `dev` script runs Bun under a watcher (`--watch` or `--hot`, as in `bun run --watch src/index.ts`) gets a `development` image target that runs `bun run dev`, so files Tilt syncs into the container restart the app. `"dev": { "liveReload": false }` in `service.json` turns that off. Without a watcher, the container runs the compiled `start` output.

```json
"dev": "bun run --watch src/index.ts"
```

### `build`

Compiles the service. The L3 build stage of the generated Dockerfile runs `bun run build` to produce what the image ships.

```json
"build": "tsc"
```

### `start`

Runs the compiled output. The L4 runtime stage uses it as the container command for backend-like services. When `start` only runs one entry file (`bun run dist/index.js` or `bun dist/index.js`), Flisk runs that file directly (`bun dist/index.js`), so the container holds one Bun process instead of two. Any other `start` script runs as `bun run start`.

```json
"start": "bun run dist/index.js"
```

## Examples

A migrator (only `start` is required; the starters ship only `migrate` and `start`):

```json
{
  "name": "reservation-migrator",
  "scripts": {
    "migrate": "prisma migrate deploy",
    "start": "prisma migrate deploy"
  }
}
```

A backend, worker, MCP server or agent:

```json
{
  "name": "reservation-api",
  "scripts": {
    "dev": "bun run --watch src/index.ts",
    "build": "tsc",
    "start": "bun run dist/index.js",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  }
}
```

A frontend, library or SDK:

```json
{
  "name": "checkout-app",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 3210",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

`test` and `typecheck` are not required; they are shown because most services have them.

`flisk resource <name> --type <type>` writes a `package.json` with the required scripts, so a scaffolded service passes the check from the start.

Database migrations belong in a `migrator` resource, not in a backend's `start` or `dev` script: a migration in a start script runs again on every restart and in every replica. See [`service.json`](service-json.md#example-postgres-then-a-migrator-then-an-api).

## Catching gaps early

`flisk doctor` finds every `service.json` in the project, reads the `package.json` next to it, and lists the required scripts each service is missing, before Tilt tries to run one. The check is called **Startup Scripts**:

```text
Services missing required package.json scripts:
    user-portal-api: missing "build", "start"
```

Its fix line suggests the scripts to add (`"dev": "bun run src/index.ts"`, `"build": "tsc"`, `"start": "bun run dist/index.js"`). A `package.json` that is not valid JSON is reported in the same list.

Run `flisk doctor` before `flisk up` to catch a missing `build` or `start` before it becomes a failed container. For the full manifest, see the [`service.json` reference](service-json.md) and [Configuration](configuration.md).
