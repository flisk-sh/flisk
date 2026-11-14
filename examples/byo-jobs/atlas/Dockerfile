# One-shot migration job: Atlas applies schema.hcl to Flisk's Postgres and exits 0.
FROM alpine:3.23@sha256:469c9ea410b9215eaee7976ba6c0639039b444be8e5d638f7abbada189971eb2
RUN apk add --no-cache postgresql-client
COPY --from=arigaio/atlas:latest /atlas /usr/local/bin/atlas
COPY schema.hcl migrate.sh /
RUN addgroup -g 1000 app && adduser -u 1000 -G app -D -H app
USER app
# One-shot job: it has no server to probe and exits when the migration finishes, so the image disables the inherited check.
HEALTHCHECK NONE
CMD ["sh", "/migrate.sh"]
