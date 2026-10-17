# prisma

**Stack:** [Prisma](https://www.prisma.io) 6, `prisma migrate deploy` applying `prisma/migrations` to TDK's Postgres, then exit.

**Notes:**
- TDK's `DATABASE_URL` already ends in `?schema=public`, which is Prisma's own syntax, so it is used as is. No stripping,
  and no `sslmode` change was needed.
- The database did not exist in the verified run (TDK does not create one for a bring-your-own job) and
  `migrate deploy` still succeeded, so Prisma created it. Other tools may not; see the [atlas](../atlas/README.md) example.
- Prisma is pinned to major 6. Prisma 7 moved the datasource URL into `prisma.config.ts`, which this example does not use.
- Alpine needs `openssl` for Prisma's engines.
- Register it with `--restart no`, otherwise Docker restarts the finished job forever.
- The migration SQL was written by hand in Prisma's format (`CREATE TABLE "Order" ...`). In a real project generate it with
  `prisma migrate dev` against your schema.

## Check it

Needs Docker, Tilt and a built CLI. Runs a real `tdk up`, expects the container to exit `0` with `0` restarts, and expects
the `Order` table to exist:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-job.sh prisma
```

## Register it in a TDK project

```bash
tdk resource migrate --type bring-your-own --stack shop --dockerfile ./Dockerfile --restart no --register-existing --yes
```

Use a resource name that is unique across TDK projects sharing one Docker daemon.
