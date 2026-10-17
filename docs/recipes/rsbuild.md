# Running an Rsbuild app in a TDK landscape

[Rsbuild](https://rsbuild.dev) apps run as ordinary [bring-your-own resources](../byo.md). TDK does not generate or
change an Rsbuild config; the app keeps owning its build. The only container-specific part is making the dev server
reachable and using the port TDK assigns.

Verified with a real `create-rsbuild` app (React + TypeScript, no extra tools): the image builds, and
`tests/e2e/resource-types/bring-your-own/verify-byo-example.sh rsbuild /` prints `PASS rsbuild: GET / -> 200`.

## Dockerfile

```dockerfile
FROM node:22-alpine
WORKDIR /work
RUN npm create rsbuild@latest -- --dir app --template react-ts --tools none
WORKDIR /work/app
RUN npm install
CMD npx rsbuild dev --host 0.0.0.0 --port ${PORT:-3000}
```

Two settings matter, and both are Rsbuild's own, documented upstream:

- **Host.** Inside a container the dev server must listen beyond loopback so the published port can reach it. The
  `--host` flag and the [`server.host`](https://rsbuild.dev/config/server/host) option control this.
- **Port.** TDK sets `PORT` for the container. The `--port` flag and the
  [`server.port`](https://rsbuild.dev/config/server/port) option control it.

If you keep these in `rsbuild.config.ts` instead of flags, read the port from the environment:

```ts
import { defineConfig } from '@rsbuild/core';

export default defineConfig({
  server: { host: '0.0.0.0', port: Number(process.env.PORT ?? 3000) },
});
```

## Register it

```bash
tdk resource web --type bring-your-own --stack app --dockerfile ./Dockerfile --health-path / --yes
tdk up app
```

Rsbuild apps answer on `/`, so set `--health-path /` (the default is `/health`).

## Known limits

- TDK does not sync source into a bring-your-own container, so Rsbuild's hot reload only works if the source is
  available inside the container. Rebuild the image or restart `tdk up` after changing source.
- Through `tdk up`, the app is routed at `http://api.<project>.localhost/api/<name>/...` with the prefix stripped, so
  an app served under that path needs its `base` set (Rsbuild's `server.base` / `dev.assetPrefix`). This path was
  not run through Traefik here.
