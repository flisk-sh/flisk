FROM oven/bun:1-alpine
WORKDIR /app
COPY src ./src
USER bun
# No HTTP endpoint: a worker with no port and a one-shot job.
HEALTHCHECK NONE
CMD ["bun", "src/index.ts"]
