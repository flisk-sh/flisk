# A real nuxi init project (minimal template): the scaffolder runs at build time.
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
RUN apk add --no-cache git
RUN mkdir -p /work && chown node:node /work
USER node
WORKDIR /work
RUN npx --yes nuxi@latest init app --template minimal --no-install --packageManager npm --gitInit=false </dev/null
WORKDIR /work/app
RUN npm ci
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD nc -z 127.0.0.1 ${PORT:-3000} || exit 1
# nuxt dev must listen beyond loopback (--host) and on the port Flisk assigns.
CMD ["sh", "-c", "npx nuxt dev --host 0.0.0.0 --port ${PORT:-3000}"]
