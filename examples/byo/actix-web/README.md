# actix-web

**Stack:** a minimal hand-written Actix Web 4 app (Rust, `cargo build --release`). Actix has no project generator, so the app is
the files next to the Dockerfile. Flisk's native Rust provider uses axum; this is the Actix route.

**Notes:**
- `HttpServer::bind(("0.0.0.0", $PORT))` makes the server reachable and uses the port Flisk assigns (default 8080 outside Flisk).
- Health path is `/health` (200 `ok`), the Flisk default, so no `--health-path` is needed.
- The Dockerfile builds dependencies in a separate layer first, so editing `src/` does not recompile Actix. The runtime stage
  is `debian:stable-slim` with just the binary.
- The first build compiles Actix and its dependencies and takes several minutes.
- Not covered: a database (Flisk's injected `DATABASE_URL` is unused), TLS, workers/threads tuning, a distroless or musl image.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/health`:

```bash
VERIFY_WAIT_SECONDS=60 tests/e2e/resource-types/bring-your-own/verify-byo-example.sh actix-web /health
```

Then through a real `flisk up` and Traefik (needs Docker, Tilt and a built CLI):

```bash
VERIFY_WAIT_SECONDS=900 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh actix-web /health
```

Observed: `PASS actix-web: GET /health -> 200 (ok)` and `PASS actix-web: through flisk up and Traefik, GET /api/<name>/health -> 200 (ok)`.

## Register it in a Flisk project

```bash
flisk resource actix-web-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
