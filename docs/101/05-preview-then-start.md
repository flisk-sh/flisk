# Lab 5: Preview, then start

**Goal:** see what Flisk will run, then run it.
**Time:** 10 minutes. The first start is slower because Docker builds images. **Previous:** [Lab 4](04-add-a-website.md). **Next:** [Lab 6](06-see-it-run.md).

## Steps

1. Preview first. This starts nothing:

   ```bash
   flisk up shop --dry-run
   ```

2. Start the stack:

   ```bash
   flisk up shop
   ```

3. Leave it running. Open a second terminal for the next labs, in the same `my-shop` folder.

## You should see

The preview and the real start print the same service list and URLs first:

```text
Would start 2 services from stack "shop"...
  - orders-api
  - shop-web

🌍 Frontend URLs:
  - shop-web: http://app.my-shop.localhost/shop-web/health

🔧 Backend API URLs:
  - orders-api: http://api.my-shop.localhost/api/orders/health
Host ports: HTTP 80, HTTPS 443, Postgres 15432
Dry run - not starting services
```

With `flisk up shop` the first line reads `Starting 2 services from stack "shop"...`. Then Tilt takes over, builds the images, and starts the containers. The Tilt dashboard is at `http://localhost:10350`. Open it to watch each service turn green when it is healthy.

Your host ports can differ. If port 80 or Postgres's 5432 is busy, Flisk picks another from a range and tells you, and the URLs then include the port.

## What just happened

Before starting anything, Flisk did these steps:

1. Found both `service.json` files.
2. Wrote the files that run them: a Dockerfile per service, one Compose file for the stack, gateway routes, a health check for each service, and a database. You will look at these in Lab 9.
3. Told Tilt to build and run them.

You did not write any of those files. The first start builds images, so it takes a while. Later starts reuse them and are much faster.

## Ask your AI agent instead

```text
Use Flisk to show me a dry run of the shop stack, then start it with flisk up shop and tell me the URLs when it is ready.
```

## Checkpoint

- [ ] The dry run listed `orders-api` and `shop-web`.
- [ ] The Tilt dashboard shows both services healthy.

## Stuck?

- **`Environment is already running on port 10350`:** another Tilt is already running. Run `flisk down` in that project, or pass `--force` to replace this project's own run. `--force` never stops another project's Tilt.
- **Ports in use:** run `flisk doctor`, or set `FLISK_HTTP_PORT` to a free port.
- **A service stays red:** open it in the Tilt dashboard and read its log, or run `flisk logs --service <name>`.
