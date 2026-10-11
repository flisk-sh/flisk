# One-shot migration job: `prisma migrate deploy` applies prisma/migrations to TDK's Postgres and exits 0.
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
RUN apk add --no-cache openssl
WORKDIR /job
# Prisma 6; Prisma 7 moved the datasource URL into prisma.config.ts.
RUN npm install --no-audit --no-fund github:prisma/prisma#125ba793a84b226a4fdb9eb89d525413237d3bdf
COPY prisma ./prisma
RUN chown -R node:node .
USER node
# TDK's DATABASE_URL is already Prisma-style (?schema=public), so it is used as is.
# One-shot job: it has no server to probe and exits when the migration finishes, so the image disables the inherited check.
HEALTHCHECK NONE
CMD ["npx", "prisma", "migrate", "deploy"]
