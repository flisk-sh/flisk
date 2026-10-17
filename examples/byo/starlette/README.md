# starlette

**Stack:** a minimal Starlette app served by uvicorn (Python 3.12), `app.py`, `requirements.in` (the dependencies you want), and `requirements.txt` (hash-locked from it with `uv pip compile --generate-hashes`)

**Notes:**
- Starlette has no project generator, so unlike the `create-*` examples the app is written out here (a `/health` route and a `/` route).
- `uvicorn app:app --host 0.0.0.0 --port $PORT` makes the server reachable from outside the container and uses the port TDK assigns.
- Through TDK, Traefik sends `Host: api.<project>.localhost`; Starlette accepted it with no host configuration (checked through a
  real `tdk up`).
- TDK's native Python provider is FastAPI, which is built on Starlette; this example is for people who use Starlette directly.
- Starlette and uvicorn are pulled from PyPI at build time within `>=0.40,<1` and `>=0.30,<1`.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/health`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-example.sh starlette
```

Through a real `tdk up` and Traefik, which sends `Host: api.<project>.localhost` (needs Docker, Tilt and a built CLI):

```bash
VERIFY_WAIT_SECONDS=300 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh starlette /health
```

## Register it in a TDK project

```bash
tdk resource starlette-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --yes
```

Use a resource name that is unique across TDK projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
