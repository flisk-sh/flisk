# A real create-better-t-stack monorepo (web + server, no database): the scaffolder runs at build time.
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
# The scaffolder and its generated workspaces need npm >= 11.16.
RUN npm install -g github:npm/cli#0c2278c72f40730e1eb8a4e71e7763d1cf9276c8
WORKDIR /work
RUN npm create better-t-stack@latest app -- --frontend tanstack-router --backend hono --runtime node \
    --database none --orm none --auth none --api none --addons none --examples none \
    --package-manager npm --no-git --no-install --web-deploy none --server-deploy none --disable-analytics
WORKDIR /work/app
RUN npm ci
# Two processes: the API server (its own port) in the background, the web app on the port Flisk assigns.
# Vite must listen beyond loopback (--host).
WORKDIR /work/app/apps/web
RUN chown -R node:node .
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD nc -z 127.0.0.1 ${PORT:-3001} || exit 1
CMD ["sh", "-c", "(cd ../server && npm run dev) & exec npx vite --host 0.0.0.0 --port ${PORT:-3001}"]
