# elysia

**Stack:** a real Elysia app from `bun create elysia` (Bun, `oven/bun:1`)

**Notes:**
- This is for an **existing** Elysia app. To start a new one inside Flisk, use the native provider instead:
  `flisk resource api --type backend --framework elysia`.
- The scaffolder runs at build time (`bun create elysia app`, no prompts). The Elysia version is whatever it resolves to (`latest`).
- **The generated app needs one patch.** It hard-codes `.listen(3000)`, but Flisk assigns the port through `PORT`. The Dockerfile rewrites
  it to `.listen(Number(process.env.PORT ?? 3000))` and fails the build if the line is not there.
- The generated app answers `Hello Elysia` on `/` and has no `/health` route, so register it with `--health-path /`.
- Through Flisk, Traefik sends `Host: api.<project>.localhost`; the app accepted it with no host configuration (checked through a real
  `flisk up`).
- The container runs `bun run dev`, which is `bun run --watch src/index.ts`.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/`:

```bash
VERIFY_WAIT_SECONDS=90 tests/e2e/resource-types/bring-your-own/verify-byo-example.sh elysia /
```

Through a real `flisk up` and Traefik, which sends `Host: api.<project>.localhost` (needs Docker, Tilt and a built CLI):

```bash
VERIFY_WAIT_SECONDS=400 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh elysia /
```

## Register it in a Flisk project

```bash
flisk resource elysia-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path / --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
