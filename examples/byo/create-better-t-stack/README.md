# create-better-t-stack

**Stack:** a real `create-better-t-stack` monorepo (TanStack Router web + Hono server, no database)

**Notes:** needs npm >= 11.16 (the image upgrades it); runs the API server in the background and the web
app on `PORT`. Only the web port is routed by Flisk.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-example.sh create-better-t-stack /
```

## Register it in a Flisk project

```bash
flisk resource create-better-t-stack-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
