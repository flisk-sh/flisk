# Bring-your-own one-shot jobs

Each folder is a job that runs once and exits `0`, such as a database migration, packaged as a bring-your-own
resource with `"restart": "no"` (see [docs/byo.md](../../docs/byo.md#one-shot-jobs-migrations-seeders)). Unlike
[`examples/byo/`](../byo/README.md), they do not serve HTTP, so they are checked with a real `flisk up`:

```bash
tests/e2e/resource-types/bring-your-own/verify-byo-job.sh dbmate
```

The check uses a throwaway project with unique names and alternate ports, starts it with `flisk up`, and requires the
container to exit `0` with `0` restarts, then runs the folder's `verify.sql` against Flisk's Postgres and compares the
result with `verify.expect`. It removes only what it started. Needs Docker, Tilt and a built CLI.

Every folder has its own `README.md`, so adding a job only adds a folder.
