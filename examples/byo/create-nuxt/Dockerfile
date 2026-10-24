# A real nuxi init project (minimal template): the scaffolder runs at build time.
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
RUN apk add --no-cache git
WORKDIR /work
RUN npx --yes nuxi@latest init app --template minimal --no-install --packageManager npm --gitInit=false </dev/null
WORKDIR /work/app
RUN npm ci
RUN chown -R node:node .
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD nc -z 127.0.0.1 ${PORT:-3000} || exit 1
# nuxt dev must listen beyond loopback (--host) and on the port Flisk assigns.
CMD ["sh", "-c", "npx nuxt dev --host 0.0.0.0 --port ${PORT:-3000}"]
