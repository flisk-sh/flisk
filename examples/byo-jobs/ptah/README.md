# ptah

**Stack:** [Ptah](https://github.com/stokaro/ptah) 0.12 applying `migrations/*.sql` to Flisk's Postgres with
`ptah migrations up`, then exiting.

**Notes:**
- The image is `stokaro/ptah:0.12.0`, which is Alpine with a shell, plus `postgresql-client` and the migrations. Its
  entrypoint is `ptah`, so the Dockerfile replaces it with `migrate.sh`.
- **Flisk does not create the database for a bring-your-own job**, and Ptah does not create one either. `migrate.sh`
  waits until Postgres accepts connections, creates the database if it is missing, then runs Ptah. Ptah's
  `--connect-timeout` bounds one connection attempt; it does not wait for a server that is still starting.
- Flisk's `DATABASE_URL` ends in a Prisma-style `?schema=public`, which Postgres refuses as a startup parameter, so the
  script strips it. Neither `psql` nor Ptah needs `sslmode` for Flisk's Postgres, which has SSL off: both fall back to a
  plain connection.
- Ptah records applied versions in `schema_migrations`, so a second run applies nothing and still exits `0`.
- Register it with `--restart no`, otherwise Docker restarts the finished job forever.

## Check it

Needs Docker, Tilt and a built CLI. Runs a real `flisk up`, expects the container to exit `0` with `0` restarts, and
expects `select item from orders` to return `tea`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-job.sh ptah
```

## Register it in a Flisk project

```bash
flisk resource migrate --type bring-your-own --stack shop --dockerfile ./Dockerfile --restart no --register-existing --yes
```

Use a resource name that is unique across Flisk projects sharing one Docker daemon.
