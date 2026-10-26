# Lab 6: See it run

**Goal:** find your URLs and check that both services answer.
**Time:** 5 minutes. **Previous:** [Lab 5](05-preview-then-start.md). **Next:** [Lab 7](07-change-code-see-it-live.md).

Open a second terminal in `my-shop`. The stack from Lab 5 keeps running in the first one.

## Steps

1. Ask Flisk what is running:

   ```bash
   flisk status
   ```

2. List the gateway URLs:

   ```bash
   flisk networks --stack shop
   ```

3. Call the API's health check:

   ```bash
   curl http://api.my-shop.localhost/api/orders/health
   ```

4. Open the website in your browser:

   ```bash
   flisk open
   ```

## You should see

`flisk networks` lists each service with a status mark. A running service shows `✓`, a stopped one `✗`:

```text
📦  SHOP STACK
  ✓ orders-api              http://api.my-shop.localhost/api/orders
  ✓ shop-web                http://app.my-shop.localhost/shop-web
```

The API answers with its starter health response:

```json
{"status":"ok","service":"orders-api"}
```

`flisk open` opens the website in your browser. It shows the starter page, `shop-web`, "Frontend resource created with Flisk".

If Flisk had to move to another port, add it to every URL, for example `http://api.my-shop.localhost:8080/api/orders/health`.

## What just happened

You did not set up any hostnames. Flisk's gateway (Traefik) routes by name:

| Name | Goes to |
| --- | --- |
| `api.my-shop.localhost/api/orders` | `orders-api` |
| `app.my-shop.localhost/shop-web` | `shop-web` |

The pattern is `<service type>.<project>.localhost`. The `/api/orders` part comes from the service name, `orders-api`. Names ending in `.localhost` work on your machine only, and the gateway listens on `127.0.0.1`, so nobody else on your network can reach it.

## Ask your AI agent instead

```text
Use flisk status and flisk networks --stack shop to tell me which services are running and what URL each one has. Then call the orders API health check and show me the answer.
```

## Checkpoint

- [ ] `flisk networks --stack shop` shows both services with `✓`.
- [ ] The `curl` call returns `"status":"ok"`.
- [ ] You opened the website.

## Stuck?

- **`✗ ... [stopped]`:** the stack is not up. Start it with `flisk up shop` and wait for green in the Tilt dashboard.
- **`curl` cannot resolve the name:** use `curl -H "Host: api.my-shop.localhost" http://127.0.0.1/api/orders/health`, adding the port if Flisk chose one.
- **Machine-readable output:** `flisk status --json` and `flisk networks --json` print JSON. Agents use these.
