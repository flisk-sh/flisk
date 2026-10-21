# django

**Stack:** a real `django-admin startproject` app (Django from PyPI at build time, default SQLite, no external database)

**Notes:**
- The generator runs at build time and the Dockerfile applies the built-in migrations to the SQLite file once.
- **No `ALLOWED_HOSTS` change is needed.** Through Flisk, Traefik sends `Host: api.<project>.localhost`. With the generated
  `ALLOWED_HOSTS = []` and `DEBUG` on, Django allows `localhost` and its subdomains, so that host name is accepted (checked
  through a real `flisk up`, with no override). Projects that list hosts explicitly, as cookiecutter-django's `local.py` does,
  would need `.localhost` added (not run here).
- `runserver 0.0.0.0:$PORT --noreload` is Django's development server, for local use only.
- Django's welcome page on `/` is the health route (it answers 200 with `DEBUG` on).
- Django comes from PyPI at build time, so the version is whatever is current.
- For Django with PostgreSQL see the [cookiecutter-django](../cookiecutter-django/README.md) example.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-example.sh django /
```

Through a real `flisk up` and Traefik (needs Docker, Tilt and a built CLI):

```bash
VERIFY_WAIT_SECONDS=300 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh django /
```

## Register it in a Flisk project

```bash
flisk resource web-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path / --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
