# A real create-astro project (minimal template): the scaffolder runs at build time.
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
RUN mkdir -p /work && chown node:node /work
USER node
WORKDIR /work
RUN npm create astro@latest app -- --template minimal --no-install --no-git --yes
WORKDIR /work/app
RUN npm ci
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD nc -z 127.0.0.1 ${PORT:-4321} || exit 1
# astro dev must listen beyond loopback (--host) and on the port Flisk assigns.
CMD ["sh", "-c", "npx astro dev --host 0.0.0.0 --port ${PORT:-4321}"]
