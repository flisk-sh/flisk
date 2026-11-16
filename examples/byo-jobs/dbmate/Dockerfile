# One-shot migration job: dbmate applies db/migrations to Flisk's Postgres and exits 0.
FROM ghcr.io/amacneil/dbmate:2@sha256:b0c8a87bfef4f2819fdb0a68ca357a44d12fb90d23eca695fcfc3b7e159cb1c5
COPY db /db
RUN addgroup -g 1000 app && adduser -u 1000 -G app -D -H app
USER app
# Flisk's DATABASE_URL carries a Prisma-style ?schema=public that non-Prisma drivers reject, so strip it.
# Flisk's Postgres has SSL off, so ask the driver not to try it.
# --wait retries until Postgres accepts connections; --no-dump-schema keeps the job read-only on disk.
# One-shot job: it has no server to probe and exits when the migration finishes, so the image disables the inherited check.
HEALTHCHECK NONE
ENTRYPOINT ["/bin/sh", "-c"]
CMD ["dbmate --url \"${DATABASE_URL%%\\?*}?sslmode=disable\" --migrations-dir /db/migrations --no-dump-schema --wait up"]
