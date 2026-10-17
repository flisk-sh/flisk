# deno-fresh

**Stack:** a real Deno Fresh 2 app (`jsr:@fresh/init`, Vite, no Tailwind), on the `denoland/deno` image

**Notes:** scaffolder runs at build time with `--force --tailwind=false --vscode=false --docker=false`; `deno task dev --host
0.0.0.0 --port $PORT` makes Fresh's Vite dev server reachable and uses the port TDK assigns. Fresh and Deno versions are
whatever `denoland/deno:latest` and `jsr:@fresh/init` resolve to at build time. Deno is a different runtime from Bun, so this
is a bring-your-own resource; a native Deno provider would be a larger change.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/`:

```bash
VERIFY_WAIT_SECONDS=90 tests/e2e/resource-types/bring-your-own/verify-byo-example.sh deno-fresh /
```

## Register it in a TDK project

```bash
tdk resource fresh-web --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path / --yes
```

Use a resource name that is unique across TDK projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
