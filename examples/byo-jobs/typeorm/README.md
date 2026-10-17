# typeorm

**Stack:** [TypeORM](https://typeorm.io) 0.3, `typeorm migration:run` applying plain-JavaScript migrations to TDK's Postgres,
then exit.

**Notes:**
- **TDK does not create the database for a bring-your-own job and TypeORM does not either**, so `ensure-db.js` creates it if
  missing (and waits for Postgres) before `migration:run`. See the [atlas](../atlas/README.md) example for the same finding.
- The data source and migrations are plain JavaScript (`data-source.js`, `migrations/*.js`), so the job needs no TypeScript
  toolchain. In a TypeScript project, compile first and point `-d` at the output.
- TDK's `DATABASE_URL` ends in a Prisma-style `?schema=public`; the data source strips it. TDK's Postgres has SSL off, which is
  `pg`'s default when no `sslmode` is given.
- Register it with `--restart no`, otherwise Docker restarts the finished job forever.
- Dependencies are `typeorm@^0.3` and `pg@^8` from npm at build time, so exact versions float within those ranges.

## Check it

Needs Docker, Tilt and a built CLI. Runs a real `tdk up`, expects the container to exit `0` with `0` restarts, and expects
the `orders` table to exist:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-job.sh typeorm
```

## Register it in a TDK project

```bash
tdk resource migrate --type bring-your-own --stack shop --dockerfile ./Dockerfile --restart no --register-existing --yes
```

Use a resource name that is unique across TDK projects sharing one Docker daemon.
