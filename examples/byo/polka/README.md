# polka

**Stack:** a minimal Polka 0.5 app (Node 22), two files: `server.js` and `package.json`

**Notes:**
- Polka has no project generator, so unlike the `create-*` examples the app is written out here (a `/health` route and a `/` route).
- `.listen(Number(process.env.PORT), "0.0.0.0")` meets the container contract: it reads the port TDK assigns and listens beyond
  loopback.
- Polka has no built-in JSON helper, so the example sets the content type and writes the JSON itself.
- Through TDK, Traefik sends `Host: api.<project>.localhost`; Polka accepted it with no host configuration (checked through a real
  `tdk up`).
- `polka` is pulled from npm at build time within `^0.5.2`. 0.5 is the stable line; 1.0 is still a pre-release.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/health`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-example.sh polka
```

Through a real `tdk up` and Traefik, which sends `Host: api.<project>.localhost` (needs Docker, Tilt and a built CLI):

```bash
VERIFY_WAIT_SECONDS=300 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh polka /health
```

## Register it in a TDK project

```bash
tdk resource polka-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --yes
```

Use a resource name that is unique across TDK projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
