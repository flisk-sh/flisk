# cookiecutter-django

**Stack:** a real [cookiecutter-django](https://github.com/cookiecutter/cookiecutter-django) project (Django, no Docker, no
Celery, no mail catcher, no frontend pipeline), generated at build time and run with TDK's `DATABASE_URL`.

**Notes:**
- The generator runs non-interactively (`--no-input`) and its post-generation hook needs `uv`, so the image copies it in.
  The Dockerfile then runs `uv sync --frozen` against the generated `uv.lock`.
- The generated settings read `DATABASE_URL` through django-environ, like TDK provides. TDK's ends in a Prisma-style
  `?schema=public`, which PostgreSQL drivers do not accept as a connection parameter, so `entrypoint.sh` strips it. (The
  example was only run with it stripped.)
- **TDK does not create the database for a bring-your-own service**, so `ensure_db.py` creates it if missing and waits for
  Postgres, then `manage.py migrate` runs. If either fails the container exits, so a `200` means the database and
  migrations worked.
- `config/settings/tdk.py` extends the generated `local` settings with `ALLOWED_HOSTS = ["*"]`. The generated `local.py` only
  allows `localhost`, `0.0.0.0` and `127.0.0.1`, while Traefik sends `Host: api.<project>.localhost`. (The example was only
  run with the override, so the exact failure without it was not observed.)
- The app serves Django's development server (`runserver --noreload`), which is for local use only, and the secret key is
  generated at start unless `DJANGO_SECRET_KEY` is set.
- Project options are fixed in the Dockerfile; the generator is cloned from GitHub at build time, so the version is whatever
  is current.
- Under `tdk up` the service is routed at `http://api.<project>.localhost/api/<name>/...`.

## Check it

Needs Docker, Tilt and a built CLI. This one needs a database, so the standalone `verify-byo-example.sh` cannot run it.
Instead run a real `tdk up` and expect `200` through Traefik. The first build generates the project and installs its
dependencies and can take several minutes:

```bash
VERIFY_WAIT_SECONDS=600 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh cookiecutter-django /
```

## Register it in a TDK project

```bash
tdk resource web-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path / --yes
```

Use a resource name that is unique across TDK projects sharing one Docker daemon.
