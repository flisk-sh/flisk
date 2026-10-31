# Run your app without Docker

Run your app on your own computer with one command, without installing [Docker](start/words.md#docker). If your app is a few [parts](start/words.md#app-parts) that each start with one [command](start/words.md#command), such as a back end (an API), a website and a worker, `flisk up` starts them all in the right order and prints the links to open. You need only Flisk and the program that runs your code.

**For developers:** a simple app does not need Docker or Tilt. Give each service a `command` in its `service.json`, and `flisk up` starts the services as local processes on your machine. All you need is the `flisk` CLI and your app's own runtime, such as Node.js, Python, Go or Bun.

Use this for the apps an [AI helper](start/words.md#ai-helper) (an AI coding agent) builds first: an API, a website, a worker. Use [the Docker + Tilt path](quickstart.md) when you need a [database](start/words.md#database), gateway routing (one web address for every part), or the same [container](start/words.md#container) you will deploy (put online).

## Example: an API and a website

Here is an app with two parts: a back end called `api` and a website called `web`. Each part has its own folder, with its code (`server.js`) and a small settings file (`service.json`):

```text
my-app/
├── api/
│   ├── server.js
│   └── service.json
└── web/
    ├── server.js
    └── service.json
```

`api/service.json` tells Flisk the back end's name, the command that starts it, the [port](start/words.md#port) it listens on, and the address to ask whether it is healthy:

```json
{
  "$schema": "https://flisk.sh/schema.service.json",
  "schemaVersion": 1,
  "appName": "api",
  "appType": "backend",
  "command": "node server.js",
  "port": 4000,
  "healthCheckPath": "/health"
}
```

`web/service.json` does the same for the website. `"dependsOn": ["api"]` means "start the back end first", and `env` tells the website where to find the back end:

```json
{
  "$schema": "https://flisk.sh/schema.service.json",
  "schemaVersion": 1,
  "appName": "web",
  "appType": "frontend",
  "command": "node server.js",
  "port": 3000,
  "dependsOn": ["api"],
  "env": { "API_URL": "http://localhost:4000" }
}
```

Start it from `my-app/`. Open a [terminal](start/words.md#terminal) in that folder and run:

```bash
flisk up
```

You will see something like this. Flisk starts `api`, waits until it is ready, then starts `web`. The two `✓` lines are the [localhost](start/words.md#localhost) links to open in your browser:

```text
Created .flisk/project.json (this directory is now a Flisk project)
Starting 2 services as local processes (no Docker, no Tilt)...
  - api: node server.js
  - web: node server.js (after api)
api | [flisk] started: node server.js (pid 41210)
api | api listening on port 4000
api | [flisk] ready
web | [flisk] started: node server.js (pid 41214)
web | website listening on port 3000
web | [flisk] ready
Flisk is up (local processes, no Docker).
Services:
  ✓ api → http://localhost:4000 (health: http://localhost:4000/health)
  ✓ web → http://localhost:3000
Stop: Ctrl+C here, or flisk down from another terminal
Logs: flisk logs --service <name>, or .flisk/native/logs/<service>.log
```

`flisk up` keeps running in that terminal window for as long as your app runs: it stays in the foreground, like `tilt up` does. Press Ctrl+C (hold Control and press C) to stop every service, or run `flisk down` from another terminal. A working copy of this example is the [`tests/fixtures/unopinionated`](../tests/fixtures/unopinionated) fixture.

## The service contract

| Field | Required | What it does |
| --- | --- | --- |
| `appName` | yes | The service name, used in `dependsOn`, logs and `--only`. |
| `appType` | yes | What the service is: `backend`, `frontend`, `worker`, `mcp`, `agent` or `bring-your-own`. The Docker port ranges do not apply to a local process. |
| `schemaVersion` | yes | `1`. `flisk up` still starts a service without it and tells you how to add it. |
| `command` | yes | A shell command, run from the service directory. It is what makes the service a local process. |
| `port` | no | The port the service listens on. Flisk passes it as `PORT`, waits for it to answer, and prints `http://localhost:<port>`. |
| `healthCheckPath` | no | A path such as `/health`. Flisk waits until `http://localhost:<port><path>` answers below 400 before it starts the services that depend on this one. |
| `env` | no | Extra environment variables. Values may use `${VAR}` or `${VAR:-default}` from the project `.env` or your shell. |
| `dependsOn` | no | Services that must be ready first. Each name must be another service with a `command`. |
| `restart` | no | `"no"` turns off the restart on exit. |

A service has exactly one runtime source: a `command`, or a container (`image`, `dockerfile`, or a Dockerfile Flisk generates). A service that declares `command` together with `image` or `dockerfile` is refused, and the error names the service.

`stack` is optional. Set it if you want to start a group with `flisk up <stack>`.

`dev.command` is a different field: it is the development command inside a container Flisk generates for languages such as Python. It does not make a service run without Docker.

## What `flisk up` does

- **Order.** It starts services in `dependsOn` order. A service starts once every service it depends on is ready. Ready means the health URL answers; without `healthCheckPath`, that the port accepts connections; without a port, that the process is still running after a second. It waits up to 60 seconds per service.
- **Logs.** Each line of output is prefixed with the service name. Lines are also written, with a timestamp, to `.flisk/native/logs/<service>.log`, which is what `flisk logs` reads.
- **Restarts.** A process that exits is started again after 1 second, then 2, 4, 8. After five quick exits in a row Flisk stops restarting it and says so. Set `"restart": "no"` for a one-shot job.
- **Checks before it starts.** It refuses to start when a command's program is not installed, a port is already in use (it names the process that holds it), two services share a port, or a `dependsOn` name is not a service with a command.
- **Nothing generated.** It writes `.flisk/project.json` the first time, plus `.flisk/native/` for logs and the process list (that folder ignores itself in git). No Dockerfile, Compose file, Tiltfile, Vite or TypeScript config.

## Other commands

| Command | With local processes |
| --- | --- |
| `flisk up --dry-run` | Shows the services, their commands and the start order. |
| `flisk up --only web` | Starts `web` and what it depends on. |
| `flisk up --json` | Prints one JSON line when every service is ready, with `"runtime": "native"` and each service's URL. |
| `flisk down` | Stops every service, dependents first, and frees the ports. |
| `flisk status` | Shows each service as ready, restarting, or not running. |
| `flisk logs --service api --tail 50` | Recent output, merged across services in time order. `--since 5m` works too. |
| `flisk doctor` | Checks only what the services need: their programs are installed, their `dependsOn` and ports are valid, and running services answer. It does not check Docker, Compose, Tilt or the gateway ports. |

## When you need Docker

Remove `command` and use the [Docker + Tilt path](quickstart.md) for:

- a database such as Postgres, or other shared infrastructure (`dependsOn: ["postgres"]` is refused here);
- one gateway URL for every service, with routing by host and path (Traefik);
- running the same container image you deploy;
- live update inside containers, generated API clients, and the other generated files.

One project cannot mix the two yet: if some services declare `command` and others do not, `flisk up` stops and lists both groups. For live reload without Docker, use your runtime's own watch mode in the command, for example `node --watch server.js`, `bun --watch server.ts` or `uvicorn main:app --reload`.

Native Windows runs local processes too: each `command` runs through `cmd.exe`, and `flisk down` ends each service's whole process tree. Only the Docker path needs WSL2.

To see this path without writing anything, run `npx @flisk-sh/flisk demo` on a machine without Docker (or add `--no-docker`): it starts a two-service menu app as local processes and opens it.
