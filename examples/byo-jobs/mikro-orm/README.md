# mikro-orm

**Stack:** [MikroORM](https://mikro-orm.io) 6, `mikro-orm migration:up` applying plain-JavaScript migrations to Flisk's Postgres,
then exit.

**Notes:**
- The job runs the MikroORM CLI against a CLI-compatible `mikro-orm.config.js`, so the same config stays the source of truth
  for rollback, `migration:down`, listing and the rest, as the MikroORM docs recommend. See the
  [migrations documentation](https://mikro-orm.io/docs/migrations) for the CLI and for using the migrator programmatically.
- The database did not exist in the verified run (Flisk does not create one for a bring-your-own job) and the job still
  succeeded, so MikroORM created it. Other tools may not; see the [atlas](../atlas/README.md) example.
- Flisk's `DATABASE_URL` ends in a Prisma-style `?schema=public` that other drivers reject, so the config strips it. Flisk's
  Postgres has SSL off, which is the driver's default when no `sslmode` is given.
- The config and migration are plain JavaScript (`glob: '!(*.d).js'`) so the job needs no TypeScript toolchain.
- Register it with `--restart no`, otherwise Docker restarts the finished job forever.
- Dependencies are `@mikro-orm/*@^6` from npm at build time, so exact versions float within that range.

## Check it

Needs Docker, Tilt and a built CLI. Runs a real `flisk up`, expects the container to exit `0` with `0` restarts, and expects
the `orders` table to exist:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-job.sh mikro-orm
```

## Register it in a Flisk project

```bash
flisk resource migrate --type bring-your-own --stack shop --dockerfile ./Dockerfile --restart no --register-existing --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon.
