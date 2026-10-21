# create-react-router

**Stack:** a real `create-react-router` project (default template, framework mode, Vite)

**Notes:** scaffolder runs at build time with `--yes --no-install --no-git-init --no-agent-skills`;
`react-router dev --host 0.0.0.0` with the port from `PORT`. Framework mode owns its Vite config
(`vite.config.ts`, `react-router.config.ts`), so this is a bring-your-own resource, not a Flisk frontend provider.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/`:

```bash
VERIFY_WAIT_SECONDS=60 tests/e2e/resource-types/bring-your-own/verify-byo-example.sh create-react-router /
```

## Register it in a Flisk project

```bash
flisk resource create-react-router-web --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path / --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
