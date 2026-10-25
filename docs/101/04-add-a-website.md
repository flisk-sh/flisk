# Lab 4: Add a website

**Goal:** add a frontend to the same stack and list what you have.
**Time:** 5 minutes. **Previous:** [Lab 3](03-add-an-api.md). **Next:** [Lab 5](05-preview-then-start.md).

## Steps

1. Add a website called `shop-web` to the `shop` stack:

   ```bash
   flisk resource shop-web --type frontend --stack shop --yes
   ```

2. List your stacks and the services in them:

   ```bash
   flisk stacks --services
   ```

3. List every resource:

   ```bash
   flisk resources
   ```

4. See the framework choices:

   ```bash
   flisk resource --type frontend --frameworks
   ```

## You should see

```text
Found 1 stack:

shop
  2 resources
  Services:
    orders-api
    shop-web
```

```text
Found 2 resources:

  orders-api [shop]
  shop-web [shop]
```

The framework list names `react` (the default), `vue`, `svelte`, `preact`, `lit`, `solid`, `qwik`, `vanilla`, and `tanstack-router`.

## What just happened

Flisk created a React website in `services/shop/shop-web`. Its `service.json` has three extra features turned on: `api-client`, `env-config`, and `api-index`. These let the website call your API without you typing its address. You will see where they come from in [Lab 9](09-generated-files-and-drift.md).

A **stack** is just a name in each `service.json`. Because both services say `"stack": "shop"`, they start together.

## Ask your AI agent instead

```text
Use Flisk to add a frontend called shop-web to the shop stack, then show me the stack and the resources in it.
```

## Checkpoint

- [ ] `flisk stacks --services` shows `orders-api` and `shop-web` in `shop`.
- [ ] You can name one other framework you could have used.

## Stuck?

- **The folder is not where you expected:** Flisk puts services where discovery looks, `services/*/*` by default. Use `--path` to choose another folder, but keep it inside a discovered location or `flisk up` will not find it.
- **Want Vue instead:** `flisk resource shop-web --type frontend --framework vue --stack shop --yes`.
