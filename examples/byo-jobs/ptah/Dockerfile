# One-shot migration job: Ptah applies migrations/*.sql to TDK's Postgres and exits 0.
FROM stokaro/ptah:0.12.0@sha256:fdf9c7009018a6cd3954c43f986d8b283c35255ed468c98eb4317529be19928c
# The Ptah image is Alpine with a shell; psql waits for Postgres and creates the database.
RUN apk add --no-cache postgresql-client
COPY migrations /migrations
COPY migrate.sh /migrate.sh
RUN addgroup -g 1000 app && adduser -u 1000 -G app -D -H app
USER app
# The image's entrypoint is ptah itself, so replace it with the script.
# One-shot job: it has no server to probe and exits when the migration finishes, so the image disables the inherited check.
HEALTHCHECK NONE
ENTRYPOINT ["/bin/sh", "/migrate.sh"]
