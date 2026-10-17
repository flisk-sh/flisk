# drizzle

**Stack:** [Drizzle](https://orm.drizzle.team) (`drizzle-orm` 0.44, `drizzle-kit` 0.31), `drizzle-kit migrate` applying
the generated SQL migrations to TDK's Postgres, then exit.

**Notes:**
- The Dockerfile runs `drizzle-kit generate` at image build to turn `schema.js` into `./drizzle/0000_init.sql`, so the real
  tool produces the migration. A real project commits `./drizzle` and skips that step.
- `ensure-db.js` creates the database if it is missing and waits for Postgres, because TDK does not create one for a
  bring-your-own job (see the [atlas](../atlas/README.md) example). It was included from the start; the example was not run
  without it, so whether `drizzle-kit migrate` would create the database itself is untested.
- TDK's `DATABASE_URL` ends in a Prisma-style `?schema=public` that other drivers reject, so the config strips it, and TDK's
  Postgres has SSL off, so the URL gets `?sslmode=disable`.
- The schema and config are plain JavaScript so the job needs no TypeScript toolchain.
- Register it with `--restart no`, otherwise Docker restarts the finished job forever.
- Dependencies float within `drizzle-orm@^0.44`, `drizzle-kit@^0.31` and `pg@^8` at build time.

## Check it

Needs Docker, Tilt and a built CLI. Runs a real `tdk up`, expects the container to exit `0` with `0` restarts, and expects
the `orders` table to exist:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-job.sh drizzle
```

## Register it in a TDK project

```bash
tdk resource migrate --type bring-your-own --stack shop --dockerfile ./Dockerfile --restart no --register-existing --yes
```

Use a resource name that is unique across TDK projects sharing one Docker daemon.
