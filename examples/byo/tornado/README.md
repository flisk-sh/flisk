# tornado

**Stack:** a minimal Tornado 6 app (Python 3.12), `app.py`, `requirements.in` (the dependencies you want), and `requirements.txt` (hash-locked from it with `uv pip compile --generate-hashes`)

**Notes:**
- Tornado has no project generator, so unlike the `create-*` examples the app is written out here (a `/health` route and a `/` route).
- `app.listen(PORT, address="0.0.0.0")` meets the container contract: it reads the port TDK assigns and listens beyond loopback.
  Tornado runs its own server, so there is no separate ASGI or WSGI server to configure.
- Through TDK, Traefik sends `Host: api.<project>.localhost`; Tornado accepted it with no host configuration (checked through a real
  `tdk up`).
- Tornado is pulled from PyPI at build time within `>=6.4,<7`.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/health`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-example.sh tornado
```

Through a real `tdk up` and Traefik, which sends `Host: api.<project>.localhost` (needs Docker, Tilt and a built CLI):

```bash
VERIFY_WAIT_SECONDS=300 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh tornado /health
```

## Register it in a TDK project

```bash
tdk resource tornado-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --yes
```

Use a resource name that is unique across TDK projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
