# solid-start

**Stack:** a real SolidStart v2 app (`create-solid`, basic template, TypeScript, Vite)

**Notes:**
- The scaffolder runs at build time with `-p app -s --v2 -t basic --ts` and stdin closed. Without `--v2` it stops at the prompt
  "Which version of SolidStart?" and creates nothing.
- `vite dev --host 0.0.0.0 --port $PORT` makes the dev server reachable and uses the port Flisk assigns.
- SolidStart owns its Vite config and server runtime, so this is a bring-your-own resource. Flisk's native `solid` provider
  (`--framework solid`) is for a client-rendered Solid SPA, which is what this example is not.
- The SolidStart version is whatever `create-solid@latest` ships.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/`:

```bash
VERIFY_WAIT_SECONDS=90 tests/e2e/resource-types/bring-your-own/verify-byo-example.sh solid-start /
```

Through a real `flisk up` and Traefik (needs Docker, Tilt and a built CLI), which sends `Host: api.<project>.localhost`:

```bash
VERIFY_WAIT_SECONDS=400 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh solid-start /
```

## Register it in a Flisk project

```bash
flisk resource solidstart-web --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path / --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
