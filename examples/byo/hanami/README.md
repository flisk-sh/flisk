# hanami

**Stack:** a real `hanami new` app (Hanami 2, Ruby 3.4, `--skip-db --skip-assets`)

**Notes:**
- The generator runs at build time (`gem install hanami`, then `hanami new bookshelf --skip-db --skip-assets` and
  `bundle install`). The Hanami version is whatever `gem install hanami` resolves to. `app` is a reserved name for the
  generator, so the app directory is `bookshelf`.
- `bundle exec hanami server --host 0.0.0.0 --port $PORT` makes the server reachable and uses the port TDK assigns. It is for
  local development only.
- A new Hanami app has no routes and no `/health`. In development it answers `/` with 200 and its welcome page, so the health
  path is `/`. That proves the server boots, not that any application route works.
- Unlike Rails, Hanami did not block Traefik's `Host: api.<project>.localhost` header: no host override was needed, as observed
  in the `tdk up` run below.
- No database: `--skip-db` leaves out the DB layer, so TDK's injected `DATABASE_URL` is unused.
- Not covered: routes, actions, views beyond the welcome page, a database (ROM), assets, production mode.
- The first image build installs gems and takes several minutes.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/`:

```bash
VERIFY_WAIT_SECONDS=60 tests/e2e/resource-types/bring-your-own/verify-byo-example.sh hanami /
```

Then through a real `tdk up` and Traefik (needs Docker, Tilt and a built CLI):

```bash
VERIFY_WAIT_SECONDS=900 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh hanami /
```

Observed: `PASS hanami: GET / -> 200` (standalone) and `PASS hanami: through tdk up and Traefik, GET /api/<name>/ -> 200`.

## Register it in a TDK project

```bash
tdk resource hanami-web --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path / --yes
```

Use a resource name that is unique across TDK projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
