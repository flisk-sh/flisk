# A real Angular CLI app (`ng new`, CSS, routing, no SSR): the scaffolder runs at build time.
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
# Never ask about analytics during the build.
ENV NG_CLI_ANALYTICS=false CI=true
RUN mkdir -p /work && chown node:node /work
USER node
WORKDIR /work
RUN npx --yes @angular/cli@latest new app --defaults --skip-git --skip-install --routing --style=css \
    --ssr=false --ai-config=none --package-manager=npm </dev/null
WORKDIR /work/app
RUN npm ci
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD nc -z 127.0.0.1 ${PORT:-4200} || exit 1
# ng serve must listen beyond loopback (--host) and on the port Flisk assigns.
CMD ["sh", "-c", "npx ng serve --host 0.0.0.0 --port ${PORT:-4200}"]
