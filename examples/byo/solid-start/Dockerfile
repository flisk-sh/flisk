# A real SolidStart v2 app (basic template, TypeScript): the scaffolder runs at build time.
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
RUN mkdir -p /work && chown node:node /work
USER node
WORKDIR /work
RUN npx --yes create-solid@latest -p app -s --v2 -t basic --ts </dev/null
WORKDIR /work/app
RUN npm ci
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD nc -z 127.0.0.1 ${PORT:-3000} || exit 1
# SolidStart v2's dev server is Vite: listen beyond loopback (--host) and on the port Flisk assigns.
CMD ["sh", "-c", "npx vite dev --host 0.0.0.0 --port ${PORT:-3000}"]
