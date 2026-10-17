# dbmate

**Stack:** [dbmate](https://github.com/amacneil/dbmate) 2 applying `db/migrations/*.sql` to TDK's Postgres, then exiting.

**Notes:**
- The image is `ghcr.io/amacneil/dbmate:2` plus the migrations; the command runs `dbmate up`.
- TDK's `DATABASE_URL` ends in a Prisma-style `?schema=public`, which dbmate rejects, so the command strips it.
- TDK's Postgres has SSL off, so the URL gets `?sslmode=disable`. Without it the job fails with
  `pq: SSL is not enabled on the server`.
- dbmate creates the database if it is missing. TDK does not create one for a bring-your-own job, so tools that do
  not (see the [atlas](../atlas/README.md) example) need a step that does.
- `--wait` makes the job wait for Postgres instead of failing if it boots first.
- Register it with `--restart no`, otherwise Docker restarts the finished job forever.

## Check it

Needs Docker, Tilt and a built CLI. Runs a real `tdk up`, expects the container to exit `0` with `0` restarts, and
expects `select item from orders` to return `tea`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-job.sh dbmate
```

## Register it in a TDK project

```bash
tdk resource migrate --type bring-your-own --stack shop --dockerfile ./Dockerfile --restart no --register-existing --yes
```

Use a resource name that is unique across TDK projects sharing one Docker daemon.
