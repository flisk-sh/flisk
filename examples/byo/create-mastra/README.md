# create-mastra

**Stack:** a real `create-mastra` project (empty template)

**Notes:** scaffolder runs at build time; `mastra dev` reads `PORT` and is reachable beyond loopback.
Slow start (about 45 seconds of bundling), so run the check with a longer wait.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/health`:

```bash
VERIFY_WAIT_SECONDS=120 tests/e2e/resource-types/bring-your-own/verify-byo-example.sh create-mastra /health
```

## Register it in a Flisk project

```bash
flisk resource create-mastra-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
