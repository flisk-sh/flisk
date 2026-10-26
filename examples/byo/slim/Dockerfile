# A real Slim skeleton from `composer create-project` (PHP, no external database).
FROM composer:2@sha256:af98f42dfff7c68ba8d53c2164fd9fde1087b7d449514baa38c418b1f6bc4bac AS build
WORKDIR /work
RUN composer create-project slim/slim-skeleton app --no-interaction --prefer-dist

FROM php:8.4-cli@sha256:1d2cf2b7d715b5b3aa959f0150ccbcc7b71e0181b637e443abf40a7fb56bf79a
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends unzip git >/dev/null && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /work/app /app
RUN groupadd --gid 1000 app && useradd --uid 1000 --gid app --no-create-home app && chown -R app:app .
USER app
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD php -r "exit(@fsockopen('127.0.0.1', ${PORT:-8080}) ? 0 : 1);"
# The skeleton's front controller is public/index.php. The built-in server must listen beyond loopback and on Flisk's port.
CMD ["sh", "-c", "php -S 0.0.0.0:${PORT:-8080} -t public"]
