# falcon

**Stack:** a minimal Falcon 4 ASGI app served by uvicorn (Python 3.12), `app.py`, `requirements.in` (the dependencies you want), and `requirements.txt` (hash-locked from it with `uv pip compile --generate-hashes`)

**Notes:**
- Falcon has no project generator, so unlike the `create-*` examples the app is written out here (a `/health` route and a `/` route).
- `uvicorn app:app --host 0.0.0.0 --port $PORT` makes the server reachable from outside the container and uses the port Flisk assigns.
  The app uses `falcon.asgi.App`, so it runs on uvicorn.
- Through Flisk, Traefik sends `Host: api.<project>.localhost`; Falcon accepted it with no host configuration (checked through a real
  `flisk up`).
- Falcon and uvicorn are pulled from PyPI at build time within `>=4,<5` and `>=0.30,<1`.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/health`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-example.sh falcon
```

Through a real `flisk up` and Traefik, which sends `Host: api.<project>.localhost` (needs Docker, Tilt and a built CLI):

```bash
VERIFY_WAIT_SECONDS=300 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh falcon /health
```

## Register it in a Flisk project

```bash
flisk resource falcon-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
