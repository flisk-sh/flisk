# rails

**Stack:** a real `rails new` app (Ruby 3.4, `--minimal`, SQLite file, no Docker/Kamal/test scaffolding)

**Notes:**
- The generator runs at build time (`gem install rails`, then `rails new app --minimal --skip-git --skip-docker --skip-kamal
  --skip-test -d sqlite3`), followed by `bundle install` and `bin/rails db:prepare` for the SQLite file. The Rails version is
  whatever `gem install rails` resolves to.
- `bin/rails server -b 0.0.0.0 -p $PORT` makes the dev server reachable and uses the port Flisk assigns. It is for local use only.
- Health path is `/up`, the route Rails generates for health checks. Register it with `--health-path /up`.
- **Flisk's `DATABASE_URL` breaks this app unless it is unset.** Flisk gives every bring-your-own container a Postgres
  `DATABASE_URL`, and Rails prefers it over `config/database.yml`. Run with such a variable set, this app (SQLite adapter only)
  answers 500 with `Error loading the 'postgresql' Active Record adapter ... pg is not part of the bundle`. The standalone
  check passes because that run has no `DATABASE_URL`; the Dockerfile therefore starts the server with `env -u DATABASE_URL`.
  To use Flisk's Postgres instead, add the `pg` gem and migrate (see the database examples).
- **Rails blocks Traefik's host name by default.** Through `flisk up`, requests carry `Host: api.<project>.localhost`, and Rails'
  development host check answered every request with `Blocked hosts: api.<project>.localhost`. The Dockerfile adds
  `config/initializers/tdk_hosts.rb` with `Rails.application.config.hosts.clear` (any host, for local use). The standalone check
  cannot show this, because it sends `127.0.0.1`; only the `flisk up` check does.
- No external database and no migrations job: the SQLite file lives in the image.
- The first image build compiles native gems and takes several minutes.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/up`:

```bash
VERIFY_WAIT_SECONDS=90 tests/e2e/resource-types/bring-your-own/verify-byo-example.sh rails /up
```

Then through a real `flisk up` and Traefik (needs Docker, Tilt and a built CLI), which is the check that matters for the host and
`DATABASE_URL` points above (the first build compiles native gems, so allow several minutes):

```bash
VERIFY_WAIT_SECONDS=900 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh rails /up
```

## Register it in a Flisk project

```bash
flisk resource rails-web --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path /up --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
