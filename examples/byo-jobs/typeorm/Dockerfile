# One-shot migration job: `typeorm migration:run` applies migrations/ to TDK's Postgres and exits 0.
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
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
