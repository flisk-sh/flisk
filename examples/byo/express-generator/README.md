# express-generator

**Stack:** a real `express-generator` app (Express 4, no view engine)

**Notes:** scaffolder runs at build time; the generated `bin/www` reads `PORT` and listens on all interfaces, so
nothing is patched. The app serves its `public/index.html` on `/`.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-example.sh express-generator /
```

## Register it in a TDK project

```bash
tdk resource express-generator-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path / --yes
```

Use a resource name that is unique across TDK projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
