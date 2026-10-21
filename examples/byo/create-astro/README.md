# create-astro

**Stack:** a real `create-astro` project (minimal template)

**Notes:** scaffolder runs at build time with `--template minimal --no-install --no-git --yes`; `astro dev --host 0.0.0.0`
with the port from `PORT`. Astro owns its own build config, so this is a bring-your-own resource, not a Flisk frontend
provider.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-example.sh create-astro /
```

## Register it in a Flisk project

```bash
flisk resource create-astro-web --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path / --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
