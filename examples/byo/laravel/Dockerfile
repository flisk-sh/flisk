# A real Laravel project from `composer create-project` (default SQLite file, no external database).
FROM composer:2@sha256:0c8e663f14c94d07b3c45b175c51f5a14718508f21fe4dd7e54f09488dd0ed71 AS build
WORKDIR /work
RUN composer create-project laravel/laravel app --no-interaction --prefer-dist

FROM php:8.4-cli@sha256:d63e8b80cd4c6cfd01cfa7c910522e299cdc7ca1a2b6d6563db48df3c17e6c55
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends unzip git >/dev/null && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /work/app /app
RUN groupadd --gid 1000 app && useradd --uid 1000 --gid app --no-create-home app && chown -R app:app .
USER app
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD php -r "exit(@fsockopen('127.0.0.1', ${PORT:-8000}) ? 0 : 1);"
# create-project already wrote .env with an APP_KEY and created database/database.sqlite.
# artisan serve must listen beyond loopback (--host) and on the port Flisk assigns.
CMD ["sh", "-c", "php artisan serve --host=0.0.0.0 --port=${PORT:-8000}"]
