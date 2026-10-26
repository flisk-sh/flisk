# Lab 10: Change a service.json

**Goal:** change how a service runs by editing the one file you own, and watch Flisk update everything else.
**Time:** 10 minutes. **Previous:** [Lab 9](09-generated-files-and-drift.md). **Next:** [Lab 11](11-more-kinds-of-service.md).

## Steps

1. Open `services/shop/shop-web/service.json` and make the website wait for the API:

   ```json
   "dependsOn": ["orders-api"],
   ```

   Replace the existing `"dependsOn": [],` line. Keep the JSON valid.

2. Open `services/shop/orders-api/service.json` and change the port from `4000` to `4100`:

   ```json
   "port": 4100,
   ```

3. Ask Flisk whether anything is out of date:

   ```bash
   flisk config verify
   ```

4. Preview the start:

   ```bash
   flisk up shop --dry-run
   ```

5. If the stack is running, apply the change:

   ```bash
   flisk up shop --force
   ```

   `--force` replaces this project's own Tilt run. It never stops another project's.

## You should see

`flisk config verify` tells you your edit is newer than the generated files, and what to do:

```text
⚠️  Configuration issues found:
   - services/shop/orders-api/service.json: service.json changed since generated outputs were written (run flisk up)
```

The dry run still lists both services. `flisk resources --ports` now shows `orders-api` on port `4100`.

## What just happened

You edited two sources and Flisk regenerated what depends on them on the next `flisk up`: the Compose entry, the gateway routes, the health check, and the startup order. `dependsOn` makes Flisk start `orders-api` and wait for it to be healthy before it starts `shop-web`.

Compare this with the drift lab. A hand edit to a generated file is blocked. An edit to `service.json` is the supported way to change things, so Flisk accepts it and rebuilds the outputs.

## Try it yourself

- Put the port back to `4000` and run `flisk config verify` again. It flags the edit each time, until `flisk up` regenerates the outputs.
- Read the [service.json reference](../service-json.md) for every field you can set.

## Ask your AI agent instead

```text
Change orders-api to use port 4100 and make shop-web depend on orders-api. Edit only service.json files. Then run flisk config verify and flisk up shop --dry-run and tell me what Flisk says.
```

## Checkpoint

- [ ] `flisk config verify` noticed your `service.json` edit.
- [ ] `flisk resources --ports` shows the new port.
- [ ] You can say which file you edited and which files Flisk rewrote.

## Stuck?

- **A JSON error:** check commas and quotes in the file you edited.
- **`dependsOn` name not found:** use the resource name exactly, lowercase with hyphens.
- **The old port still answers:** run `flisk up shop --force` so the new settings take effect.
