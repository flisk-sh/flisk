# symfony

**Stack:** a real Symfony skeleton (`composer create-project symfony/skeleton`, Symfony 8.1, PHP 8.4) plus one controller file

**Notes:**
- Multi-stage build: the `composer:2` image runs `composer create-project symfony/skeleton`, the `HealthController.php` next to
  this Dockerfile is copied into `src/Controller/`, and the result runs on a `php:8.4-cli` image. The Symfony version is whatever
  Packagist resolves at build time (8.1 when this was written; the skeleton requires PHP 8.4).
- The skeleton has no route of its own. Its `config/routes.yaml` imports `#[Route]` attribute controllers automatically, so the one
  added controller (`/health` and `/`) is all that is needed.
- `php -S 0.0.0.0:$PORT -t public` is PHP's built-in server: it makes the app reachable and uses the port TDK assigns. It is for
  local use only.
- Through TDK, Traefik sends `Host: api.<project>.localhost`; Symfony accepted it with no trusted-host configuration (checked
  through a real `tdk up`).
- No database, so no migrations job. TDK's native choices do not include PHP; for another PHP framework see [laravel](../laravel/README.md).

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/health`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-example.sh symfony
```

Through a real `tdk up` and Traefik, which sends `Host: api.<project>.localhost` (needs Docker, Tilt and a built CLI):

```bash
VERIFY_WAIT_SECONDS=400 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh symfony /health
```

## Register it in a TDK project

```bash
tdk resource symfony-api --type bring-your-own --stack shop --dockerfile ./Dockerfile --yes
```

Use a resource name that is unique across TDK projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
