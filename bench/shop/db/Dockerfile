FROM oven/bun:1-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a
WORKDIR /app
COPY migrate.ts ./
COPY migrations ./migrations
USER bun
# No HTTP endpoint: a worker with no port and a one-shot job.
HEALTHCHECK NONE
CMD ["bun", "migrate.ts"]
