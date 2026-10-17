# phoenix

**Stack:** a real Phoenix project from `mix phx.new` (Elixir 1.18, no Ecto, no mailer, no dashboard, no gettext, no assets
pipeline)

**Notes:**
- The generator runs at build time with `--no-ecto --no-mailer --no-dashboard --no-gettext --no-assets --install`, then
  `mix compile`. The Phoenix version is whatever `hex phx_new` resolves to (1.8.x when this was written).
- **One patch is needed, and it is easy to miss.** Inside `docker build` the generator writes `http: [ip: {127, 0, 0, 1}]` in
  `config/dev.exs` (loopback only), so the server logs `Running AppWeb.Endpoint ... at 127.0.0.1:4000` and Traefik cannot
  reach it. (Run inside a started container the generator writes `{0, 0, 0, 0}` instead, so the output depends on where it
  runs.) The Dockerfile rewrites that line to `{0, 0, 0, 0}` and fails the build if the result is not there.
- `config/runtime.exs` already reads `PORT` (`String.to_integer(System.get_env("PORT", "4000"))`), so TDK's port is used as is.
- `mix phx.server` is the development server, for local use only. Phoenix's home page on `/` is the health route.
- No database, so no migrations job. For an app that needs one see the other database examples.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/`:

```bash
VERIFY_WAIT_SECONDS=90 tests/e2e/resource-types/bring-your-own/verify-byo-example.sh phoenix /
```

Through a real `tdk up` and Traefik, which sends `Host: api.<project>.localhost` (needs Docker, Tilt and a built CLI; the first run also builds
TDK's base images, so allow several minutes):

```bash
VERIFY_WAIT_SECONDS=600 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh phoenix /
```

The app accepted Traefik's host name with no host configuration (checked through a real `tdk up`).

## Register it in a TDK project

```bash
tdk resource phoenix-web --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path / --yes
```

Use a resource name that is unique across TDK projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
