# create-adonisjs

**Stack:** a real `create-adonisjs` app (slim starter kit, no database)

**Notes:** scaffolder runs at build time; `HOST=0.0.0.0`, port from `PORT`

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-example.sh create-adonisjs /
```

## Register it in a Flisk project

```bash
flisk resource create-adonisjs-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
