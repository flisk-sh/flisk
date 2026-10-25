# Lab 3: Add an API

**Goal:** create a backend service with one command and read the one file you own.
**Time:** 5 minutes. **Previous:** [Lab 2](02-create-a-project.md). **Next:** [Lab 4](04-add-a-website.md).

## Steps

1. From `my-shop`, add an API called `orders-api` to a stack called `shop`:

   ```bash
   flisk resource orders-api --type backend --stack shop --yes
   ```

2. Look at the folder Flisk created:

   ```bash
   ls services/shop/orders-api
   ```

3. Read the service definition:

   ```bash
   cat services/shop/orders-api/service.json
   ```

## You should see

```text
Resource details:
  Name:  orders-api
  Type:  backend
  Stack: shop
  Port: 4000
  Path:  services/shop/orders-api
...
✅ Resource created successfully!
```

The folder holds `Dockerfile`, `package.json`, `service.json`, `src/index.ts`, `tests/`, and `tsconfig.json`. Your `service.json` looks like this (shortened):

```json
{
  "port": 4000,
  "dependsOn": [],
  "dev": { "command": "bun run dev", "watch": ["src/**/*"] },
  "healthCheckPath": "/health",
  "appType": "backend",
  "name": "orders-api",
  "stack": "shop"
}
```

## What just happened

Flisk wrote a small working API (a Hono server in `src/index.ts`) with `/health` endpoints, a test, and a `service.json`. The `service.json` is the one file Flisk reads to know how to run this service.

| Field | Meaning |
| --- | --- |
| `port` | The port this service uses on your machine. Flisk gives each service its own. |
| `dependsOn` | Services that must start first. Empty for now. |
| `dev.watch` | Files to watch. A change here updates the running container. |
| `healthCheckPath` | The address Flisk checks to know the service is healthy. |
| `stack` | The group this service starts with. |

You have not written a Dockerfile for the stack, a Compose file, or gateway settings. Flisk generates those when you start.

## Ask your AI agent instead

```text
Use Flisk to add a backend service called orders-api to a stack called shop, with flisk resource. Then explain what is in its service.json.
```

## Checkpoint

- [ ] `services/shop/orders-api/service.json` exists.
- [ ] You can say what `healthCheckPath` and `stack` mean.

## Stuck?

- **`Not in a Flisk project`:** run the command from inside `my-shop`.
- **Other languages:** add `--language python`, `go`, `rust`, or `node`. The default is Bun.
- **Other frameworks:** list them with `flisk resource --type backend --frameworks`.
