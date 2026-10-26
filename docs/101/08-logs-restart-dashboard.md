# Lab 8: Logs, restart, and the dashboard

**Goal:** look inside a running stack: read logs, restart one service, and use the terminal dashboard.
**Time:** 5 minutes. **Previous:** [Lab 7](07-change-code-see-it-live.md). **Next:** [Lab 9](09-generated-files-and-drift.md).

## Steps

1. Read the last 50 lines of your API's log:

   ```bash
   flisk logs --service orders-api --tail 50
   ```

2. Read only what happened in the last 5 minutes, for every service:

   ```bash
   flisk logs --since 5m
   ```

3. Restart one service without touching the others:

   ```bash
   flisk restart orders-api
   ```

4. Open the terminal dashboard:

   ```bash
   flisk ui
   ```

   Move with `↑` and `↓` (or `j` and `k`), press `/` to search, press `1` to `5` to switch tabs, and `q` to leave. Every key is in [the dashboard guide](../ui.md).

## You should see

- The logs include your API's startup banner, a line that says `orders-api running on http://localhost:` followed by its port.
- After the restart, `orders-api` goes briefly red or yellow in Tilt, then green. `shop-web` does not change.
- `flisk ui` lists your stacks and resources with their state.

## What just happened

`flisk logs` prints a snapshot, not a live stream. For a live stream, use the log pane in the Tilt dashboard. `flisk restart` restarts one resource through Tilt, so the rest of the stack keeps serving.

Both commands talk to Tilt on its default port, 10350. If yours runs on another port, add `--port <n>`.

## Ask your AI agent instead

```text
Show me the recent logs for orders-api, restart it, and confirm it came back healthy using flisk status.
```

Agents can also ask for JSON with `flisk logs --json` and `flisk restart orders-api --json`.

## Checkpoint

- [ ] You read a log line from `orders-api`.
- [ ] You restarted one service and the other kept running.
- [ ] You opened `flisk ui` and left it again.

## Stuck?

- **`No Tilt` or connection errors:** the stack is not running. Start it with `flisk up shop`.
- **Too much output:** lower `--tail` or narrow `--since`.
