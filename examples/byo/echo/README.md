# echo

**Stack:** a minimal Echo v4 app (Go 1.25), two files: `main.go` and `go.mod`

**Notes:**
- Echo has no project generator, so unlike the `create-*` examples the app is written out here (a `/health` route and a `/` route).
- `go mod tidy` runs at build time to resolve Echo and write `go.sum`, so no `go.sum` is committed. The Echo v4 version is whatever
  that resolves to. Echo v5 is a different major version and is not used here.
- The image is `golang:1.25-alpine`, the same as the [gin](../gin/README.md) example. I did not test whether Echo v4 also builds
  on an older Go image, so no minimum Go version is claimed.
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
VERIFY_WAIT_SECONDS=400 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh echo /health
```

## Register it in a Flisk project

```bash
flisk resource echo-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
