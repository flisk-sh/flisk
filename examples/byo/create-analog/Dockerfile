# A real create-analog app: the scaffolder runs at build time.
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
WORKDIR /work
RUN npm create analog@latest app -- --template latest --skipTailwind --analogSFC=false --skipGit </dev/null
WORKDIR /work/app
# The template pins vite/vitest with "$ref" overrides that npm 10 cannot resolve.
RUN npm install -g github:npm/cli#5d41fb3a08249c7b40994c9f187fd25c241817ad && npm ci
RUN chown -R node:node .
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD nc -z 127.0.0.1 ${PORT:-3000} || exit 1
# Vite must listen beyond loopback (--host) and on the port Flisk assigns.
CMD npx vite --host 0.0.0.0 --port ${PORT:-3000}
