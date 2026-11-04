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

## Passing outputs to dependent services

A one-shot job can generate service tokens or credentials and pass them directly to downstream services (#2864):

1. The job writes `KEY=value` lines to `$FLISK_OUTPUT`:
   ```bash
   printf "SERVICE_TOKEN=%s\n" "$generated_token" > "$FLISK_OUTPUT"
   ```
2. Any dependent service that declares this job in `dependsOn` references the output in its `service.json`:
   ```json
   {
     "dependsOn": ["seed-job"],
     "env": {
       "API_AUTH_TOKEN": "${seed-job:SERVICE_TOKEN}"
     }
   }
   ```
   Outputs are stored securely in `.flisk/outputs/` with restricted permissions and never logged or exposed in machine-readable status.
