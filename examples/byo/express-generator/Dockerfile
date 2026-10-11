# A real express-generator app (no view engine): the scaffolder runs at build time.
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
WORKDIR /work
WORKDIR /generator
COPY scaffolder/package.json scaffolder/package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund \
 && ./node_modules/.bin/express --no-view /work/app
COPY runtime/package.json runtime/package-lock.json /work/app/
WORKDIR /work/app
RUN npm ci --ignore-scripts --no-audit --no-fund
RUN chown -R node:node .
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD nc -z 127.0.0.1 ${PORT:-3000} || exit 1
# The generated bin/www reads PORT and listens on all interfaces.
CMD ["node", "./bin/www"]
