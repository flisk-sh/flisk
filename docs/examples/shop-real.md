# Shop-real reference landscape

This is a topology and measurement plan for a small commerce system. It describes twelve
application resources with real responsibilities; it is not twelve generated `/health` stubs and
does not claim that this repository contains a production-ready shop implementation.

## Service inventory

| Resource | Stack | Responsibility | Runtime / state | Health condition |
|---|---|---|---|---|
| `web-storefront` | `shop` | Customer browsing and checkout UI | TypeScript web app; stateless | Serves the landing route and can reach the catalog API |
| `admin-console` | `shop` | Product and order operations UI | TypeScript web app; stateless | Serves the admin route and can reach the catalog and order APIs |
| `catalog-api` | `shop` | Product, price, and inventory reads | HTTP API; PostgreSQL | Database query succeeds |
| `order-api` | `shop` | Checkout and order state transitions | HTTP API; PostgreSQL, NATS | Database is reachable and event publisher is connected |
| `payment-adapter` | `shop` | Payment-provider boundary and callbacks | HTTP API; external provider credentials | Configuration is valid; provider probe is bounded and optional |
| `inventory-worker` | `shop` | Reserves and releases stock | Worker; PostgreSQL, NATS | Consumer is connected and worker process is responsive |
| `order-worker` | `shop` | Sends accepted orders to fulfillment | Worker; PostgreSQL, NATS | Consumer is connected and worker process is responsive |
| `notification-worker` | `shop` | Email and order notifications | Worker; NATS, external mail provider | Consumer is connected; provider health is not required for process liveness |
| `search-indexer` | `shop` | Builds the product search index | Worker; PostgreSQL, NATS, search store | Consumer and search store are reachable |
| `image-resizer` | `shop` | Processes uploaded product images | Worker; object storage, NATS | Consumer and local object-storage endpoint are reachable |
| `fulfillment-adapter` | `shop` | Integrates orders with a shipping provider | HTTP API; PostgreSQL, external provider | Local configuration is valid; external provider is optional in local mode |
| `audit-writer` | `shop` | Persists business audit events | Worker; PostgreSQL, NATS | Consumer and database are reachable |

The shared local infrastructure (PostgreSQL, NATS, proxy, and optional object/search stores) is not
counted in the twelve application resources. The list intentionally includes stateful dependencies,
workers, external-service boundaries, and two user interfaces. A generated service that only returns
`200 /health` would not validate any of those behaviors.

## Dependency and startup shape

PostgreSQL and NATS must be healthy before their consumers start. `catalog-api` and `order-api`
depend on PostgreSQL; `order-api` also depends on NATS. Workers depend on the broker and the stores
they consume or write. The two UIs depend on the APIs only for functional checks, not process
startup. Payment, mail, shipping, and object-storage integrations should use local test doubles or
be explicitly disabled; no cold-boot result should depend on a developer's private credentials.

Use resource health checks to report process readiness, and keep provider reachability checks
bounded. Liveness should not fail just because a public third-party API is temporarily down.

## What a valid measurement means

A useful cold-boot report records the machine/runner, OS and CPU architecture, Docker engine and
Compose versions, Flisk version, commit, whether image and package caches were empty, and the time
until all twelve resources pass their real readiness checks. It should also record image-build and
service-readiness failures, not only the first process start. Use
[`../benchmarks/cold-boot-shop-real.md`](../benchmarks/cold-boot-shop-real.md) and
[`../../scripts/cold-boot-notes.sh`](../../scripts/cold-boot-notes.sh) to capture a run.

Do not extrapolate this design into a performance claim. Build downloads, database initialization,
resource limits, provider stubs, and the implementations of these services all affect the result.
