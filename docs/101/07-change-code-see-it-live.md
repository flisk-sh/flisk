# Lab 7: Change code, see it live

**Goal:** add an endpoint to your API and see it appear without rebuilding anything.
**Time:** 10 minutes. **Previous:** [Lab 6](06-see-it-run.md). **Next:** [Lab 8](08-logs-restart-dashboard.md).

Keep the stack running. Keep the Tilt dashboard (`http://localhost:10350`) open next to your editor.

## Steps

1. Open `services/shop/orders-api/src/index.ts`. Find this block:

   ```ts
   app.get('/', (c) => {
     return c.json({
       service: 'orders-api',
       version: '1.0.0',
       endpoints: ['/health', '/health/live', '/health/ready']
     });
   });
   ```

2. Add a new route just below it:

   ```ts
   app.get('/orders', (c) => {
     return c.json([
       { id: 1, item: 'Coffee beans', quantity: 2 },
       { id: 2, item: 'Filter papers', quantity: 1 },
     ]);
   });
   ```

3. Save the file. Watch `orders-api` in the Tilt dashboard. It updates within a few seconds.

4. Call your new endpoint:

   ```bash
   curl http://api.my-shop.localhost/api/orders/orders
   ```

## You should see

```json
[{"id":1,"item":"Coffee beans","quantity":2},{"id":2,"item":"Filter papers","quantity":1}]
```

You did not run a build, restart a container, or touch Docker.

## What just happened

`service.json` says `"watch": ["src/**/*"]`. When a file there changes, Tilt copies it into the running container and reloads the server. This is **live update**.

The URL has `orders` twice for a reason. The gateway removes the `/api/orders` prefix before the request reaches your API, so `/api/orders/orders` arrives as `/orders`. Your API never needs to know its public prefix.

## Try it yourself

- Change the `/` route's `version` to `'1.0.1'`, save, and call `http://api.my-shop.localhost/api/orders/`.
- Edit `services/shop/shop-web/src/App.tsx`, change the heading, save, and refresh the website.

## Ask your AI agent instead

```text
In my Flisk project, add a GET /orders endpoint to orders-api that returns two sample orders. Tell me the URL to call it, then call it and show me the answer. The stack is already running, so do not restart it.
```

## Checkpoint

- [ ] `/api/orders/orders` returns your two orders.
- [ ] You saw the Tilt dashboard update without a rebuild.
- [ ] You can say why the URL has `orders` twice.

## Stuck?

- **404:** check the route path in `index.ts` and use the `/api/orders` prefix.
- **Nothing updates:** save the file inside `src/`. Changes outside `dev.watch` do not trigger a live update.
- **A syntax error:** the service goes red in Tilt. Fix the file and save again.
