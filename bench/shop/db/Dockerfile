FROM oven/bun:1-alpine
WORKDIR /app
COPY migrate.ts ./
COPY migrations ./migrations
USER bun
# No HTTP endpoint: a worker with no port and a one-shot job.
HEALTHCHECK NONE
CMD ["bun", "migrate.ts"]
