# strapi

**Stack:** a real Strapi 5 app (`create-strapi-app`, TypeScript, npm, SQLite), on `node:22-slim`

**Notes:**
- The scaffolder runs at build time with `--non-interactive --typescript --use-npm --no-run --skip-cloud --no-example --no-git-init
  --dbclient sqlite` and stdin closed. The Dockerfile then builds the admin panel (`npm run build`) so the start command only runs
  `npm run start`. The Strapi version is whatever `create-strapi-app@latest` ships.
- **The SQLite path needs a fix.** The generated `.env` contains `DATABASE_FILENAME=` (empty), and `config/database.ts` then resolves
  the database file to the app folder itself: the container exits at start with `SqliteError: unable to open database file`. The
  Dockerfile sets `DATABASE_FILENAME=.tmp/data.db` and creates `.tmp`; a variable set in the image wins over `.env`.
- `HOST=0.0.0.0` and `PORT=$PORT` are set in the start command (Strapi reads both in `config/server.ts`).
- **Health path is `/admin`, not `/_health`.** The check needs HTTP 200 and `/admin` answers it with the admin panel's page. I did not
  call `/_health`, so I make no claim about its status code.
- The database is a SQLite file inside the container, so content is lost when the container is recreated.
- Flisk sets a Postgres `DATABASE_URL` in every bring-your-own container. This app uses the SQLite client and answered normally
  through `flisk up`; I did not trace how Strapi treats that variable, so no claim is made beyond what was observed.
- Through `flisk up`, only the admin page's HTML was fetched. The admin panel's own assets and API calls under the
  `/api/<name>/` path prefix were not checked, and a frontend served under a prefix usually needs its base path set
  (see [docs/byo.md](../../../docs/byo.md)).
- The first image build installs and compiles a large dependency tree and builds the admin panel, so it takes several minutes.

## Check it

Needs Docker. Builds the image, runs it with `PORT=4000` and expects HTTP 200 on `/admin`:

```bash
VERIFY_WAIT_SECONDS=120 tests/e2e/resource-types/bring-your-own/verify-byo-example.sh strapi /admin
```

Through a real `flisk up` and Traefik, which sends `Host: api.<project>.localhost` (needs Docker, Tilt and a built CLI):

```bash
VERIFY_WAIT_SECONDS=600 tests/e2e/resource-types/bring-your-own/verify-byo-tdk.sh strapi /admin
```

## Register it in a Flisk project

```bash
flisk resource strapi-cms --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path /admin --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
