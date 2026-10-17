# Bring-Your-Own Resources

Wrap an existing service with TDK orchestration without generating application code.

## Command

```bash
tdk resource <name> --type bring-your-own --stack <stack>
```

Aliases: `byo`, `bring-your-own`

## service.json Example

```json
{
  "appName": "legacy",
  "appType": "bring-your-own",
  "stack": "shop",
  "port": 4500,
  "healthCheckPath": "/health",
  "dockerfile": "./Dockerfile"
}
```

## Notes

- TDK does not generate application code for this type
- Provide your own Dockerfile or use `--image <name>` to use an existing image
- Default port range: 4000-5999 (next free port)
- If Dockerfile exists, it will not be overwritten
- BYO resources receive the standard Traefik route by default. Use `--no-proxy` to disable it;
  this writes `exposeViaProxy: false` to the service manifest
- Use `--yes` in scripts to skip the create confirmation
- `--port` accepts an unused integer from 4000 through 5999
- By default, TDK writes an Nginx Dockerfile and health endpoint that listen on the assigned
  service port
- Set `"buildContext"` in `service.json` (a path relative to the resource directory) to build from a source tree elsewhere in the repo, as `tdk-import` does for an existing Dockerfile. `dockerfile` is then relative to that context. Without it the context is the resource directory
- Pass `--dockerfile <path>` to select a custom Dockerfile, or `--image <image>` to use an
  existing image without creating a Dockerfile

## One-shot jobs (migrations, seeders)

A bring-your-own container is restarted with `unless-stopped` by default, so a job that exits `0` is started again forever.
For a one-shot job, set the restart policy to `no`:

```bash
tdk resource migrate --type bring-your-own --stack shop --dockerfile ./Dockerfile --restart no --yes
```

`--restart` takes `no`, `on-failure`, `unless-stopped` (the default) or `always`, and is written to `service.json` as
`"restart": "no"`. It is rejected for any other resource type. Checked with a real `tdk up` (PR #275): a dbmate job
(`ghcr.io/amacneil/dbmate:2`, `dbmate up`) with `restart: "no"` applied its migration once and stayed `exited (0)` with zero restarts. A runnable version lives in [`examples/byo-jobs/`](../examples/byo-jobs/README.md); check it with `scripts/verify-byo-job.sh dbmate`.

## Bringing a framework app (Node, Go, Rust, ...)

Any app that fits the contract below can run as a bring-your-own resource. Fastify is the worked example because it needs nothing beyond the framework.

### What TDK needs from the container

1. **Listen on the port in `service.json`.** The generated Compose service sets `PORT` to that value, and also sets `DATABASE_URL`, so read the port from the environment instead of hard-coding it.
2. **Bind to `0.0.0.0`.** Traefik reaches the container over the Docker network, so a server that only binds `127.0.0.1` is unreachable.
3. **Answer HTTP 200 on `healthCheckPath`, if the service speaks HTTP.** Set it with `--health-path`. Traefik uses this check. TDK does not add a Compose `curl` health check for bring-your-own services, so the image does not need `curl`. A service that is not HTTP (a database, a mail relay, an SSH host) can leave `healthCheckPath` out of `service.json`: TDK then sends no HTTP probe to it and no Traefik health check, and the container counts as healthy once Docker reports it running.
4. **Provide the image.** Either a `Dockerfile` or `--image`. The Docker build context is the resource directory, so `COPY` paths are relative to it.

### Worked example: Fastify

```text
services/shop/orders-api/
  Dockerfile
  package.json
  server.js
```

```js
// server.js
import Fastify from 'fastify';
const app = Fastify({ logger: true });
app.get('/health', async () => ({ status: 'ok' }));
app.get('/orders', async () => [{ id: 1, item: 'tea' }]);
await app.listen({ port: Number(process.env.PORT ?? 3000), host: '0.0.0.0' });
```

```dockerfile
# Dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
CMD ["node", "server.js"]
```

```bash
tdk resource orders-api --type bring-your-own --stack shop \
  --dockerfile ./Dockerfile --health-path /health \
  --path services/shop/orders-api --yes
tdk up shop
```

The existing `Dockerfile` is kept, and the resource gets a `service.json` like the one at the top of this page (`appType: bring-your-own`, a port from 4000-5999, `healthCheckPath`, `dockerfile`).

### Limits

- **No live reload.** TDK does not sync source into a bring-your-own container, and only the manifest is watched. After changing source, rebuild the image from the Tilt UI or restart `tdk up`. For Go, the native provider has an opt-in loop (`dev.liveReload`, see [backend language providers](backend-language-providers.md#opt-in-live-reload)); a Go app you bring as a container, including the Gin example, does not get it.
- **Ports.** 4000-5999 for this type, shared with backends.
- **No generated code.** TDK will not add a health route, a `PORT` read or a Dockerfile for you.

### Examples and recipes

[`examples/byo/`](../examples/byo/README.md) has one folder per framework, each with a Dockerfile, its own `README.md`
and a check command:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-example.sh fastify          # health path /health
tests/e2e/resource-types/bring-your-own/verify-byo-example.sh create-vue /     # Vite apps answer on /
tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh full-stack-fastapi-template /api/v1/utils/health-check/   # needs a database: real tdk up
VERIFY_WAIT_SECONDS=120 tests/e2e/resource-types/bring-your-own/verify-byo-example.sh create-mastra /health   # slow starters
```

The check builds the image, runs it with `PORT=4000` and expects HTTP 200. Folders named `create-*`, `ember`, `rsbuild`
and similar run the real scaffolder at build time, so they stay in step with it.

Recipes for using TDK next to other tools live in [`recipes/`](recipes/): [moon](recipes/moon.md), [Rsbuild](recipes/rsbuild.md).

### Running more than one project

- **Resource names must be unique across TDK projects that share one Docker daemon.** Traefik watches every container,
  so two projects that both define `orders-api` clash and routes are dropped.
- **Docker can run out of address pools.** Each project creates several networks. When Docker answers
  `all predefined address pools have been fully subnetted`, the `init-networks` resource fails with Docker's message
  (`Failed to create Docker network <name>: ...`) and the services that need the network do not start. Free unused networks with `tdk down --prune-networks` in projects you no longer use (or `docker network prune` for every unused network).
- Through `tdk up`, a service is routed at `http://api.<project>.localhost/api/<name without -api>/...` with the prefix
  stripped, so a frontend served under that path needs its `base` set.

### What only `tdk up` shows

Running an image with `docker run` is not enough; these were found by running the example through a real `tdk up` and Traefik:

- **TDK sets a Postgres `DATABASE_URL` in every bring-your-own container,** even when the app has no database. A framework that
  prefers it over its own config can fail: the [Rails example](../examples/byo/rails/README.md) answered 500 (`pg is not part of the
  bundle`) until the server started with `DATABASE_URL` unset.
- **The `Host` header is `api.<project>.localhost`.** Rails' development host check blocked it (`Blocked hosts: ...`) until the example
  allowed any host. Most other examples accepted it with no change (Angular, Flask, Gin, Symfony, Quarkus, Micronaut, Echo, chi,
  Sinatra, Docusaurus, SolidStart, Phoenix). That list is the examples checked through `tdk up`; the others have not been.
- **A cold Docker cache is slow.** `tdk up` builds TDK's shared base images the first time, so give a first check several minutes.

One more trap shows up with a plain `docker run` as well, if you read the log: **a generator can write a loopback-only bind inside
`docker build`.** The [Phoenix example](../examples/byo/phoenix/README.md) failed its first check because the generator wrote
`127.0.0.1` in the image build but `0.0.0.0` when run inside a started container, so its Dockerfile rewrites the line and fails the build
if the result is not there.

### What has and has not been checked

Checked: each folder under `examples/byo/` builds and answers `200` on its health path when run with `PORT=4000`. Many also ran
through a full `tdk up` and Traefik; each folder's own `README.md` says which check it passed and what it did not cover, so look there
rather than at a list here. A persistent moon task ran `tdk up` (see the moon recipe).

Not checked: a production image for any example. Most examples run a dev server, and none of them was load-tested.
