# create-next-app

**Stack:** a real `create-next-app` project (App Router, TypeScript, ESLint, no Tailwind, no `src/` directory)

**Notes:** scaffolder runs at build time with `--ts --app --no-tailwind --eslint --no-src-dir --use-npm --yes --disable-git`
(it installs dependencies itself); `next dev -H 0.0.0.0 -p $PORT` makes the dev server reachable and uses the port Flisk
assigns. Next.js owns its build and server runtime, so this is a bring-your-own resource, not a Flisk frontend provider.
The Next.js version is whatever `create-next-app@latest` ships.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/`:

```bash
VERIFY_WAIT_SECONDS=90 tests/e2e/resource-types/bring-your-own/verify-byo-example.sh create-next-app /
```

## Register it in a Flisk project

```bash
flisk resource next-web --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path / --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
