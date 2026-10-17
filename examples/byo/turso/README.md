# turso

**Stack:** Turso's open-source server (libSQL `sqld`), from `ghcr.io/tursodatabase/libsql-server:latest`, wrapped in a three-line Dockerfile

**Notes:**
- This is a database **server** that other resources connect to, not an app. The app that connects to it is
  [turso-app](../turso-app/README.md).
- The upstream image listens on 8080 and ignores `PORT`, and a `service.json` has no environment field, so the Dockerfile only changes
  the command: `SQLD_HTTP_LISTEN_ADDR=0.0.0.0:$PORT`. The image's own entrypoint (it creates the data directory and drops to the
  `sqld` user) is kept.
- Health path is `/health`, which answers HTTP 200. `/version` reported `sqld 0.24.33` when this was written, and a write plus a read
  over the HTTP pipeline (`POST /v2/pipeline`) worked against the plain image.
- The image is `:latest`, so the version floats. The image has a native arm64 build (checked on an Apple Silicon Mac); I did not test
  x86_64.
- Data lives in the container's filesystem, so it is lost when the container is recreated. There is no volume here.
- This runs **local** libSQL. It does not use Turso Cloud, auth tokens, embedded replicas or sync, and makes no performance or scale claim.
- TDK still provides its own Postgres. Pointing an app at this server is separate from `DATABASE_URL`, which TDK sets to Postgres in
  every bring-your-own container.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/health`:

```bash
VERIFY_WAIT_SECONDS=60 tests/e2e/resource-types/bring-your-own/verify-byo-example.sh turso /health
```

The server together with an app that uses it, through a real `tdk up` and Traefik:

```bash
VERIFY_WAIT_SECONDS=600 scripts/verify-byo-pair.sh turso 4500 /health turso-app LIBSQL_URL /health
```

## Register it in a TDK project

Pin the port, because the app needs to know where to connect:

```bash
tdk resource turso --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path /health --port 4500 --yes
```

Use a resource name that is unique across TDK projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
