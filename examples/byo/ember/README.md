# ember

**Stack:** a real `ember new` app (`@ember/app-blueprint`, Vite)

**Notes:** scaffolder runs at build time with `--skip-npm`; Vite `--host 0.0.0.0`

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-example.sh ember /
```

## Register it in a TDK project

```bash
tdk resource ember-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --yes
```

Use a resource name that is unique across TDK projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
