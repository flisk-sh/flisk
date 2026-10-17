# create-nuxt

**Stack:** a real `nuxi init` project (Nuxt minimal template, whatever `nuxi@latest` ships)

**Notes:** scaffolder runs at build time (`--template minimal --no-install --gitInit=false`); `nuxt dev --host 0.0.0.0`
with the port from `PORT`. Nuxt owns its build config (`nuxt.config.ts`, Nitro), so this is a bring-your-own resource,
not a TDK frontend provider. Startup time was not measured, so the check below uses a longer wait than the default.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/`:

```bash
VERIFY_WAIT_SECONDS=120 tests/e2e/resource-types/bring-your-own/verify-byo-example.sh create-nuxt /
```

## Register it in a TDK project

```bash
tdk resource create-nuxt-web --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path / --yes
```

Use a resource name that is unique across TDK projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
