# One-shot migration job: `typeorm migration:run` applies migrations/ to Flisk's Postgres and exits 0.
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
WORKDIR /job
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY data-source.js ensure-db.js ./
COPY migrations ./migrations
RUN chown -R node:node .
USER node
# One-shot job: it has no server to probe and exits when the migration finishes, so the image disables the inherited check.
HEALTHCHECK NONE
CMD ["sh", "-c", "node ensure-db.js && npx typeorm migration:run -d data-source.js"]
