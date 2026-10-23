# slim

**Stack:** a real Slim 4 skeleton from `composer create-project slim/slim-skeleton` (PHP 8.4, no external database)

**Notes:**
- The generator runs at build time in a `composer:2` stage; the app is copied into `php:8.4-cli`. The Slim version is whatever
  `composer create-project` resolves to.
- `php -S 0.0.0.0:$PORT -t public` serves the skeleton's front controller. The built-in server is for local use only and must
  listen beyond loopback and on the port Flisk assigns.
- The skeleton has no `/health` route; its `/` answers 200 `Hello world!`, so the health path is `/`. That proves the server
  and the route, not the app's dependencies (it has none).
- Not read or run: the skeleton's PHP-DI/Monolog setup beyond what `/` exercises, Slim's other routes, production serving
  (php-fpm or a web server in front).

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/`:

```bash
VERIFY_WAIT_SECONDS=60 tests/e2e/resource-types/bring-your-own/verify-byo-example.sh slim /
```

Then through a real `flisk up` and Traefik (needs Docker, Tilt and a built CLI):

```bash
VERIFY_WAIT_SECONDS=900 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh slim /
```

Observed: `PASS slim: GET / -> 200 (Hello world!)` and `PASS slim: through flisk up and Traefik, GET /api/<name>/ -> 200 (Hello world!)`.

## Register it in a Flisk project

```bash
flisk resource slim-web --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path / --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
