# rsbuild

**Stack:** a real `create-rsbuild` app

**Notes:** scaffolder runs at build time; `rsbuild dev --host 0.0.0.0`. Full guide: [docs/recipes/rsbuild.md](../../../docs/recipes/rsbuild.md)

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-example.sh rsbuild /
```

## Register it in a TDK project

```bash
tdk resource rsbuild-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --yes
```

Use a resource name that is unique across TDK projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
