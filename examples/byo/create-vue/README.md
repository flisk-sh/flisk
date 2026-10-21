# create-vue

**Stack:** a real `create-vue` app

**Notes:** scaffolder runs at build time; Vite `--host 0.0.0.0`

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-example.sh create-vue /
```

## Register it in a Flisk project

```bash
flisk resource create-vue-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
