# goose

**Stack:** a [Goose](https://github.com/aardappel/goose) v2026.3 program (`orders.goose`) that writes static files at build time, served by BusyBox `httpd`

**Status:** built and run locally on amd64 with the harness steps (`PORT=4000`, `GET /health` returns 200).

**Notes:**
- Goose is not the server. Goose v2026.3 has no networking and no subprocesses ("Subprocesses and networking are not in v1" in its
  `docs/stdlib.md`), so a Goose program cannot listen on `PORT`.
- Instead, the first Docker stage installs the Goose Linux release (download pinned by sha256), runs `goose orders.goose` at build
  time to write `www/orders.json` and `www/health`, and the final `alpine` stage serves `/www` with `httpd -f -p 0.0.0.0:${PORT:-3000}`.
- Running a program in-process on Linux needs the C library headers, hence `libc6-dev` in the build stage.
- Not checked: that the Goose release runs on the build host's architecture (the release used is `linux-x64`), and anything about a
  Goose HTTP package such as `kaitk/goose-http`, which this example does not use.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/health`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-example.sh goose
```

Not checked through a real `flisk up` yet.

## Register it in a Flisk project

```bash
flisk resource goose-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
