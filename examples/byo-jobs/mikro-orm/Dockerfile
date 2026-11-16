# One-shot migration job: `mikro-orm migration:up` applies migrations/ to Flisk's Postgres and exits 0.
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
WORKDIR /job
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY mikro-orm.config.js ./
COPY migrations ./migrations
ENV MIKRO_ORM_CLI_CONFIG=./mikro-orm.config.js
RUN chown -R node:node .
USER node
# One-shot job: it has no server to probe and exits when the migration finishes, so the image disables the inherited check.
HEALTHCHECK NONE
CMD ["npx", "mikro-orm", "migration:up"]
