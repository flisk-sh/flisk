# One-shot migration job: Atlas applies schema.hcl to TDK's Postgres and exits 0.
FROM alpine:3.20@sha256:d9e853e87e55526f6b2917df91a2115c36dd7c696a35be12163d44e6e2a4b6bc
RUN apk add --no-cache postgresql-client
COPY --from=arigaio/atlas:latest /atlas /usr/local/bin/atlas
COPY schema.hcl migrate.sh /
RUN addgroup -g 1000 app && adduser -u 1000 -G app -D -H app
USER app
# One-shot job: it has no server to probe and exits when the migration finishes, so the image disables the inherited check.
HEALTHCHECK NONE
CMD ["sh", "/migrate.sh"]
