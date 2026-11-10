# First `flisk up`: build images before their dependencies are healthy (2026-11-10)

Project: the 10-part shop of the agent bench (2 frontends, 3 Prisma APIs, 2 more APIs, 2 workers, migrator, NATS-style queue),
Colima 4 CPU / 8 GB, golden images pulled (12-16 s). Per-service layers were cache-missed on purpose (a unique `description`
in each `package.json`), the Bun package cache and golden layers were warm. One run per row.

| Engine | `flisk up --wait` to healthy |
|---|---|
| main (1.4.49), warm cache | 5:33 |
| main (1.4.49), per-service layers cold | 9:52 |
| prebuild steps, one at a time | 7:13 |
| prebuild steps in parallel | 5:37 |

Cause: Tilt holds a `dc_resource`'s `docker_build` until all its `resource_deps` are ready, so a `dependsOn` chain
(migrator, Catalog API, Orders API, Fulfilment worker) built one image at a time after the previous service was healthy.
Fix: a `<name>-image` build step that waits only for the generated Dockerfile, Verdaccio and the golden images, and runs in
parallel; the service's own `docker_build` then finds the layers cached.
