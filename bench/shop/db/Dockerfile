FROM oven/bun:1-alpine
WORKDIR /app
COPY migrate.ts ./
COPY migrations ./migrations
CMD ["bun", "migrate.ts"]
