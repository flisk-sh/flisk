# A real Strapi app (`create-strapi-app`, TypeScript, SQLite): the scaffolder runs at build time.
FROM node:22-slim@sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends python3 make g++ git >/dev/null && rm -rf /var/lib/apt/lists/*
ENV STRAPI_TELEMETRY_DISABLED=true CI=true
WORKDIR /work
RUN npx --yes create-strapi-app@latest app --non-interactive --typescript --use-npm --no-run \
    --skip-cloud --no-example --no-git-init --dbclient sqlite </dev/null
WORKDIR /work/app
# The generated .env has `DATABASE_FILENAME=` (empty), which makes config/database.ts resolve the SQLite path to the app folder
# itself ("unable to open database file"). Point it at a real file; the variable set here wins over .env.
ENV DATABASE_FILENAME=.tmp/data.db
RUN mkdir -p .tmp
# Build the admin panel once, at image build time.
RUN npm run build
RUN chown -R node:node .
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD node -e "require('net').connect(${PORT:-1337},'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"
# HOST and PORT are read by config/server.ts. Strapi's default HOST is 0.0.0.0; PORT comes from Flisk.
CMD ["sh", "-c", "HOST=0.0.0.0 PORT=${PORT:-1337} npm run start"]
