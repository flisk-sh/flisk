# gin

**Stack:** a minimal Gin app (Go 1.25, which current Gin requires), two files: `main.go` and `go.mod`

**Notes:**
- Gin has no project generator, so unlike the `create-*` examples the app is written out here (a `/health` route and a `/`
  route).
- `go mod tidy` runs at build time to resolve Gin and write `go.sum`, so no `go.sum` is committed. The Gin version is whatever
  that resolves to.
- The server listens on `":" + $PORT` (every interface) and `GIN_MODE=release` turns off Gin's debug output.
- **Gin 1.12 needs Go 1.25.** With the `golang:1.23` image used by the Fiber example, `go mod tidy` stopped with
  `github.com/gin-gonic/gin@v1.12.0 requires go >= 1.25.0 (running go 1.23.12; GOTOOLCHAIN=local)`, so this image is `golang:1.25-alpine`.
- Through TDK, Traefik sends `Host: api.<project>.localhost`; Gin accepted it with no host configuration (checked through a real `tdk up`).
- TDK's native Go provider (`--language go`) scaffolds standard-library `net/http`; this example is for people who already use Gin.
  The other Go framework example is [fiber](../fiber/README.md).
- This example is a bring-your-own container, so it has **no live reload**. To get TDK's opt-in Go reload loop (`dev.liveReload`) for a Gin app, run it
  as a native Go service instead; the steps and what was checked are in
  [the Go provider guide](../../../docs/backend-language-providers.md#gin-and-other-go-frameworks).

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/health`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-example.sh gin
```

Through a real `tdk up` and Traefik, which sends `Host: api.<project>.localhost` (needs Docker, Tilt and a built CLI):

```bash
VERIFY_WAIT_SECONDS=300 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh gin /health
```

## Register it in a TDK project

```bash
tdk resource gin-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --yes
```

Use a resource name that is unique across TDK projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
