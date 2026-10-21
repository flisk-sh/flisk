# laravel

**Stack:** a real Laravel project from `composer create-project laravel/laravel` (PHP 8.4, default SQLite file database)

**Notes:**
- Multi-stage build: the `composer:2` image runs `composer create-project`, and the result is copied into a `php:8.4-cli`
  image. The project comes from Packagist at build time, so the Laravel version is whatever is current.
- `create-project` writes `.env` with an `APP_KEY` and creates `database/database.sqlite` (checked in the generated project:
  `DB_CONNECTION=sqlite`, `SESSION_DRIVER=database`). The welcome page renders with that session driver, which is consistent
  with Laravel's post-create script having migrated the file, but I did not read the migration output. There is no external
  database and no migrations job.
- `php artisan serve --host=0.0.0.0 --port=$PORT` is Laravel's development server: it makes the app reachable and uses the
  port Flisk assigns. It is for local use only.
- Laravel's welcome page on `/` is the health route.
- The `APP_KEY` is generated at build time and baked into the image, which is fine for local use.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/`:

```bash
VERIFY_WAIT_SECONDS=60 tests/e2e/resource-types/bring-your-own/verify-byo-example.sh laravel /
```

## Register it in a Flisk project

```bash
flisk resource laravel-web --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path / --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
