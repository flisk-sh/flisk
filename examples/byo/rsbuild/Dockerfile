# A real create-rsbuild app: the scaffolder runs at build time.
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
WORKDIR /work
RUN npm create rsbuild@latest -- --dir app --template react-ts --tools none
WORKDIR /work/app
RUN npm ci
RUN chown -R node:node .
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD nc -z 127.0.0.1 ${PORT:-3000} || exit 1
CMD npx rsbuild dev --host 0.0.0.0 --port ${PORT:-3000}
