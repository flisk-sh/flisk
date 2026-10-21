# A real ember-cli app from the Vite blueprint: the scaffolder runs at build time.
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
RUN apk add --no-cache git
WORKDIR /work
RUN npx --yes ember-cli@latest new tdk-ember-app --blueprint @ember/app-blueprint --skip-git --skip-npm
WORKDIR /work/tdk-ember-app
RUN npm ci
RUN chown -R node:node .
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD nc -z 127.0.0.1 ${PORT:-4200} || exit 1
# Vite must listen beyond loopback (--host) and on the port Flisk assigns.
CMD ["sh", "-c", "npx vite --host 0.0.0.0 --port ${PORT:-4200}"]
