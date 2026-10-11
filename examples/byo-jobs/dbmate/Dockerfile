# One-shot migration job: dbmate applies db/migrations to TDK's Postgres and exits 0.
FROM ghcr.io/amacneil/dbmate:2@sha256:520c740c6e0ad73fde2cd1ea7e2b779aaf789d22aca8858f87a478e7094535fb
COPY db /db
RUN addgroup -g 1000 app && adduser -u 1000 -G app -D -H app
USER app
# TDK's DATABASE_URL carries a Prisma-style ?schema=public that non-Prisma drivers reject, so strip it.
# TDK's Postgres has SSL off, so ask the driver not to try it.
# --wait retries until Postgres accepts connections; --no-dump-schema keeps the job read-only on disk.
# One-shot job: it has no server to probe and exits when the migration finishes, so the image disables the inherited check.
HEALTHCHECK NONE
ENTRYPOINT ["/bin/sh", "-c"]
CMD ["dbmate --url \"${DATABASE_URL%%\\?*}?sslmode=disable\" --migrations-dir /db/migrations --no-dump-schema --wait up"]
