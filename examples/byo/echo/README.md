# echo

**Stack:** a minimal Echo v5 app (Go 1.26), two files: `main.go` and `go.mod`

**Notes:**
- Echo has no project generator, so unlike the `create-*` examples the app is written out here (a `/health` route and a `/` route).
- `go mod tidy` runs at build time to resolve Echo and write `go.sum`, so no `go.sum` is committed. Echo v5 declares Go 1.26,
  so the build image is `golang:1.26-alpine`. The image's `GOTOOLCHAIN=local` refuses a `go.mod` newer than the image.
- This example is on Echo v5 because Echo v4 has no fixed release for the proxy `X-Real-IP` advisory (GO-2026-6875) and the
  rate-limiter `X-Forwarded-For` advisory (GO-2026-6872); v5.4.0 or later fixes both. v5 handlers take `*echo.Context`, and the
  server starts with `echo.StartConfig`. Keep it at v5.4.0 or later.
- Through Flisk, Traefik sends `Host: api.<project>.localhost`; Echo accepted it with no host configuration (checked through a real
  `flisk up`).
- The server listens on `":" + $PORT` (every interface). Flisk's native Go provider (`--language go`) scaffolds standard-library
  `net/http`; this example is for people who already use Echo. Other Go framework examples: [gin](../gin/README.md),
  [fiber](../fiber/README.md).

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/health`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-example.sh echo
```

Through a real `flisk up` and Traefik, which sends `Host: api.<project>.localhost` (needs Docker, Tilt and a built CLI):

```bash
VERIFY_WAIT_SECONDS=400 tests/e2e/resource-types/bring-your-own/verify-byo-flisk.sh echo /health
```

## Register it in a Flisk project

```bash
flisk resource echo-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
