# full-stack-fastapi-template

**Stack:** the real [fastapi/full-stack-fastapi-template](https://github.com/fastapi/full-stack-fastapi-template) backend
(FastAPI, SQLModel, Alembic, Postgres), cloned at build time and run with Flisk's `DATABASE_URL`. API only: the template's
React frontend is not built.

**Notes:**
- The template reads a plain `DATABASE_URL`, like Flisk provides. Flisk's ends in a Prisma-style `?schema=public`, which libpq
  rejects, so `entrypoint.sh` strips it.
- **Flisk does not create the database for a bring-your-own service**, so `ensure_db.py` creates it if missing and waits for
  Postgres, then `scripts/prestart.sh` runs `alembic upgrade head` and creates the initial superuser. If any step fails the
  container exits, so a `200` from the health route means the database, migrations and initial data all worked.
- The template refuses default secrets, so the entrypoint generates `SECRET_KEY` and `FIRST_SUPERUSER_PASSWORD` at start (set
  them yourself to keep them stable). `FIRST_SUPERUSER` defaults to `admin@example.com`.
- The template mounts a built frontend directory at import time; the image provides an empty one.
- Health path is `/api/v1/utils/health-check/`. Register it with `--health-path` set to that.
- **Port conflicts:** the template's own `docker-compose` publishes fixed host ports (for example 5432, 8000, 80 and 5173),
  which collide with Flisk's Postgres and Traefik and with other projects. Do not run both at once; under Flisk the service
  listens on `PORT` and is reached through Traefik.
- The template is cloned at its default branch, so the version is whatever is current at build time. It targets Python 3.14.
- Under `flisk up` the service is routed at `http://api.<project>.localhost/api/<name>/...`.

## Check it

Needs Docker, Tilt and a built CLI. This one needs a database, so the standalone `verify-byo-example.sh` cannot run it.
Instead run a real `flisk up` and expect `200` through Traefik. The first build installs the Python dependencies and can take
several minutes:

```bash
VERIFY_WAIT_SECONDS=600 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh full-stack-fastapi-template /api/v1/utils/health-check/
```

## Register it in a Flisk project

```bash
flisk resource orders-api --type bring-your-own --stack shop --dockerfile ./Dockerfile \
  --health-path /api/v1/utils/health-check/ --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon.
