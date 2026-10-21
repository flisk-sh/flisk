# chi

**Stack:** a minimal chi v5 app (Go 1.25), two files: `main.go` and `go.mod`

**Notes:**
- chi has no project generator, so unlike the `create-*` examples the app is written out here (a `/health` route and a `/` route).
- `go mod tidy` runs at build time to resolve chi and write `go.sum`, so no `go.sum` is committed. The chi version is whatever that
  resolves to.
- chi is a router for the standard library's `net/http`, so the server is `http.ListenAndServe(":" + $PORT, router)`, which listens on
  every interface.
- The image is `golang:1.25-alpine`, the same as the [gin](../gin/README.md) and [echo](../echo/README.md) examples. I did not test
  whether chi builds on an older Go image, so no minimum Go version is claimed.
- Through Flisk, Traefik sends `Host: api.<project>.localhost`; the app accepted it with no host configuration (checked through a
  real `flisk up`).
- Flisk's native Go provider (`--language go`) scaffolds standard-library `net/http`; this example is for people who already use chi.
  Other Go framework examples: [gin](../gin/README.md), [echo](../echo/README.md), [fiber](../fiber/README.md).

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/health`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-example.sh chi
```

Through a real `flisk up` and Traefik (needs Docker, Tilt and a built CLI):

```bash
VERIFY_WAIT_SECONDS=400 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh chi /health
```

## Register it in a Flisk project

```bash
flisk resource chi-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
