# Examples and starter repositories

Working Flisk projects you can copy and run, from one stack to a 100-service scale fixture. Each one uses the same layout: one folder per stack, one folder per service, a `service.json` in each.

For examples inside this repository (one backend, Python, bring-your-own, Helm), see [Recipes and examples](../README.md#recipes-and-examples).

## Start one with `flisk project`

`flisk project <template>` copies a starter into a new folder, named after its repository unless you pass `--path <dir>`. Then `cd` into it and run `flisk up`.

```bash
flisk project example          # small order tracker, bundled with the CLI
flisk project restaurant       # restaurant app: bookings, kitchen, dining room
flisk project saas             # account dashboard and checkout
flisk project user-management  # sign-up, log-in and permissions
flisk project ecommerce        # Vue storefront and a catalog API
flisk project erp              # 100-service scale fixture
flisk project next-postgres --path myapp   # Next.js website, Express API, Postgres and a migrator (needs Docker)
```

`flisk project` with an unknown name prints every template it knows. The list, with each template's repository, is `PROJECT_TEMPLATES` in [`cli/src/utils/project-templates.ts`](../../cli/src/utils/project-templates.ts). The AI templates (`agent-stack`, `swarm`, `security`, `super-agent`, `langgraph`, `tool-loop`) are covered in [AI agents in Flisk](../agents/ai-agents.md).

## The starters

The service counts below are the `service.json` files in each repository's `services/` folder, migrators included.

| Template | Repository | Stacks | Services | What it shows |
| --- | --- | --- | --- | --- |
| `example` | bundled: [`examples/flisk-example`](../../examples/flisk-example/README.md) | `shop`, plus NATS in `platform` | 3 | A Hono API with Postgres, a NATS worker and a Vite UI behind Traefik |
| `restaurant` | [flisk-restaurant-example](https://github.com/flisk-sh/flisk-restaurant-example) | `guest`, `kitchen`, `operations` | 7 | Reservations, a kitchen worker, a menu API and a floor app, with one shared migrator |
| `saas` | [flisk-saas-starter](https://github.com/flisk-sh/flisk-saas-starter) | `app`, `billing` | 6 | An account dashboard and a checkout page, each API with its own migrator |
| `user-management` | [flisk-user-management](https://github.com/flisk-sh/flisk-user-management) | `admin`, `portal`, `compliance` | 6 | Identity governance: an admin API, a self-service portal and an audit worker |
| `ecommerce` | [flisk-ecommerce-example](https://github.com/flisk-sh/flisk-ecommerce-example) | `store` | 3 | A Vue 3 storefront and a Hono catalog API with a Prisma migrator |
| `next-postgres` | written by the CLI (`cli/templates/next-postgres/`), no repository | `app` | 4 | A Next.js page with a working add, tick and delete list, an Express API and Postgres, with an `api-migrator` that creates and seeds the `items` table |
| `erp` | [flisk-erp-system](https://github.com/flisk-sh/flisk-erp-system) | 7 domains | 107 | A scale fixture: 100 small backends that answer `/health`, plus one app per domain |

`flisk create myapp --starter next-postgres` writes the same project (and `flisk project next-postgres --path myapp` does too); then `cd myapp && flisk up`. It needs Docker, because of Postgres.

`flisk project example` copies the example bundled with the CLI. The [flisk-example](https://github.com/flisk-sh/flisk-example) repository on GitHub is a different, older layout (`identity` and `appointment` stacks, 4 services).

One more repository has no template name; clone it with git, then run `flisk project --yes` and `flisk up`:

- [flisk-auth-queue-email-example](https://github.com/flisk-sh/flisk-auth-queue-email-example): sign in, request a report, and a worker emails you a CSV. A local OIDC issuer stands in for Auth0 or Cognito, NATS JetStream for SQS, and Mailpit for SES. Two stacks (`identity`, `reports`), 5 services. The stand-ins are not the real services: the emulator is not a security product, and JetStream differs from SQS in ordering and dead-letter behavior. Its README lists what it does not do.

### Restaurant

| Stack | Service | Type | Port |
| --- | --- | --- | --- |
| `guest` | `reservation-api` | backend | 4100 |
| `guest` | `reservation-app` | frontend | 3100 |
| `guest` | `restaurant-migrator` | migrator | |
| `kitchen` | `kitchen-api` | backend | 4110 |
| `kitchen` | `kitchen-worker` | worker | 4111 |
| `operations` | `menu-api` | backend | 4120 |
| `operations` | `floor-app` | frontend | 3120 |

Every API lists `restaurant-migrator` in `dependsOn`, so the schema exists before any API starts:

```json
{
  "$schema": "https://flisk.sh/schema.service.json",
  "schemaVersion": 1,
  "appName": "reservation-api",
  "appType": "backend",
  "stack": "guest",
  "port": 4100,
  "databaseName": "Flisk_restaurant",
  "dependsOn": ["restaurant-migrator"],
  "healthCheckPath": "/health"
}
```

### ERP scale fixture

A stress test, not a business app: the services hold no real business logic. It shows that discovery, image builds, routing and health checks keep working at this size. For the measured boot time and its conditions, see the [claims registry](../claims.md).

| Domain (stack) | Backends |
| --- | --- |
| `finance` | 15 |
| `hr` | 12 |
| `inventory` | 18 |
| `sales` | 20 |
| `manufacturing` | 15 |
| `supply_chain` | 12 |
| `analytics` | 8 |

```json
{
  "appName": "general-ledger-api",
  "appType": "backend",
  "stack": "finance",
  "port": 4010,
  "apiPath": "/api/general-ledger",
  "dependsOn": [],
  "healthCheckPath": "/health",
  "schemaVersion": 1
}
```

### SaaS starter

The checkout page lists `billing-api` in `dependsOn`, so the API starts first and the frontend gets its URL without extra config:

```json
{
  "schemaVersion": 1,
  "appName": "checkout-app",
  "appType": "frontend",
  "stack": "billing",
  "port": 3001,
  "basePath": "/checkout-app",
  "dependsOn": ["billing-api"]
}
```

## Manifest patterns

These are not from a starter repository. They are short patterns that use only fields the engine reads; the [`service.json` reference](../service-json.md) lists every field.

### Frontend and backend

`dependsOn` starts `catalog-api` before the frontend and writes its URL into the frontend's generated env. `basePath` serves the app at `/shop`.

```json
{
  "schemaVersion": 1,
  "appName": "web-app",
  "appType": "frontend",
  "stack": "storefront",
  "port": 3000,
  "basePath": "/shop",
  "dependsOn": ["catalog-api"]
}
```

```json
{
  "schemaVersion": 1,
  "appName": "catalog-api",
  "appType": "backend",
  "stack": "storefront",
  "port": 4000,
  "featuresEnabled": ["prisma"],
  "dependsOn": []
}
```

### Workers with replicas

`"replicas": 3` runs three copies of the worker. A worker must enable `nats`. The worker lists `media-migrator` in `dependsOn`, so the migrations finish before any copy starts.

```json
{
  "schemaVersion": 1,
  "appName": "transcode-worker",
  "appType": "worker",
  "stack": "media",
  "featuresEnabled": ["nats", "redis"],
  "dependsOn": [
    { "name": "media-migrator", "condition": "service_completed_successfully" }
  ],
  "replicas": 3
}
```

```json
{
  "schemaVersion": 1,
  "appName": "media-migrator",
  "appType": "migrator",
  "stack": "media",
  "featuresEnabled": ["prisma"]
}
```

### Realtime gateway

A WebSocket gateway on NATS and Redis. `healthCheckPath` replaces the default `/health` probe.

```json
{
  "schemaVersion": 1,
  "appName": "realtime-gateway",
  "appType": "backend",
  "stack": "realtime",
  "port": 4400,
  "featuresEnabled": ["nats", "redis", "websocket"],
  "dependsOn": [],
  "healthCheckPath": "/healthz"
}
```

## Start one stack

Pass a stack name to `flisk up` to start only that stack's services and what they depend on. Add `--dry-run` to see what would start without starting anything.

```bash
flisk up media --dry-run   # list what would start
flisk up media             # start the media stack only
```

## Project layout

Discovery reads the paths in `.flisk/project.json` (`services/*/*` by default), so each service sits at `services/<stack>/<service>/`:

```text
my-project/
├── .flisk/project.json            # discovery paths, phases, optional infra
└── services/
    ├── storefront/                # stack
    │   ├── catalog-api/           # service
    │   │   ├── service.json
    │   │   └── .autogenerated/    # Dockerfile, tsconfig, Vite config, AGENTS.md
    │   └── web-app/
    │       └── service.json
    └── media/
        ├── media-migrator/
        │   └── service.json
        └── transcode-worker/
            └── service.json
```

Each service's `.autogenerated/` folder gets an `AGENTS.md` (the `agents-md` feature) that tells coding assistants the files there are generated and must be changed through `service.json`, not by hand. See [generated service files](../generated-files.md).

## In this folder

- [Shop-real reference landscape](shop-real.md): a topology and measurement plan for a small commerce system
- [CI workflow for a Flisk project](ci/flisk-ci.yml)
