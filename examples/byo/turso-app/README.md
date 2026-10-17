# turso-app

**Stack:** a small Node 22 service (`node:22-slim`) that talks to Turso's server with [`@libsql/client`](https://www.npmjs.com/package/@libsql/client) over HTTP

**Notes:**
- It needs the [turso](../turso/README.md) resource running in the same project. It connects to `LIBSQL_URL`, which the Dockerfile
  sets to `http://turso:4500`: the resource's name on the Docker network, and the port it was registered with.
- **Another name or port needs an edit.** A `service.json` has no environment field, so the URL is baked into the Dockerfile
  (`ENV LIBSQL_URL=...`). If your Turso resource is not called `turso` or does not use port 4500, change that line.
- `/health` is a real round trip, not a static answer: it creates a table if needed, inserts a row and counts the rows, so a 200 means
  the database answered. The `visits` count in the response grows with each call.
- The service binds `0.0.0.0` and reads `PORT`.
- `@libsql/client` is pinned to `^0.18.0` (the current line when this was written).
- Only HTTP URLs were checked. File and `libsql://` (Turso Cloud) URLs, auth tokens, embedded replicas and sync were not.

## Check it

This example cannot run alone, because its health route needs the database. Run both through a real `tdk up` and Traefik, in one
throwaway project (needs Docker, Tilt and a built CLI):

```bash
VERIFY_WAIT_SECONDS=600 tests/e2e/resource-types/bring-your-own/verify-byo-pair.sh turso 4500 /health turso-app LIBSQL_URL /health
```

## Register it in a TDK project

```bash
tdk resource turso-app --type bring-your-own --stack shop --dockerfile ./Dockerfile --health-path /health --yes
```

Use a resource name that is unique across TDK projects sharing one Docker daemon. See
[../README.md](../README.md) and [docs/byo.md](../../../docs/byo.md) for the container contract.
