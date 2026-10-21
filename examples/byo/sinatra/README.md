# sinatra

**Stack:** a minimal Sinatra 4 app (Ruby 3.4, Puma), three files: `app.rb`, `Gemfile` and the Dockerfile

**Notes:**
- Sinatra has no project generator, so unlike the `create-*` examples the app is written out here (a `/health` route and a `/`
  route).
- A classic-style app starts its own server when run with `ruby app.rb`. `app.rb` sets `bind` to `0.0.0.0` and `port` from `$PORT`.
- **The Gemfile needs `rackup` as well as `puma`.** With only `sinatra` and `puma`, the container exits at start with
  `Sinatra could not start, the required gems weren't found! ... bundle add rackup puma` (Sinatra 4 runs on Rack 3).
- Through Flisk, Traefik sends `Host: api.<project>.localhost`; the app accepted it with no host configuration (checked through a
  real `flisk up`). I did not look into why, so no claim is made about Sinatra's host-authorization settings.
- No database. For a fuller Ruby framework see [rails](../rails/README.md).

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/health`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-example.sh sinatra
```

Through a real `flisk up` and Traefik, which sends `Host: api.<project>.localhost` (needs Docker, Tilt and a built CLI):

```bash
VERIFY_WAIT_SECONDS=400 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh sinatra /health
```

## Register it in a Flisk project

```bash
flisk resource sinatra-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
