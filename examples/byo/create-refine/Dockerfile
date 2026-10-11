# A real create-refine-app project (Vite template, default answers): the scaffolder runs at build time.
# It only reads answers from a terminal, so a few Enter presses accept the defaults
# (no example pages, no auth, npm, no email).
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
WORKDIR /work
RUN (for i in $(seq 1 16); do sleep 2; echo; done) | npm create refine-app@latest app -- -p refine-vite --disable-telemetry
WORKDIR /work/app
RUN test -f package.json && npm ci
RUN chown -R node:node .
USER node
# Vite must listen beyond loopback (--host) and on the port TDK assigns.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD node -e "require('node:net').connect(${PORT:-3000},'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"
CMD npx vite --host 0.0.0.0 --port ${PORT:-3000}
