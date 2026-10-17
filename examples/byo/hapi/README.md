# hapi

**Stack:** a minimal Hapi 21 app (Node 22), two files: `server.js` and `package.json`

**Notes:**
- Hapi has no project generator, so unlike the `create-*` examples the app is written out here (a `/health` route and a `/` route).
- `Hapi.server({ host: "0.0.0.0", port: Number(process.env.PORT) })` meets the container contract: it reads the port TDK assigns and
  listens beyond loopback. The default `host` is the machine name, which is not reachable from outside the container.
- Through TDK, Traefik sends `Host: api.<project>.localhost`; Hapi accepted it with no host configuration (checked through a real
  `tdk up`).
- `@hapi/hapi` is pulled from npm at build time within `^21.4.0`.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/health`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-example.sh hapi
```

Through a real `tdk up` and Traefik, which sends `Host: api.<project>.localhost` (needs Docker, Tilt and a built CLI):

```bash
VERIFY_WAIT_SECONDS=300 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh hapi /health
```

## Register it in a TDK project

```bash
tdk resource hapi-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --yes
```

Use a resource name that is unique across TDK projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
