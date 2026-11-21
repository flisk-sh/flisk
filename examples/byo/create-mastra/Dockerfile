# A real create-mastra project (empty template): the scaffolder runs at build time.
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
RUN apk add --no-cache git
RUN mkdir -p /work && chown node:node /work
USER node
WORKDIR /work
RUN npm create mastra@latest app -- --empty --no-git --no-skills --no-install
WORKDIR /work/app
RUN npm ci && grep -A8 '"scripts"' package.json
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD nc -z 127.0.0.1 4111 || exit 1
CMD ["npm", "run", "dev"]
