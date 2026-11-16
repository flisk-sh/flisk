# A real express-generator app (no view engine): the scaffolder runs at build time.
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
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
