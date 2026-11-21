# One-shot migration job: `prisma migrate deploy` applies prisma/migrations to Flisk's Postgres and exits 0.
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
RUN apk add --no-cache openssl
RUN mkdir -p /job && chown node:node /job
USER node
WORKDIR /job
# Prisma 6; Prisma 7 moved the datasource URL into prisma.config.ts.
RUN npm install --no-audit --no-fund github:prisma/prisma#125ba793a84b226a4fdb9eb89d525413237d3bdf
COPY --chown=node:node prisma ./prisma
# Flisk's DATABASE_URL is already Prisma-style (?schema=public), so it is used as is.
# One-shot job: it has no server to probe and exits when the migration finishes, so the image disables the inherited check.
HEALTHCHECK NONE
CMD ["npx", "prisma", "migrate", "deploy"]
