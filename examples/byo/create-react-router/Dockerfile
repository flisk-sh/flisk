# A real create-react-router project (default template, framework mode): the scaffolder runs at build time.
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
WORKDIR /work
RUN npx --yes create-react-router@latest app --yes --no-install --no-git-init --no-agent-skills </dev/null
WORKDIR /work/app
RUN npm ci
RUN chown -R node:node .
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD nc -z 127.0.0.1 ${PORT:-5173} || exit 1
# The dev server is Vite: listen beyond loopback (--host) and on the port Flisk assigns.
CMD ["sh", "-c", "npx react-router dev --host 0.0.0.0 --port ${PORT:-5173}"]
