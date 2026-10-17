# atlas

**Stack:** [Atlas](https://atlasgo.io) declarative schema apply (`atlas schema apply`) from `schema.hcl` to TDK's Postgres,
then exit.

**Notes:**
- The Atlas image has no shell, so the Dockerfile copies the `atlas` binary into Alpine and adds `postgresql-client`.
- **TDK does not create the database for a bring-your-own job.** It only passes `DATABASE_URL`. `migrate.sh` creates the
  database if it is missing, then runs Atlas. (dbmate creates it by itself, which is why the dbmate example needs no such
  step.) Without this the job fails with `database "..._app" does not exist`.
- TDK's `DATABASE_URL` ends in a Prisma-style `?schema=public`, so the script strips it, and TDK's Postgres has SSL off, so
  the URL gets `?sslmode=disable`.
- Register it with `--restart no`, otherwise Docker restarts the finished job forever.
- The Atlas image is pulled as `arigaio/atlas:latest`, so the version is whatever is current.

## Check it

Needs Docker, Tilt and a built CLI. Runs a real `tdk up`, expects the container to exit `0` with `0` restarts, and expects
the `orders` table to exist:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-job.sh atlas
```

## Register it in a TDK project

```bash
tdk resource migrate --type bring-your-own --stack shop --dockerfile ./Dockerfile --restart no --register-existing --yes
```

Use a resource name that is unique across TDK projects sharing one Docker daemon.
