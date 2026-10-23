# flask

**Stack:** a minimal Flask 3 app (Python 3.12), `app.py`, `requirements.in` (the dependencies you want), and `requirements.txt` (hash-locked from it with `uv pip compile --generate-hashes`)

**Notes:**
- Flask has no project generator, so unlike the `create-*` examples the app is written out here (a `/health` route and a `/` route).
- `flask run --host 0.0.0.0 --port $PORT` makes the development server reachable and uses the port Flisk assigns. It is for local
  use only; use a production server such as gunicorn outside Flisk.
- Through Flisk, Traefik sends `Host: api.<project>.localhost`; Flask's development server accepted it with no host configuration
  (checked through a real `flisk up`).
- Flisk's native Python provider is FastAPI (`--language python`); this example is for people who already use Flask.
- Flask is pulled from PyPI at build time within `>=3.0,<4`.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/health`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-example.sh flask
```

Through a real `flisk up` and Traefik, which sends `Host: api.<project>.localhost` (needs Docker, Tilt and a built CLI):

```bash
VERIFY_WAIT_SECONDS=300 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh flask /health
```

## Register it in a Flisk project

```bash
flisk resource flask-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
