# One-shot migration job: `drizzle-kit migrate` applies ./drizzle to Flisk's Postgres and exits 0.
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
RUN mkdir -p /job && chown node:node /job
USER node
WORKDIR /job
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY --chown=node:node schema.js drizzle.config.js ensure-db.js ./
# Generate the SQL migration from the schema with the real tool at image build. A real project commits ./drizzle instead.
RUN npx drizzle-kit generate --name init
# One-shot job: it has no server to probe and exits when the migration finishes, so the image disables the inherited check.
HEALTHCHECK NONE
CMD ["sh", "-c", "node ensure-db.js && npx drizzle-kit migrate"]
